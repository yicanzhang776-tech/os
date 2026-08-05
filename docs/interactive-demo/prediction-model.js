(() => {
  "use strict";

  const PREDICTION_VERSION = 2;
  const PREDICTION_STORAGE_KEY = "os-demo.pending-prediction.v1";
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const BUILD_RESULTS = new Set(["success", "failure"]);
  const RUN_RESULTS = new Set(["todo", "complete", "failure", "timeout"]);
  const OVERALL_LABELS = Object.freeze({
    consistent: "预测一致",
    partial: "部分一致",
    rethink: "需要重新理解",
    unable: "无法判断"
  });

  function text(value, limit = 1000) {
    return String(value ?? "").trim().slice(0, limit);
  }

  function catalogApi() {
    if (typeof module !== "undefined" && module.exports) return require("./event-catalog");
    return typeof window !== "undefined" ? window.OsEventCatalog : null;
  }

  function booleanOrNull(value) {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return null;
  }

  function normalizeEventKeys(values, lab) {
    const keys = [];
    const catalog = catalogApi()?.EVENT_CATALOG || null;
    for (const value of Array.from(values || []).slice(0, 128)) {
      const key = text(value, 120).toLowerCase();
      if (!/^(?:p0|lab[1-7]):[a-z0-9][a-z0-9-]{0,79}$/.test(key)) continue;
      if (lab && !key.startsWith(`${lab}:`)) continue;
      if (key.endsWith(":pass")) continue;
      if (catalog && !catalog[key]) continue;
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  function legacyFields(expectedResult) {
    if (expectedResult === "pass") {
      return { expectedBuild: "success", expectedRun: "complete", expectedPass: true };
    }
    if (expectedResult === "todo") {
      return { expectedBuild: "success", expectedRun: "todo", expectedPass: false };
    }
    return { expectedBuild: null, expectedRun: null, expectedPass: null };
  }

  function migratePrediction(candidate, context = null) {
    if (!candidate || typeof candidate !== "object") return null;
    const branch = text(candidate.branch || context?.branch, 120);
    const commit = text(candidate.commit || context?.commit, 80);
    const labCandidate = text(candidate.lab || context?.lab, 20).toLowerCase();
    const lab = /^(?:p0|lab[1-7])$/.test(labCandidate) ? labCandidate : null;
    const reasoning = text(candidate.reasoning, 1000);
    if (!branch || !commit || !reasoning) return null;

    const isStructured = Number(candidate.version) === PREDICTION_VERSION
      || candidate.expectedBuild !== undefined
      || candidate.expectedRun !== undefined
      || candidate.expectedPass !== undefined
      || candidate.expectedEvents !== undefined;
    const oldResult = text(candidate.expectedResult, 20).toLowerCase();
    const storedLegacyResult = text(candidate.legacyExpectedResult, 20).toLowerCase();
    const legacyExpectedResult = ["pass", "todo", "fail"].includes(oldResult)
      ? oldResult
      : ["pass", "todo", "fail"].includes(storedLegacyResult) ? storedLegacyResult : null;
    if (!isStructured && !["pass", "todo", "fail"].includes(oldResult)) return null;
    const persistedLegacyFailure = Number(candidate.migratedFrom) === 1
      && legacyExpectedResult === "fail";

    const legacy = isStructured ? null : legacyFields(oldResult);
    const buildCandidate = text(candidate.expectedBuild, 20).toLowerCase();
    const runCandidate = text(candidate.expectedRun, 20).toLowerCase();
    const expectedBuild = BUILD_RESULTS.has(buildCandidate)
      ? buildCandidate
      : legacy?.expectedBuild || null;
    const expectedRun = RUN_RESULTS.has(runCandidate)
      ? runCandidate
      : legacy?.expectedRun || null;
    const expectedPass = candidate.expectedPass !== undefined
      ? booleanOrNull(candidate.expectedPass)
      : legacy?.expectedPass ?? null;
    if (isStructured && !persistedLegacyFailure && (
      !BUILD_RESULTS.has(expectedBuild)
      || !RUN_RESULTS.has(expectedRun)
      || typeof expectedPass !== "boolean"
    )) return null;

    const compatibleResult = legacyExpectedResult
      ? legacyExpectedResult
      : { complete: "pass", todo: "todo", failure: "fail", timeout: "timeout" }[expectedRun] || null;
    return {
      version: PREDICTION_VERSION,
      expectedBuild,
      expectedRun,
      expectedEvents: normalizeEventKeys(candidate.expectedEvents, lab),
      expectedPass,
      reasoning,
      branch,
      commit,
      lab,
      savedAt: Number(candidate.savedAt) || Date.now(),
      expectedResult: compatibleResult,
      legacyExpectedResult,
      migratedFrom: !isStructured || Number(candidate.migratedFrom) === 1 ? 1 : null
    };
  }

  function createPrediction(input = {}, context = null) {
    const candidate = migratePrediction({ ...input, version: PREDICTION_VERSION }, context);
    if (!candidate) return null;
    if (!BUILD_RESULTS.has(candidate.expectedBuild)) return null;
    if (!RUN_RESULTS.has(candidate.expectedRun)) return null;
    if (typeof candidate.expectedPass !== "boolean") return null;
    return candidate;
  }

  function predictionMatchesContext(prediction, context) {
    return Boolean(
      prediction
      && context
      && prediction.branch === context.branch
      && prediction.commit === context.commit
    );
  }

  function loadPrediction(storage, context, key = PREDICTION_STORAGE_KEY) {
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      const raw = JSON.parse(storage.getItem(key) || "null");
      const prediction = migratePrediction(raw, context);
      if (!predictionMatchesContext(prediction, context)) return null;
      if (raw?.version !== PREDICTION_VERSION && typeof storage.setItem === "function") {
        storage.setItem(key, JSON.stringify(prediction));
      }
      return prediction;
    } catch (_) {
      return null;
    }
  }

  function storePrediction(storage, prediction, key = PREDICTION_STORAGE_KEY) {
    if (!storage) return false;
    try {
      if (!prediction) {
        if (typeof storage.removeItem === "function") storage.removeItem(key);
        return true;
      }
      if (typeof storage.setItem !== "function") return false;
      storage.setItem(key, JSON.stringify(prediction));
      return true;
    } catch (_) {
      return false;
    }
  }

  function validEvents(run, lab) {
    return Array.from(run?.events || []).filter((event) => (
      event
      && typeof event === "object"
      && event.protocol === EVENT_PROTOCOL
      && event.lab === lab
      && /^[a-z0-9][a-z0-9-]{0,79}$/.test(text(event.step, 80))
      && ["running", "todo", "pass", "fail"].includes(event.status)
    ));
  }

  function deriveActual(run, lab) {
    const events = validEvents(run, lab);
    const lifecycle = run?.lifecycle && typeof run.lifecycle === "object" ? run.lifecycle : {};
    const targetPass = events.some((event) => event.step === "pass" && event.status === "pass");
    const targetTodo = events.some((event) => event.status === "todo");
    const targetFail = events.some((event) => event.status === "fail");
    const qemuEvidence = events.length > 0
      || ["running", "finished", "failure", "timeout", "stopped"].includes(lifecycle.runResult);

    let build = BUILD_RESULTS.has(lifecycle.buildResult) ? lifecycle.buildResult : null;
    if (!build && qemuEvidence) build = "success";

    let runResult = null;
    if (targetFail) runResult = "failure";
    else if (targetPass) runResult = "complete";
    else if (targetTodo) runResult = "todo";
    else if (["failure", "timeout"].includes(lifecycle.runResult)) runResult = lifecycle.runResult;

    const ended = Boolean(
      lifecycle.completed
      || Number.isFinite(Number(run?.endedAt))
      || ["finished", "failure", "timeout", "stopped"].includes(lifecycle.runResult)
      || build === "failure"
    );
    const pass = targetPass ? true : ended ? false : null;
    return { build, runResult, pass, events, ended };
  }

  function eventName(key) {
    const catalog = catalogApi();
    const entry = catalog?.EVENT_CATALOG?.[key];
    return entry?.eventName || key;
  }

  function actualCatalogEvents(events, lab) {
    const catalog = catalogApi();
    const keys = [];
    for (const event of events) {
      const key = `${lab}:${event.step}`;
      if (event.step === "pass" || !catalog?.EVENT_CATALOG?.[key]) continue;
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  function addComparison(report, dimension, expected, actual, labels) {
    if (expected === null || expected === undefined) {
      report.omissions.push({ dimension, text: `${dimension}：旧版预测未提供这一项。` });
      return;
    }
    if (actual === null || actual === undefined) {
      report.unknown.push({ dimension, text: `${dimension}：没有足够运行证据，无法判断。` });
      return;
    }
    const expectedText = labels[expected] || String(expected);
    const actualText = labels[actual] || String(actual);
    if (expected === actual) {
      report.correct.push({ dimension, text: `${dimension}与实际一致：${actualText}。` });
    } else {
      report.opposites.push({ dimension, text: `${dimension}预测为“${expectedText}”，实际为“${actualText}”。` });
    }
  }

  function comparePrediction(candidate, run) {
    const prediction = migratePrediction(candidate, run?.context);
    const lab = prediction?.lab || run?.context?.lab || null;
    if (!prediction || !lab || !predictionMatchesContext(prediction, run?.context)) return null;

    const actual = deriveActual(run, lab);
    const report = {
      version: 1,
      lab,
      overall: "unable",
      overallLabel: OVERALL_LABELS.unable,
      actual: {
        build: actual.build,
        runResult: actual.runResult,
        pass: actual.pass,
        evidenceCount: actual.events.length
      },
      correct: [],
      omissions: [],
      missing: [],
      opposites: [],
      extraEvents: [],
      unknown: []
    };

    addComparison(report, "预计构建结果", prediction.expectedBuild, actual.build, {
      success: "构建成功",
      failure: "构建失败"
    });
    addComparison(report, "预计运行结果", prediction.expectedRun, actual.runResult, {
      todo: "停在 TODO",
      complete: "完成实验",
      failure: "运行失败",
      timeout: "QEMU 超时"
    });
    addComparison(report, "最终 PASS 标志", prediction.expectedPass, actual.pass, {
      true: "出现",
      false: "未出现"
    });
    if (prediction.legacyExpectedResult === "fail" && prediction.migratedFrom === 1) {
      const legacyActual = actual.build === "failure" || ["failure", "timeout"].includes(actual.runResult)
        ? "fail"
        : actual.runResult === "complete" ? "pass"
          : actual.runResult === "todo" ? "todo" : null;
      addComparison(report, "旧版总体结果", "fail", legacyActual, {
        fail: "构建或运行失败",
        pass: "出现 PASS",
        todo: "停在 TODO"
      });
    }

    const actualEventKeys = actualCatalogEvents(actual.events, lab);
    const expectedEventKeys = normalizeEventKeys(prediction.expectedEvents, lab);
    for (const key of expectedEventKeys) {
      if (actualEventKeys.includes(key)) {
        report.correct.push({ dimension: "关键事件", key, text: `预计事件已出现：${eventName(key)}。` });
      } else if (actual.ended) {
        report.missing.push({ dimension: "关键事件", key, text: `实际未出现：${eventName(key)}。` });
      } else {
        report.unknown.push({ dimension: "关键事件", key, text: `${eventName(key)}：运行证据尚未结束，无法判断。` });
      }
    }

    for (const key of actualEventKeys.filter((item) => !expectedEventKeys.includes(item))) {
      const item = { dimension: "关键事件", key, text: `运行中额外出现：${eventName(key)}。` };
      report.extraEvents.push(item);
      report.omissions.push({ ...item, text: `预测遗漏：${eventName(key)}。` });
    }

    const knownCount = report.correct.length + report.missing.length + report.opposites.length + report.extraEvents.length;
    if (knownCount === 0) report.overall = "unable";
    else if (report.opposites.length > 0) report.overall = "rethink";
    else if (report.missing.length > 0 || report.omissions.length > 0 || report.unknown.length > 0) report.overall = "partial";
    else report.overall = "consistent";
    report.overallLabel = OVERALL_LABELS[report.overall];
    return report;
  }

  const api = {
    BUILD_RESULTS,
    EVENT_PROTOCOL,
    OVERALL_LABELS,
    PREDICTION_STORAGE_KEY,
    PREDICTION_VERSION,
    RUN_RESULTS,
    comparePrediction,
    createPrediction,
    deriveActual,
    loadPrediction,
    migratePrediction,
    normalizeEventKeys,
    predictionMatchesContext,
    storePrediction
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsPredictionModel = api;
})();
