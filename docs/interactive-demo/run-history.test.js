"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_SAVED_RUNS,
  MAX_STABLE_OUTPUT_LINES,
  STORAGE_KEY,
  compareRuns,
  createRunRecord,
  loadRuns,
  saveRun
} = require("./run-history");
const { resolveEventKnowledge } = require("./event-catalog");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

function run(variant, steps, id = variant) {
  return createRunRecord({
    id,
    context: { branch: `lab2-${variant}`, commit: "abc1234", lab: "lab2", variant },
    prediction: {
      expectedResult: variant === "starter" ? "todo" : "pass",
      reasoning: "我预测会在 trap 返回路径看到差异。",
      branch: `lab2-${variant}`
    },
    events: steps.map((step, index) => ({
      protocol: "os-demo.event/v1",
      lab: "lab2",
      step,
      status: step === "pass" ? "pass" : step.includes("missing") ? "todo" : "running",
      sequence: index + 1,
      timestamp: 1000 + index
    })),
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
}

test("a saved run keeps the prediction and complete event order", () => {
  const record = run("solution", ["stvec-installed", "breakpoint-handled", "pass"]);
  assert.equal(record.prediction.expectedResult, "pass");
  assert.deepEqual(record.events.map((event) => event.step), ["stvec-installed", "breakpoint-handled", "pass"]);
  assert.equal(record.result, "pass");
  assert.equal(record.predictionMatches, true);
  assert.equal(record.durationMs, 1000);
});

test("the result is based on the current lab instead of inherited PASS events", () => {
  const record = createRunRecord({
    id: "lab5-starter",
    context: { branch: "lab5-starter", lab: "lab5", variant: "starter" },
    events: [
      { protocol: "os-demo.event/v1", lab: "lab4", step: "pass", status: "pass" },
      { protocol: "os-demo.event/v1", lab: "lab5", step: "task-2-todo", status: "todo" }
    ],
    exitCode: 0
  });
  assert.equal(record.result, "todo");
});

test("a starter TODO cannot be promoted to complete by a conflicting PASS event", () => {
  const record = createRunRecord({
    id: "lab5-starter-conflicting-evidence",
    context: { branch: "lab5-starter", lab: "lab5", variant: "starter" },
    events: [
      { protocol: "os-demo.event/v1", lab: "lab5", step: "task-2-todo", status: "todo" },
      { protocol: "os-demo.event/v1", lab: "lab5", step: "pass", status: "pass" }
    ],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    exitCode: 0
  });
  assert.equal(record.result, "todo");
});

test("local run storage is bounded and replaces the same run id", () => {
  const local = storage();
  for (let index = 0; index < MAX_SAVED_RUNS + 3; index += 1) {
    saveRun(local, run("starter", ["stvec-missing"], `run-${index}`));
  }
  assert.equal(loadRuns(local).length, MAX_SAVED_RUNS);
  const replacement = run("starter", ["breakpoint-missing"], "run-5");
  saveRun(local, replacement);
  assert.equal(loadRuns(local).filter((item) => item.id === "run-5").length, 1);
  assert.equal(loadRuns(local)[0].events[0].step, "breakpoint-missing");
});

test("stable diagnostic output is bounded, sanitized and survives local storage", () => {
  const local = storage();
  const record = createRunRecord({
    id: "stable-output",
    context: { branch: "lab7-solution", lab: "lab7", variant: "solution" },
    events: [],
    stableOutput: [
      ...Array.from({ length: MAX_STABLE_OUTPUT_LINES + 4 }, (_, index) => `[Lab7] line ${index}`),
      "<script>bad()</script> C:\\Users\\Alice glpat-abcdefghijklmnop"
    ],
    startedAt: 1000,
    endedAt: 2000,
    stopped: true
  });
  saveRun(local, record);
  const [loaded] = loadRuns(local);

  assert.equal(loaded.stableOutput.length, MAX_STABLE_OUTPUT_LINES);
  assert.doesNotMatch(JSON.stringify(loaded.stableOutput), /<script>|Alice|glpat-abcdefghijklmnop/);
  assert.match(JSON.stringify(loaded.stableOutput), /已移除HTML|本地用户|已移除访问令牌/);

  const legacy = run("solution", ["pass"], "legacy-without-stable-output");
  delete legacy.stableOutput;
  local.setItem(STORAGE_KEY, JSON.stringify([legacy]));
  assert.deepEqual(loadRuns(local)[0].stableOutput, []);
});

test("starter and solution comparison exposes shared and branch-only evidence", () => {
  const starter = run("starter", ["stvec-missing", "breakpoint-missing"]);
  const solution = run("solution", ["stvec-installed", "breakpoint-handled", "pass"]);
  const comparison = compareRuns(starter, solution);
  assert.equal(comparison.lab, "lab2");
  assert.equal(comparison.shared, 0);
  assert.equal(comparison.starterOnly, 2);
  assert.equal(comparison.solutionOnly, 3);
  assert.equal(comparison.rows[0].scope, "starter-only");
});

test("comparison rejects runs from different experiments", () => {
  const starter = run("starter", ["stvec-missing"]);
  const other = createRunRecord({
    id: "lab3-solution",
    context: { branch: "lab3-solution", lab: "lab3", variant: "solution" },
    events: [{ protocol: "os-demo.event/v1", lab: "lab3", step: "pass", status: "pass" }],
    exitCode: 0
  });
  assert.equal(compareRuns(starter, other), null);
});

test("a completed run keeps structured prediction and lifecycle assessment", () => {
  const record = createRunRecord({
    id: "lab2-starter-structured",
    context: { branch: "lab2-starter", commit: "abc1234", lab: "lab2", variant: "starter" },
    prediction: {
      version: 2,
      expectedBuild: "success",
      expectedRun: "todo",
      expectedEvents: ["lab2:stvec-missing", "lab2:breakpoint-missing"],
      expectedPass: false,
      reasoning: "starter 应保留两个明确的教学停点。",
      branch: "lab2-starter",
      commit: "abc1234",
      lab: "lab2"
    },
    events: [
      { protocol: "os-demo.event/v1", lab: "lab2", step: "stvec-missing", status: "todo", sequence: 1 },
      { protocol: "os-demo.event/v1", lab: "lab2", step: "breakpoint-missing", status: "todo", sequence: 2 }
    ],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  assert.equal(record.prediction.version, 2);
  assert.equal(record.lifecycle.buildResult, "success");
  assert.equal(record.predictionAssessment.overall, "consistent");
  assert.equal(record.predictionMatches, true);
  assert.deepEqual(record.events.map((event) => event.timestamp), [null, null]);
});

test("missing or incompatible protocols are not promoted to v1 evidence", () => {
  const record = createRunRecord({
    id: "missing-protocol",
    context: { branch: "lab2-starter", commit: "abc1234", lab: "lab2", variant: "starter" },
    prediction: {
      version: 2,
      expectedBuild: "success",
      expectedRun: "todo",
      expectedEvents: ["lab2:stvec-missing"],
      expectedPass: false,
      reasoning: "需要真实 v1 事件才能确认 TODO。",
      branch: "lab2-starter",
      commit: "abc1234",
      lab: "lab2"
    },
    events: [
      { lab: "lab2", step: "stvec-missing", status: "todo" },
      { protocol: "os-demo.event/v0", lab: "lab2", step: "stvec-missing", status: "todo" }
    ],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  assert.equal(record.events.length, 0);
  assert.notEqual(record.predictionAssessment.overall, "consistent");
  assert.ok(record.predictionAssessment.unknown.some((item) => item.dimension === "预计运行结果"));
});

test("stored runs are deeply validated and malformed assessments are recomputed", () => {
  const local = storage();
  const valid = run("solution", ["stvec-installed", "breakpoint-handled", "pass"], "valid-history");
  const malformedEvent = structuredClone(valid);
  malformedEvent.id = "malformed-event";
  malformedEvent.events = [null, { lab: "lab2", step: "pass", status: "pass" }];
  const repairedAssessment = structuredClone(valid);
  repairedAssessment.id = "repaired-assessment";
  repairedAssessment.predictionAssessment = {};
  local.setItem(STORAGE_KEY, JSON.stringify([malformedEvent, repairedAssessment]));

  const loaded = loadRuns(local);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "repaired-assessment");
  assert.equal(loaded[0].predictionAssessment.overall, valid.predictionAssessment.overall);
  assert.equal(loaded[0].predictionAssessment.actual.evidenceCount, 3);
});

test("save, load and replay preserve event explanations and prediction assessment", () => {
  const local = storage();
  const original = run("solution", ["stvec-installed", "breakpoint-handled", "pass"], "round-trip");
  saveRun(local, original);
  const [loaded] = loadRuns(local);

  assert.deepEqual(loaded.events, original.events);
  assert.deepEqual(loaded.predictionAssessment, original.predictionAssessment);
  loaded.events.forEach((event, index) => {
    assert.deepEqual(resolveEventKnowledge(event), resolveEventKnowledge(original.events[index]));
  });
});
