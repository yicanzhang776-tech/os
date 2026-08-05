"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EVENT_PROTOCOL,
  EXPECTED_BRANCHES,
  normalizeBranchName,
  normalizeTeachingEvent,
  parseBranchContext,
  parseKernelLine
} = require("./protocol");

test("all 17 repository branches resolve to a teaching context", () => {
  assert.equal(EXPECTED_BRANCHES.length, 17);
  for (const branch of EXPECTED_BRANCHES) {
    const context = parseBranchContext(branch);
    assert.equal(context.expectedBranch, true, branch);
    assert.notEqual(context.stageIndex, null, branch);
  }
});

test("starter and solution variants keep the target lab", () => {
  assert.deepEqual(
    parseBranchContext("origin/lab5-starter"),
    {
      branch: "lab5-starter",
      lab: "lab5",
      stageIndex: 5,
      variant: "starter",
      variantLabel: "学生起点",
      expectedBranch: true
    }
  );
  assert.equal(parseBranchContext("refs/heads/lab7-solution").variant, "solution");
  assert.equal(parseBranchContext("main").variant, "complete");
  assert.equal(parseBranchContext("p0-minimal-qemu-baseline").lab, "p0");
  assert.equal(parseBranchContext("gitlab/interactive-demo-learning-map").variant, "demo");
  assert.equal(normalizeBranchName("refs/remotes/gitlab/lab2-starter"), "lab2-starter");
});

test("versioned teaching events reject invalid protocol values", () => {
  const event = normalizeTeachingEvent({
    lab: "lab4",
    step: "satp-activated",
    status: "running",
    detail: "satp written",
    source: "tagged"
  });
  assert.equal(event.protocol, EVENT_PROTOCOL);
  assert.equal(normalizeTeachingEvent({ ...event, lab: "lab9" }), null);
  assert.equal(normalizeTeachingEvent({ ...event, status: "complete" }), null);
  assert.equal(parseKernelLine("[OS_DEMO] v=2 lab=lab4 step=pass"), null);
});

test("explicit OS_DEMO telemetry remains authoritative", () => {
  assert.deepEqual(
    parseKernelLine("[OS_DEMO] lab=lab4 step=satp-activated"),
    {
      protocol: EVENT_PROTOCOL,
      lab: "lab4",
      step: "satp-activated",
      status: "running",
      detail: "内核发出的显式教学遥测",
      source: "tagged"
    }
  );
});

test("stable console markers provide fallback telemetry", () => {
  const cases = [
    ["[P0] PASS", "p0", "pass", "pass"],
    ["[Lab1] console is available", "lab1", "console-available", "running"],
    ["[Lab2] trap entry installed", "lab2", "stvec-installed", "running"],
    ["[Lab2] breakpoint handled", "lab2", "breakpoint-handled", "running"],
    ["[Lab3] frame allocator ready", "lab3", "allocator-ready", "running"],
    ["[Lab4] satp activated", "lab4", "satp-activated", "running"],
    ["[Lab5] task B step 2", "lab5", "task-b-step-2", "running"],
    ["[Lab6] syscall write handled", "lab6", "console-write", "running"],
    ["[Lab7] write/read verified", "lab7", "file-verified", "running"],
    ["[Lab7] PASS", "lab7", "pass", "pass"]
  ];

  for (const [line, lab, step, status] of cases) {
    const parsed = parseKernelLine(line);
    assert.equal(parsed.lab, lab, line);
    assert.equal(parsed.step, step, line);
    assert.equal(parsed.status, status, line);
  }
});

test("starter TODO markers never become completion events", () => {
  const taskTodo = parseKernelLine("[Lab6-T2] TODO: implement syscall ABI dispatch");
  assert.equal(taskTodo.step, "task-2-todo");
  assert.equal(taskTodo.status, "todo");

  const labTodo = parseKernelLine("[Lab7] TODO: implement memory file system");
  assert.equal(labTodo.step, "todo");
  assert.equal(labTodo.status, "todo");
});

test("task checkpoints and failures keep semantic status", () => {
  assert.equal(parseKernelLine("[Lab3-T1] PASS").status, "pass");
  assert.equal(parseKernelLine("[Lab5-T1] task table ready").step, "task-1-evidence");
  assert.equal(parseKernelLine("[Lab4] FAIL: text mapping failed").status, "fail");
});

test("unrelated QEMU and OpenSBI lines are ignored", () => {
  assert.equal(parseKernelLine("OpenSBI v1.5"), null);
  assert.equal(parseKernelLine("Domain0 Next Address : 0x0000000080200000"), null);
  assert.equal(parseKernelLine(""), null);
});
