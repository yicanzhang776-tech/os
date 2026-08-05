(() => {
  "use strict";

  const RUN_HISTORY_VERSION = 1;
  const STORAGE_KEY = "os-demo.run-history.v1";
  const MAX_SAVED_RUNS = 12;
  const VALID_RESULTS = new Set(["pass", "todo", "fail", "timeout", "finished", "stopped"]);

  function predictionApi() {
    if (typeof module !== "undefined" && module.exports) return require("./prediction-model");
    return typeof window !== "undefined" ? window.OsPredictionModel : null;
  }

  function text(value, limit = 500) {
    return String(value || "").trim().slice(0, limit);
  }

  function normalizeContext(context = {}) {
    return {
      branch: text(context.branch, 120) || "unknown",
      commit: text(context.commit, 80) || "unknown",
      lab: /^lab[1-7]$|^p0$/.test(context.lab) ? context.lab : null,
      variant: text(context.variant, 40) || "custom",
      variantLabel: text(context.variantLabel, 80)
    };
  }

  function normalizePrediction(prediction = {}, context = null) {
    const model = predictionApi();
    if (model?.migratePrediction) return model.migratePrediction(prediction, context);
    const expectedResult = text(prediction.expectedResult, 20);
    const reasoning = text(prediction.reasoning, 1000);
    if (!VALID_RESULTS.has(expectedResult) || expectedResult === "finished" || expectedResult === "stopped") return null;
    if (!reasoning) return null;
    return {
      expectedResult,
      reasoning,
      branch: text(prediction.branch, 120),
      commit: text(prediction.commit, 80),
      savedAt: Number(prediction.savedAt) || Date.now()
    };
  }

  function normalizeLifecycle(lifecycle = {}) {
    const buildResult = ["success", "failure"].includes(lifecycle.buildResult)
      ? lifecycle.buildResult
      : null;
    const runResult = ["running", "finished", "failure", "timeout", "stopped"].includes(lifecycle.runResult)
      ? lifecycle.runResult
      : null;
    return {
      buildResult,
      runResult,
      completed: Boolean(lifecycle.completed)
    };
  }

  function normalizeEvent(event = {}) {
    const lab = text(event.lab, 20).toLowerCase();
    const step = text(event.step, 80).toLowerCase();
    const status = text(event.status, 20).toLowerCase();
    if (!/^lab[1-7]$|^p0$/.test(lab)) return null;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(step)) return null;
    if (!new Set(["running", "todo", "pass", "fail"]).has(status)) return null;
    return {
      protocol: text(event.protocol, 40) || "os-demo.event/v1",
      lab,
      step,
      status,
      detail: text(event.detail || event.raw || step, 500),
      source: text(event.source, 20) || "console",
      sequence: Number(event.sequence) || 0,
      timestamp: Number(event.timestamp) || 0
    };
  }

  function actualResult(events, input, context) {
    const targetEvents = context.lab ? events.filter((event) => event.lab === context.lab) : events;
    if (input.lifecycle?.runResult === "timeout") return "timeout";
    if (input.lifecycle?.buildResult === "failure" || input.lifecycle?.runResult === "failure") return "fail";
    if (input.error) return "fail";
    if (input.stopped) return "stopped";
    if (targetEvents.some((event) => event.status === "fail")) return "fail";
    if (targetEvents.some((event) => event.step === "pass" && event.status === "pass")) return "pass";
    if (targetEvents.some((event) => event.status === "todo")) return "todo";
    if (Number(input.exitCode) === 0) return "finished";
    return "fail";
  }

  function createRunRecord(input = {}) {
    const context = normalizeContext(input.context);
    const prediction = normalizePrediction(input.prediction, context);
    const events = Array.from(input.events || [], normalizeEvent).filter(Boolean).slice(0, 512);
    const lifecycle = normalizeLifecycle(input.lifecycle);
    const startedAt = Number(input.startedAt) || Date.now();
    const endedAt = Math.max(startedAt, Number(input.endedAt) || Date.now());
    const result = actualResult(events, { ...input, lifecycle }, context);
    const record = {
      version: RUN_HISTORY_VERSION,
      id: text(input.id, 120) || `local-${startedAt}`,
      context,
      prediction,
      events,
      lifecycle,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      exitCode: Number.isInteger(input.exitCode) ? input.exitCode : null,
      stopped: Boolean(input.stopped),
      error: text(input.error, 500),
      result,
      predictionMatches: null,
      predictionAssessment: null
    };
    const model = predictionApi();
    record.predictionAssessment = prediction && model?.comparePrediction
      ? model.comparePrediction(prediction, record)
      : null;
    record.predictionMatches = prediction?.migratedFrom === 1
      ? prediction.expectedResult === result
      : record.predictionAssessment?.overall === "consistent"
        ? true
        : record.predictionAssessment?.overall === "rethink"
          ? false
          : prediction ? prediction.expectedResult === result : null;
    return record;
  }

  function isRunRecord(value) {
    return Boolean(
      value
      && value.version === RUN_HISTORY_VERSION
      && value.id
      && value.context?.branch
      && Array.isArray(value.events)
      && Number.isFinite(value.startedAt)
      && VALID_RESULTS.has(value.result)
    );
  }

  function loadRuns(storage) {
    if (!storage || typeof storage.getItem !== "function") return [];
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isRunRecord).slice(0, MAX_SAVED_RUNS);
    } catch (_) {
      return [];
    }
  }

  function saveRun(storage, run) {
    if (!storage || typeof storage.setItem !== "function" || !isRunRecord(run)) return [];
    const next = [run, ...loadRuns(storage).filter((item) => item.id !== run.id)]
      .slice(0, MAX_SAVED_RUNS);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function deleteRun(storage, runId) {
    if (!storage || typeof storage.setItem !== "function") return [];
    const next = loadRuns(storage).filter((item) => item.id !== runId);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function indexedEvents(run) {
    const occurrences = new Map();
    return run.events
      .filter((event) => !run.context.lab || event.lab === run.context.lab)
      .map((event, index) => {
        const base = `${event.lab}:${event.step}`;
        const occurrence = (occurrences.get(base) || 0) + 1;
        occurrences.set(base, occurrence);
        return { key: `${base}:${occurrence}`, event, index };
      });
  }

  function compareRuns(first, second) {
    if (!isRunRecord(first) || !isRunRecord(second)) return null;
    const runs = [first, second];
    const starter = runs.find((run) => run.context.variant === "starter");
    const solution = runs.find((run) => run.context.variant === "solution");
    if (!starter || !solution || !starter.context.lab || starter.context.lab !== solution.context.lab) return null;

    const starterEvents = indexedEvents(starter);
    const solutionEvents = indexedEvents(solution);
    const starterMap = new Map(starterEvents.map((item) => [item.key, item]));
    const solutionMap = new Map(solutionEvents.map((item) => [item.key, item]));
    const keys = [
      ...starterEvents.map((item) => item.key),
      ...solutionEvents.map((item) => item.key).filter((key) => !starterMap.has(key))
    ];
    const rows = keys.map((key) => {
      const left = starterMap.get(key) || null;
      const right = solutionMap.get(key) || null;
      return {
        key,
        scope: left && right ? "shared" : left ? "starter-only" : "solution-only",
        starter: left?.event || null,
        solution: right?.event || null,
        starterIndex: left?.index ?? null,
        solutionIndex: right?.index ?? null
      };
    });
    return {
      lab: starter.context.lab,
      starter,
      solution,
      rows,
      shared: rows.filter((row) => row.scope === "shared").length,
      starterOnly: rows.filter((row) => row.scope === "starter-only").length,
      solutionOnly: rows.filter((row) => row.scope === "solution-only").length
    };
  }

  const api = {
    MAX_SAVED_RUNS,
    RUN_HISTORY_VERSION,
    STORAGE_KEY,
    compareRuns,
    createRunRecord,
    deleteRun,
    isRunRecord,
    loadRuns,
    saveRun
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsRunHistory = api;
})();
