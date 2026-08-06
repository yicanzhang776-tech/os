(() => {
  "use strict";

  const RUN_HISTORY_VERSION = 1;
  const STORAGE_KEY = "os-demo.run-history.v1";
  const MAX_SAVED_RUNS = 12;
  const MAX_STABLE_OUTPUT_LINES = 60;
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const VALID_RESULTS = new Set(["pass", "todo", "fail", "timeout", "finished", "stopped"]);
  const VALID_EVENT_STATUSES = new Set(["running", "todo", "pass", "fail"]);

  function predictionApi() {
    if (typeof module !== "undefined" && module.exports) return require("./prediction-model");
    return typeof window !== "undefined" ? window.OsPredictionModel : null;
  }

  function text(value, limit = 500) {
    return String(value || "").trim().slice(0, limit);
  }

  function stableOutputText(value, limit = 500) {
    return String(value ?? "")
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/<[^>]*>/g, "[已移除HTML]")
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_-]+|glpat-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+)\b/g, "[已移除访问令牌]")
      .replace(/\b(Bearer\s+)[^\s,;]+/gi, "$1[已移除访问令牌]")
      .replace(/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi, "C:\\Users\\[本地用户]")
      .replace(/\/(?:home|Users)\/[^/\s]+/g, "/home/[本地用户]")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, limit);
  }

  function normalizeStableOutput(value) {
    if (!Array.isArray(value)) return [];
    return value
      .slice(-MAX_STABLE_OUTPUT_LINES)
      .map((item) => stableOutputText(item?.line ?? item))
      .filter(Boolean);
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

  function normalizeEvent(event) {
    if (!event || typeof event !== "object") return null;
    const protocol = text(event.protocol, 40);
    const lab = text(event.lab, 20).toLowerCase();
    const step = text(event.step, 80).toLowerCase();
    const status = text(event.status, 20).toLowerCase();
    const sequence = Number(event.sequence);
    const hasTimestamp = event.timestamp !== null
      && event.timestamp !== undefined
      && event.timestamp !== "";
    const timestamp = hasTimestamp ? Number(event.timestamp) : null;
    if (protocol !== EVENT_PROTOCOL) return null;
    if (!/^lab[1-7]$|^p0$/.test(lab)) return null;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(step)) return null;
    if (!VALID_EVENT_STATUSES.has(status)) return null;
    return {
      protocol,
      lab,
      step,
      status,
      detail: text(event.detail || event.raw || step, 500),
      source: text(event.source, 20) || "console",
      sequence: Number.isInteger(sequence) && sequence >= 0 ? sequence : 0,
      timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null
    };
  }

  function actualResult(events, input, context) {
    const targetEvents = context.lab ? events.filter((event) => event.lab === context.lab) : events;
    if (input.lifecycle?.runResult === "timeout") return "timeout";
    if (input.lifecycle?.buildResult === "failure" || input.lifecycle?.runResult === "failure") return "fail";
    if (input.error) return "fail";
    if (input.stopped) return "stopped";
    if (targetEvents.some((event) => event.status === "fail")) return "fail";
    if (targetEvents.some((event) => event.status === "todo")) return "todo";
    if (targetEvents.some((event) => event.step === "pass" && event.status === "pass")) return "pass";
    if (Number(input.exitCode) === 0) return "finished";
    return "fail";
  }

  function createRunRecord(input = {}) {
    const context = normalizeContext(input.context);
    const prediction = normalizePrediction(input.prediction, context);
    const events = (Array.isArray(input.events) ? input.events : [])
      .map(normalizeEvent)
      .filter(Boolean)
      .slice(0, 512);
    const lifecycle = normalizeLifecycle(input.lifecycle);
    const stableOutput = normalizeStableOutput(input.stableOutput);
    const startedAt = Number(input.startedAt) || Date.now();
    const endedAt = Math.max(startedAt, Number(input.endedAt) || Date.now());
    const result = actualResult(events, { ...input, lifecycle }, context);
    const record = {
      version: RUN_HISTORY_VERSION,
      id: text(input.id, 120) || `local-${startedAt}`,
      context,
      prediction,
      events,
      stableOutput,
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

  function normalizeStoredRunRecord(value) {
    if (!value || typeof value !== "object" || value.version !== RUN_HISTORY_VERSION) return null;
    if (!text(value.id, 120) || !value.context || typeof value.context !== "object") return null;
    if (!text(value.context.branch, 120) || !Array.isArray(value.events)) return null;
    if (!Number.isFinite(Number(value.startedAt)) || !Number.isFinite(Number(value.endedAt))) return null;

    const context = normalizeContext(value.context);
    const events = value.events.map(normalizeEvent);
    if (events.some((event) => !event)) return null;

    const prediction = value.prediction == null ? null : normalizePrediction(value.prediction, context);
    if (value.prediction != null && !prediction) return null;
    const model = predictionApi();
    if (prediction && model?.predictionMatchesContext && !model.predictionMatchesContext(prediction, context)) {
      return null;
    }

    return createRunRecord({
      id: value.id,
      context,
      prediction,
      events,
      stableOutput: normalizeStableOutput(value.stableOutput),
      lifecycle: normalizeLifecycle(value.lifecycle),
      startedAt: Number(value.startedAt),
      endedAt: Number(value.endedAt),
      exitCode: Number.isInteger(value.exitCode) ? value.exitCode : null,
      stopped: Boolean(value.stopped),
      error: text(value.error, 500)
    });
  }

  function isRunRecord(value) {
    return Boolean(normalizeStoredRunRecord(value));
  }

  function loadRuns(storage) {
    if (!storage || typeof storage.getItem !== "function") return [];
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(normalizeStoredRunRecord)
        .filter(Boolean)
        .slice(0, MAX_SAVED_RUNS);
    } catch (_) {
      return [];
    }
  }

  function saveRun(storage, run) {
    if (!storage || typeof storage.setItem !== "function") return [];
    const normalized = normalizeStoredRunRecord(run);
    if (!normalized) return [];
    const next = [normalized, ...loadRuns(storage).filter((item) => item.id !== normalized.id)]
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
      .map((event, originalIndex) => ({ event, originalIndex }))
      .filter(({ event }) => !run.context.lab || event.lab === run.context.lab)
      .map(({ event, originalIndex }) => {
        const base = `${event.lab}:${event.step}`;
        const occurrence = (occurrences.get(base) || 0) + 1;
        occurrences.set(base, occurrence);
        return { key: `${base}:${occurrence}`, event, index: originalIndex };
      });
  }

  function compareRuns(first, second) {
    const normalizedFirst = normalizeStoredRunRecord(first);
    const normalizedSecond = normalizeStoredRunRecord(second);
    if (!normalizedFirst || !normalizedSecond) return null;
    const runs = [normalizedFirst, normalizedSecond];
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
    MAX_STABLE_OUTPUT_LINES,
    RUN_HISTORY_VERSION,
    STORAGE_KEY,
    compareRuns,
    createRunRecord,
    deleteRun,
    isRunRecord,
    loadRuns,
    normalizeStableOutput,
    normalizeStoredRunRecord,
    saveRun
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsRunHistory = api;
})();
