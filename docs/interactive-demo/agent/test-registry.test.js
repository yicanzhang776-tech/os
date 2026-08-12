"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  APPROVED_TEST_IDS,
  APPROVED_TEST_RUNNER,
  TEST_REGISTRY,
  getApprovedTest
} = require("./test-registry");

const EXPECTED_IDS = [
  "main-lab7-qemu",
  "lab1-starter-qemu",
  "lab1-solution-qemu",
  "lab2-starter-qemu",
  "lab2-solution-qemu",
  "lab3-starter-qemu",
  "lab3-solution-qemu",
  "lab4-starter-qemu",
  "lab4-solution-qemu",
  "lab5-starter-qemu",
  "lab5-solution-qemu",
  "lab6-starter-qemu",
  "lab6-solution-qemu",
  "lab7-starter-qemu",
  "lab7-solution-qemu"
];

test("the approved test registry contains exactly the 15 Step 7 entries", () => {
  assert.deepEqual(APPROVED_TEST_IDS, EXPECTED_IDS);
  assert.equal(Object.keys(TEST_REGISTRY).length, 15);
});

test("every approved entry uses the fixed runner and an exact branch policy", () => {
  for (const testId of EXPECTED_IDS) {
    const entry = getApprovedTest(testId);
    assert.equal(entry.testId, testId);
    assert.equal(entry.runner, APPROVED_TEST_RUNNER);
    assert.equal(entry.runner, "kernel-build-qemu");
    assert.deepEqual(Object.keys(entry.branchPolicy).sort(), ["branch", "type"]);
    assert.equal(entry.branchPolicy.type, "exact");
    assert.equal(entry.branchPolicy.branch, testId === "main-lab7-qemu"
      ? "main"
      : testId.replace(/-qemu$/, ""));
    assert.equal(entry.requiresQemu, true);
    assert.match(entry.description, /QEMU|Qemu|qemu/);
  }
});

test("starter metadata expects TODO while solution and main expect PASS", () => {
  assert.equal(getApprovedTest("main-lab7-qemu").expectedResult, "pass");
  for (let labNumber = 1; labNumber <= 7; labNumber += 1) {
    assert.equal(getApprovedTest(`lab${labNumber}-starter-qemu`).expectedResult, "todo");
    assert.equal(getApprovedTest(`lab${labNumber}-solution-qemu`).expectedResult, "pass");
  }
});

test("P0, host, stage, agent, demo, and custom tests are not registered", () => {
  for (const testId of [
    "p0-qemu",
    "host-tests",
    "lab4-stage-1",
    "agent-mvp-qemu",
    "interactive-demo-learning-map-qemu",
    "custom-qemu"
  ]) {
    assert.equal(getApprovedTest(testId), null);
  }
});

test("the registry, entries, and nested branch policies are frozen", () => {
  assert.equal(Object.isFrozen(TEST_REGISTRY), true);
  assert.equal(Object.isFrozen(APPROVED_TEST_IDS), true);
  for (const entry of Object.values(TEST_REGISTRY)) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.branchPolicy), true);
  }
});

test("callers cannot replace entries or mutate exact branch policies", () => {
  const entry = getApprovedTest("lab4-starter-qemu");
  assert.throws(() => {
    TEST_REGISTRY[entry.testId] = { testId: "forged" };
  }, TypeError);
  assert.throws(() => {
    entry.variant = "solution";
  }, TypeError);
  assert.throws(() => {
    entry.branchPolicy.branch = "lab4-solution";
  }, TypeError);
  assert.equal(getApprovedTest("lab4-starter-qemu"), entry);
  assert.equal(entry.branchPolicy.branch, "lab4-starter");
});
