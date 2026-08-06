"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_REPLAY_INDEX,
  PRESENTATION_STORAGE_KEY,
  RECOMMENDED_PRESENTATIONS,
  loadPresentationState,
  normalizePresentationState,
  parsePresentationMode,
  parsePresentationRequest,
  recommendedPresentation,
  resetPresentationState,
  savePresentationState,
  selectRecommendedRuns,
  updatePresentationState
} = require("./presentation-mode");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key) ?? null
  };
}

function localRun(id, lab, variant, endedAt) {
  return {
    id,
    context: { branch: `${lab}-${variant}`, lab, variant },
    events: [],
    startedAt: endedAt - 100,
    endedAt
  };
}

test("URL mode is strict and supports an explicit normal mode", () => {
  assert.equal(parsePresentationMode("?mode=presentation"), true);
  assert.equal(parsePresentationMode("?mode=normal"), false);
  assert.equal(parsePresentationMode("?mode=Presentation"), null);
  assert.equal(parsePresentationMode("?mode=presentation-extra"), null);
  assert.equal(parsePresentationMode("?other=presentation"), null);
});

test("presentation URLs may select only a recommended Lab and a local run reference", () => {
  assert.deepEqual(parsePresentationRequest("?mode=presentation&lab=lab4&run=local-run-4&branch=lab4-solution"), {
    mode: true,
    lab: "lab4",
    runId: "local-run-4"
  });
  assert.deepEqual(parsePresentationRequest("?mode=presentation&lab=lab7&run="), {
    mode: true,
    lab: null,
    runId: null
  });
  assert.deepEqual(parsePresentationRequest("?mode=normal&lab=lab4&run=ignored"), {
    mode: false,
    lab: null,
    runId: null
  });
});

test("an explicit URL mode overrides only the restored enabled flag", () => {
  const stored = {
    enabled: false,
    lab: "lab4",
    runId: "local-lab4-run",
    replayIndex: 18,
    dimension: "protection"
  };
  const storage = memoryStorage({ [PRESENTATION_STORAGE_KEY]: JSON.stringify(stored) });

  assert.deepEqual(loadPresentationState(storage, "?mode=presentation"), {
    ...stored,
    enabled: true
  });
  assert.equal(loadPresentationState(storage, "?mode=normal").enabled, false);
  assert.deepEqual(loadPresentationState(storage, "?mode=unknown"), stored);
  assert.deepEqual(loadPresentationState(storage, "?mode=presentation&lab=lab5&run=local-lab5-run"), {
    ...stored,
    enabled: true,
    lab: "lab5",
    runId: "local-lab5-run"
  });
  assert.equal(loadPresentationState(storage, "?mode=presentation&lab=lab7").lab, "lab4");
});

test("missing, damaged and inaccessible session storage safely use defaults", () => {
  const damaged = memoryStorage({ [PRESENTATION_STORAGE_KEY]: "{bad json" });
  assert.deepEqual(loadPresentationState(damaged), resetPresentationState(false));
  assert.deepEqual(loadPresentationState(null), resetPresentationState(false));
  assert.deepEqual(loadPresentationState({ getItem: () => { throw new Error("blocked"); } }), resetPresentationState(false));
});

test("normalization applies the Lab allowlist and clamps replay positions", () => {
  assert.deepEqual(normalizePresentationState({
    enabled: true,
    lab: "lab9",
    runId: "\u0000  run-1  ",
    replayIndex: 9999,
    dimension: "unknown",
    playing: true,
    fullscreen: true
  }), {
    enabled: true,
    lab: "lab1",
    runId: "run-1",
    replayIndex: MAX_REPLAY_INDEX,
    dimension: "sequence"
  });
  assert.equal(normalizePresentationState({ replayIndex: -40 }).replayIndex, -1);
  assert.equal(normalizePresentationState({ replayIndex: 4.8 }).replayIndex, 4);
  assert.equal(normalizePresentationState({ lab: "lab6", replayIndex: null }).lab, "lab6");
  assert.equal(normalizePresentationState({ replayIndex: null }).replayIndex, -1);
});

