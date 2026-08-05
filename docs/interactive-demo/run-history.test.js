"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_SAVED_RUNS,
  compareRuns,
  createRunRecord,
  loadRuns,
  saveRun
} = require("./run-history");

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
      { lab: "lab4", step: "pass", status: "pass" },
      { lab: "lab5", step: "task-2-todo", status: "todo" }
    ],
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
    events: [{ lab: "lab3", step: "pass", status: "pass" }],
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
});
