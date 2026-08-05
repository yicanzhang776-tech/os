"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { EVENT_PROTOCOL } = require("./state-model");
const { compareRuns, diffStates } = require("./state-diff");

function event(lab, step, status, sequence) {
  return {
    protocol: EVENT_PROTOCOL,
    lab,
    step,
    status,
    detail: step,
    source: "tagged",
    sequence,
    timestamp: sequence * 100
  };
}

function run(variant, events) {
  return {
    context: { branch: `lab2-${variant}`, lab: "lab2", variant },
    events
  };
}

test("starter and solution state comparison classifies state differences", () => {
  const starter = run("starter", [
    event("lab2", "stvec-installed", "running", 1),
    event("lab2", "task-2-todo", "todo", 2)
  ]);
  const solution = run("solution", [
    event("lab2", "stvec-installed", "running", 1),
    event("lab2", "breakpoint-triggered", "running", 2),
    event("lab2", "breakpoint-decoded", "running", 3),
    event("lab2", "breakpoint-handled", "running", 4),
    event("lab2", "pass", "pass", 5)
  ]);
  const comparison = compareRuns(starter, solution);
  assert.equal(comparison.lab, "lab2");
  assert.ok(comparison.changed.some((row) => row.key === "completion"));
  assert.ok(comparison.solutionOnly.some((row) => row.key === "scause"));
  assert.ok(comparison.solutionOnly.some((row) => row.key === "sepc"));
  assert.ok(comparison.same.some((row) => row.key === "stval"));
  assert.equal(comparison.starterState.completed, false);
  assert.equal(comparison.solutionState.completed, true);
});

test("identical states compare as the same even when evidence objects are cloned", () => {
  const solution = run("solution", [
    event("lab2", "stvec-installed", "running", 1),
    event("lab2", "breakpoint-decoded", "running", 2)
  ]);
  const comparison = compareRuns(run("starter", structuredClone(solution.events)), solution);
  assert.equal(comparison.changed.length, 0);
  assert.equal(comparison.starterOnly.length, 0);
  assert.equal(comparison.solutionOnly.length, 0);
  assert.equal(comparison.same.length, 5);
});

test("invalid run pairs and mismatched labs safely return null", () => {
  assert.equal(compareRuns(null, null), null);
  assert.equal(compareRuns(run("starter", []), run("starter", [])), null);
  const starter = run("starter", []);
  const solution = run("solution", []);
  solution.context.lab = "lab3";
  assert.equal(compareRuns(starter, solution), null);
  assert.equal(diffStates({ lab: "lab2" }, { lab: "lab3" }), null);
});
