(() => {
  "use strict";

  const PRESENTATION_STORAGE_KEY = "os-demo.presentation-state.v1";
  const PRESENTATION_LABS = Object.freeze([
    "p0",
    "lab1",
    "lab2",
    "lab3",
    "lab4",
    "lab5",
    "lab6",
    "lab7"
  ]);
  const PRESENTATION_DIMENSIONS = Object.freeze([
    "sequence",
    "layers",
    "resources",
    "protection",
    "evidence"
  ]);
  const MAX_REPLAY_INDEX = 511;
  const RECOMMENDED_PRESENTATIONS = Object.freeze([
    Object.freeze({
      lab: "lab1",
      label: "Lab1 输出调用链",
      focus: "print_line、SBI ecall、OpenSBI 与 UART"
    }),
    Object.freeze({
      lab: "lab2",
      label: "Lab2 Trap 处理",
      focus: "stvec、scause、sepc 与 breakpoint"
    }),
    Object.freeze({
      lab: "lab4",
      label: "Lab4 虚拟内存",
      focus: "页表映射、PTE 权限与 satp"
    }),
    Object.freeze({
      lab: "lab5",
      label: "Lab5 任务切换",
      focus: "任务创建、yield 与上下文切换"
    })
  ]);

  function defaultPresentationState(enabled = false) {
    return {
      enabled: enabled === true,
      lab: "lab1",
      runId: null,
      replayIndex: -1,
      dimension: "sequence"
    };
  }

  function boundedText(value, limit) {
    if (typeof value !== "string") return "";
    return value
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, limit);
  }

  function normalizeReplayIndex(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return -1;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return -1;
    return Math.max(-1, Math.min(MAX_REPLAY_INDEX, Math.trunc(numeric)));
  }

  function normalizePresentationState(candidate = {}) {
    const source = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate
      : {};
    const lab = boundedText(source.lab, 20).toLowerCase();
    const dimension = boundedText(source.dimension, 40).toLowerCase();
    const runId = boundedText(source.runId, 120);
    return {
      enabled: source.enabled === true,
      lab: PRESENTATION_LABS.includes(lab) ? lab : "lab1",
      runId: runId || null,
      replayIndex: normalizeReplayIndex(source.replayIndex),
      dimension: PRESENTATION_DIMENSIONS.includes(dimension) ? dimension : "sequence"
    };
  }

  function parsePresentationRequest(search = "") {
    try {
      const parameters = new URLSearchParams(String(search || ""));
      const modeValue = parameters.get("mode");
      const mode = modeValue === "presentation" ? true : modeValue === "normal" ? false : null;
      if (mode !== true) return { mode, lab: null, runId: null };
      const labValue = boundedText(parameters.get("lab"), 20).toLowerCase();
      const runId = boundedText(parameters.get("run"), 120);
      return {
        mode,
        lab: recommendedPresentation(labValue)?.lab || null,
        runId: runId || null
      };
    } catch (_) {
      return { mode: null, lab: null, runId: null };
    }
  }

  function parsePresentationMode(search = "") {
    return parsePresentationRequest(search).mode;
  }

  function loadPresentationState(storage, search = "", key = PRESENTATION_STORAGE_KEY) {
    let restored = defaultPresentationState();
    try {
      if (storage && typeof storage.getItem === "function") {
        const raw = storage.getItem(key);
        if (raw) restored = normalizePresentationState(JSON.parse(raw));
      }
    } catch (_) {
      restored = defaultPresentationState();
    }
    const request = parsePresentationRequest(search);
    if (request.mode === null) return restored;
    if (request.mode === false) return { ...restored, enabled: false };
    return normalizePresentationState({
      ...restored,
      enabled: true,
      lab: request.lab || restored.lab,
      runId: request.runId || restored.runId
    });
  }

  function savePresentationState(storage, state, key = PRESENTATION_STORAGE_KEY) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(key, JSON.stringify(normalizePresentationState(state)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function updatePresentationState(current, patch = {}) {
    const base = normalizePresentationState(current);
    const changes = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
    return normalizePresentationState({ ...base, ...changes });
  }

  function resetPresentationState(enabled = true) {
    return defaultPresentationState(enabled);
  }

  function recommendedPresentation(lab) {
    const normalizedLab = boundedText(lab, 20).toLowerCase();
    return RECOMMENDED_PRESENTATIONS.find((entry) => entry.lab === normalizedLab) || null;
  }

  function runTime(run) {
    const endedAt = Number(run?.endedAt);
    if (Number.isFinite(endedAt) && endedAt >= 0) return endedAt;
    const startedAt = Number(run?.startedAt);
    return Number.isFinite(startedAt) && startedAt >= 0 ? startedAt : 0;
  }

  function isLocalRunForLab(run, lab) {
    return Boolean(
      run
      && typeof run === "object"
      && !Array.isArray(run)
      && boundedText(run.id, 120)
      && run.context
      && typeof run.context === "object"
      && run.context.lab === lab
      && Array.isArray(run.events)
    );
  }

  function selectRecommendedRuns(runs, lab) {
    const normalizedLab = boundedText(lab, 20).toLowerCase();
    if (!PRESENTATION_LABS.includes(normalizedLab)) {
      return { lab: null, replay: null, starter: null, solution: null };
    }
    const candidates = (Array.isArray(runs) ? runs : [])
      .map((run, index) => ({ run, index }))
      .filter(({ run }) => isLocalRunForLab(run, normalizedLab))
      .sort((left, right) => runTime(right.run) - runTime(left.run) || left.index - right.index)
      .map(({ run }) => run);
    const starter = candidates.find((run) => run.context.variant === "starter") || null;
    const solution = candidates.find((run) => run.context.variant === "solution") || null;
    return {
      lab: normalizedLab,
      replay: solution || starter || candidates[0] || null,
      starter,
      solution
    };
  }

  const api = {
    MAX_REPLAY_INDEX,
    PRESENTATION_DIMENSIONS,
    PRESENTATION_LABS,
    PRESENTATION_STORAGE_KEY,
    RECOMMENDED_PRESENTATIONS,
    defaultPresentationState,
    loadPresentationState,
    normalizePresentationState,
    parsePresentationMode,
    parsePresentationRequest,
    recommendedPresentation,
    resetPresentationState,
    savePresentationState,
    selectRecommendedRuns,
    updatePresentationState
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsPresentationMode = api;
})();
