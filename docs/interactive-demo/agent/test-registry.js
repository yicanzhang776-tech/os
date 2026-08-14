"use strict";

const APPROVED_TEST_RUNNER = "kernel-build-qemu";

function createEntry({ testId, lab, variant, branch, expectedResult, description }) {
  const branchPolicy = Object.freeze({
    type: "exact",
    branch
  });
  return Object.freeze({
    testId,
    lab,
    variant,
    runner: APPROVED_TEST_RUNNER,
    branchPolicy,
    expectedResult,
    requiresQemu: true,
    description
  });
}

const entries = [
  createEntry({
    testId: "main-lab7-qemu",
    lab: "lab7",
    variant: "complete",
    branch: "main",
    expectedResult: "pass",
    description: "Run the integrated Lab7 teaching kernel on main in QEMU."
  })
];

for (let labNumber = 1; labNumber <= 7; labNumber += 1) {
  const lab = `lab${labNumber}`;
  for (const variant of ["starter", "solution"]) {
    entries.push(createEntry({
      testId: `${lab}-${variant}-qemu`,
      lab,
      variant,
      branch: `${lab}-${variant}`,
      expectedResult: variant === "starter" ? "todo" : "pass",
      description: variant === "starter"
        ? `Run the approved ${lab} starter incomplete check in QEMU.`
        : `Run the approved ${lab} solution check in QEMU.`
    }));
  }
}

const registry = Object.create(null);
for (const entry of entries) registry[entry.testId] = entry;

const TEST_REGISTRY = Object.freeze(registry);
const APPROVED_TEST_IDS = Object.freeze(Object.keys(TEST_REGISTRY));

function getApprovedTest(testId) {
  return typeof testId === "string" && Object.hasOwn(TEST_REGISTRY, testId)
    ? TEST_REGISTRY[testId]
    : null;
}

module.exports = {
  APPROVED_TEST_IDS,
  APPROVED_TEST_RUNNER,
  TEST_REGISTRY,
  getApprovedTest
};