test("saving persists only stable presentation fields", () => {
  const storage = memoryStorage();
  assert.equal(savePresentationState(storage, {
    enabled: true,
    lab: "lab5",
    runId: "run-5",
    replayIndex: 7,
    dimension: "resources",
    playing: true,
    speed: 4,
    fullscreen: true,
    debug: "not persisted"
  }), true);
  assert.deepEqual(JSON.parse(storage.value(PRESENTATION_STORAGE_KEY)), {
    enabled: true,
    lab: "lab5",
    runId: "run-5",
    replayIndex: 7,
    dimension: "resources"
  });
  assert.equal(savePresentationState({ setItem: () => { throw new Error("quota"); } }, {}), false);
});

test("updates are normalized and reset returns a deterministic Lab1 view", () => {
  const current = {
    enabled: true,
    lab: "lab2",
    runId: "run-2",
    replayIndex: 20,
    dimension: "evidence"
  };
  assert.deepEqual(updatePresentationState(current, { lab: "lab4", replayIndex: 3 }), {
    ...current,
    lab: "lab4",
    replayIndex: 3
  });
  assert.deepEqual(resetPresentationState(), {
    enabled: true,
    lab: "lab1",
    runId: null,
    replayIndex: -1,
    dimension: "sequence"
  });
});

test("recommended entries are limited to Lab1, Lab2, Lab4 and Lab5", () => {
  assert.deepEqual(RECOMMENDED_PRESENTATIONS.map((entry) => entry.lab), ["lab1", "lab2", "lab4", "lab5"]);
  assert.equal(recommendedPresentation("LAB4").lab, "lab4");
  assert.equal(recommendedPresentation("lab3"), null);
  assert.ok(RECOMMENDED_PRESENTATIONS.every((entry) => entry.label && entry.focus));
});

test("recommended run selection prefers the newest solution and keeps both roles", () => {
  const oldSolution = localRun("solution-old", "lab2", "solution", 200);
  const starter = localRun("starter-new", "lab2", "starter", 500);
  const solution = localRun("solution-new", "lab2", "solution", 400);
  const custom = localRun("custom-newest", "lab2", "custom", 900);
  const selection = selectRecommendedRuns([oldSolution, starter, solution, custom], "lab2");

  assert.equal(selection.lab, "lab2");
  assert.equal(selection.replay.id, "solution-new");
  assert.equal(selection.starter.id, "starter-new");
  assert.equal(selection.solution.id, "solution-new");
});

test("run selection ignores malformed and wrong-Lab records without mutating input", () => {
  const runs = [
    localRun("lab1-starter", "lab1", "starter", 100),
    localRun("lab4-solution", "lab4", "solution", 300),
    { id: "missing-events", context: { lab: "lab1", variant: "solution" } },
    null
  ];
  const snapshot = structuredClone(runs);
  const selection = selectRecommendedRuns(runs, "lab1");

  assert.equal(selection.replay.id, "lab1-starter");
  assert.equal(selection.solution, null);
  assert.deepEqual(runs, snapshot);
  assert.deepEqual(selectRecommendedRuns(runs, "lab9"), {
    lab: null,
    replay: null,
    starter: null,
    solution: null
  });
});

test("any experiment Lab can restore an imported local run", () => {
  const lab6 = localRun("imported-lab6", "lab6", "custom", 600);
  const selection = selectRecommendedRuns([lab6], "lab6");
  assert.equal(selection.lab, "lab6");
  assert.equal(selection.replay, lab6);
  assert.equal(selection.starter, null);
  assert.equal(selection.solution, null);
});

test("the state module has no run, network or branch-switch side effects", () => {
  const source = fs.readFileSync(path.join(__dirname, "presentation-mode.js"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|\bWebSocket\b|\/api\/run|\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bQEMU\b|git\s+switch|git\s+checkout/i);
  assert.doesNotMatch(source, /localStorage|document\.|requestFullscreen/);
});
