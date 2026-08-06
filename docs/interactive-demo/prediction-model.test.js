"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PREDICTION_STORAGE_KEY,
  PREDICTION_VERSION,
  comparePrediction,
  createPrediction,
  loadPrediction,
  migratePrediction
} = require("./prediction-model");

const context = {
  branch: "lab2-starter",
  commit: "abc1234",
  lab: "lab2",
  variant: "starter"
};

function storage(initial = null) {
  const values = new Map();
  if (initial !== null) values.set(PREDICTION_STORAGE_KEY, JSON.stringify(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: () => JSON.parse(values.get(PREDICTION_STORAGE_KEY) || "null")
  };
}

function event(step, status = "running", sequence = 1) {
  return {
    protocol: "os-demo.event/v1",
    lab: "lab2",
    step,
    status,
    detail: step,
    sequence,
    timestamp: sequence * 100
  };
}

function prediction(overrides = {}) {
  return createPrediction({
    expectedBuild: "success",
    expectedRun: "todo",
    expectedEvents: ["lab2:stvec-missing", "lab2:breakpoint-missing"],
    expectedPass: false,
    reasoning: "starter 应保留明确的 TODO 教学停点。",
    ...overrides
  }, context);
}

function run(events, lifecycle = { buildResult: "success", runResult: "finished", completed: true }) {
  return {
    context,
    events,
    lifecycle,
    startedAt: 100,
    endedAt: 500
  };
}

test("legacy predictions migrate in place without losing the reasoning text", () => {
  const local = storage({
    expectedResult: "todo",
    reasoning: "我预计 starter 会停在 TODO。",
    branch: context.branch,
    commit: context.commit,
    savedAt: 10
  });
  const migrated = loadPrediction(local, context);
  assert.equal(migrated.version, PREDICTION_VERSION);
  assert.equal(migrated.expectedBuild, "success");
  assert.equal(migrated.expectedRun, "todo");
  assert.equal(migrated.expectedPass, false);
  assert.equal(migrated.reasoning, "我预计 starter 会停在 TODO。");
  assert.equal(local.value().version, PREDICTION_VERSION);
});

test("ambiguous legacy failure remains readable without inventing build or run evidence", () => {
  const migrated = migratePrediction({
    expectedResult: "fail",
    reasoning: "旧版只能表达构建或运行失败。",
    branch: context.branch,
    commit: context.commit
  }, context);
  assert.equal(migrated.legacyExpectedResult, "fail");
  assert.equal(migrated.expectedBuild, null);
  assert.equal(migrated.expectedRun, null);
  assert.equal(migrated.expectedPass, null);

  const assessment = comparePrediction(migrated, run([], {
    buildResult: "failure",
    runResult: null,
    completed: true
  }));
  assert.ok(assessment.correct.some((item) => item.dimension === "旧版总体结果"));
  assert.ok(assessment.omissions.some((item) => item.dimension === "预计构建结果"));
  const local = storage(migrated);
  assert.equal(loadPrediction(local, context).legacyExpectedResult, "fail");
});

test("starter TODO is a correct structured prediction when real events support it", () => {
  const assessment = comparePrediction(prediction(), run([
    event("stvec-missing", "todo", 1),
    event("breakpoint-missing", "todo", 2)
  ]));
  assert.equal(assessment.overall, "consistent");
  assert.equal(assessment.opposites.length, 0);
  assert.equal(assessment.missing.length, 0);
  assert.ok(assessment.correct.some((item) => item.dimension === "预计运行结果"));
  assert.ok(assessment.correct.some((item) => item.dimension === "最终 PASS 标志"));
});

test("conflicting PASS evidence cannot override a starter TODO", () => {
  const assessment = comparePrediction(prediction(), run([
    event("task-2-todo", "todo", 1),
    event("pass", "pass", 2)
  ]));
  assert.equal(assessment.actual.runResult, "todo");
  assert.equal(assessment.actual.pass, false);
});

test("comparison separates missing, opposite, omitted and extra event evidence", () => {
  const assessment = comparePrediction(prediction({
    expectedRun: "complete",
    expectedPass: true,
    expectedEvents: ["lab2:stvec-installed", "lab2:breakpoint-handled"]
  }), run([
    event("stvec-installed", "running", 1),
    event("breakpoint-triggered", "running", 2),
    event("task-2-todo", "todo", 3)
  ]));
  assert.equal(assessment.overall, "rethink");
  assert.ok(assessment.correct.some((item) => item.key === "lab2:stvec-installed"));
  assert.ok(assessment.missing.some((item) => item.key === "lab2:breakpoint-handled"));
  assert.ok(assessment.opposites.some((item) => item.dimension === "预计运行结果"));
  assert.ok(assessment.opposites.some((item) => item.dimension === "最终 PASS 标志"));
  assert.ok(assessment.extraEvents.some((item) => item.key === "lab2:breakpoint-triggered"));
  assert.ok(assessment.omissions.some((item) => item.key === "lab2:breakpoint-triggered"));
});

test("missing build and QEMU evidence is reported as unable instead of guessed", () => {
  const incompleteRun = {
    context,
    events: [],
    lifecycle: { buildResult: null, runResult: null, completed: false }
  };
  const assessment = comparePrediction(prediction(), incompleteRun);
  assert.equal(assessment.overall, "unable");
  assert.ok(assessment.unknown.some((item) => item.dimension === "预计构建结果"));
  assert.ok(assessment.unknown.some((item) => item.dimension === "预计运行结果"));
});

test("timeout comparison requires explicit lifecycle evidence", () => {
  const expectedTimeout = prediction({ expectedRun: "timeout", expectedEvents: [] });
  const timeout = comparePrediction(expectedTimeout, run([], {
    buildResult: "success",
    runResult: "timeout",
    completed: true
  }));
  assert.ok(timeout.correct.some((item) => item.dimension === "预计运行结果"));

  const noEvidence = comparePrediction(expectedTimeout, {
    context,
    events: [],
    lifecycle: { completed: false }
  });
  assert.ok(noEvidence.unknown.some((item) => item.dimension === "预计运行结果"));
});

test("corrupt storage and malformed structured input fail safely", () => {
  const corrupt = storage();
  corrupt.setItem(PREDICTION_STORAGE_KEY, "{not-json");
  assert.equal(loadPrediction(corrupt, context), null);
  assert.equal(createPrediction({
    expectedBuild: "maybe",
    expectedRun: "pass",
    expectedPass: "sometimes",
    expectedEvents: ["../../secret", "lab7:file-open"],
    reasoning: "invalid"
  }, context), null);
  assert.equal(loadPrediction(storage({
    version: 2,
    expectedBuild: "success",
    expectedRun: "complete",
    expectedPass: true,
    reasoning: "other branch",
    branch: "lab3-solution",
    commit: context.commit
  }), context), null);
  const cleaned = prediction({
    expectedEvents: [
      "lab2:stvec-installed",
      "lab2:stvec-installed",
      "lab2:not-in-catalog",
      "lab2:pass",
      "lab7:file-open",
      "../../secret"
    ]
  });
  assert.deepEqual(cleaned.expectedEvents, ["lab2:stvec-installed"]);
  assert.doesNotThrow(() => comparePrediction(prediction(), run([
    null,
    { protocol: "other", lab: "lab2", step: "pass", status: "pass" },
    { protocol: "os-demo.event/v1", lab: "../../", step: "pass", status: "pass" }
  ])));
});
