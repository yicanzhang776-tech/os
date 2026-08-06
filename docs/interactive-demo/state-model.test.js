"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EVENT_PROTOCOL,
  INSUFFICIENT_TEXT,
  computeState,
  createStateTracker,
  formatField
} = require("./state-model");

function event(lab, step, status = "running", sequence = 1, detail = step) {
  return {
    protocol: EVENT_PROTOCOL,
    lab,
    step,
    status,
    detail,
    source: "tagged",
    sequence,
    timestamp: sequence * 100
  };
}

test("the same structured event sequence produces the same state", () => {
  const events = [
    event("lab4", "allocator-ready", "running", 1),
    event("lab4", "root-page-table", "running", 2),
    event("lab4", "text-mapped", "running", 3),
    event("lab4", "satp-activated", "running", 4),
    event("lab4", "pass", "pass", 5)
  ];
  assert.deepEqual(
    computeState(events, { lab: "lab4", variant: "solution" }),
    computeState(structuredClone(events), { lab: "lab4", variant: "solution" })
  );
});

test("live accumulation and replay prefixes rebuild identical state", () => {
  const events = [
    event("lab2", "stvec-installed", "running", 1),
    event("lab2", "breakpoint-triggered", "running", 2),
    event("lab2", "breakpoint-decoded", "running", 3),
    event("lab2", "breakpoint-handled", "running", 4),
    event("lab2", "pass", "pass", 5)
  ];
  const tracker = createStateTracker({ lab: "lab2", variant: "solution" });
  events.forEach((item, index) => {
    const live = tracker.apply(item);
    const replay = computeState(events.slice(0, index + 1), { lab: "lab2", variant: "solution" });
    assert.deepEqual(live, replay, `prefix ${index + 1}`);
  });
});

test("out-of-order, duplicate, invalid and missing events never crash", () => {
  const shuffled = [
    event("lab2", "breakpoint-decoded", "running", 3),
    null,
    event("lab2", "stvec-installed", "running", 1),
    { lab: "lab2", step: "missing-protocol", status: "running" },
    event("lab2", "breakpoint-decoded", "running", 3),
    event("lab2", "breakpoint-triggered", "running", 2)
  ];
  assert.doesNotThrow(() => computeState(shuffled, { lab: "lab2" }));
  const state = computeState(shuffled, { lab: "lab2" });
  assert.equal(state.duplicateCount, 1);
  assert.equal(state.ignoredCount, 2);
  assert.equal(state.fields.scause.value, "breakpoint（异常码 3）");
  assert.equal(computeState([], { lab: "lab7" }).fields.fileDescriptor.value, INSUFFICIENT_TEXT);
  assert.equal(formatField(null), INSUFFICIENT_TEXT);
});

test("starter TODO cannot be calculated as complete", () => {
  const state = computeState([
    event("lab5", "scheduler-ready", "running", 1),
    event("lab5", "task-2-todo", "todo", 2),
    event("lab5", "pass", "pass", 3)
  ], { lab: "lab5", variant: "starter" });
  assert.equal(state.completed, false);
  assert.match(state.fields.completion.value, /TODO/);
});

test("solution PASS requires real mechanism event evidence", () => {
  const passOnly = computeState([
    event("lab6", "pass", "pass", 1)
  ], { lab: "lab6", variant: "solution" });
  assert.equal(passOnly.completed, null);
  assert.equal(passOnly.fields.completion.status, "partial");
  assert.match(passOnly.fields.completion.value, /没有足够过程运行证据/);

  const evidenced = computeState([
    event("lab6", "user-context-ready", "running", 1),
    event("lab6", "user-ecall", "running", 2),
    event("lab6", "user-exit", "running", 3),
    event("lab6", "pass", "pass", 4)
  ], { lab: "lab6", variant: "solution" });
  assert.equal(evidenced.completed, true);
  assert.match(evidenced.fields.completion.value, /PASS/);
});

test("unknown numeric values remain explicitly insufficient", () => {
  const lab3 = computeState([
    event("lab3", "allocator-ready", "running", 1),
    event("lab3", "frame-checks-pass", "running", 2)
  ], { lab: "lab3" });
  assert.equal(lab3.fields.freeFrames.status, "partial");
  assert.match(lab3.fields.freeFrames.value, /精确数量/);

  const lab7 = computeState([
    event("lab7", "file-open", "running", 1),
    event("lab7", "file-write", "running", 2)
  ], { lab: "lab7" });
  assert.match(lab7.fields.fileDescriptor.value, /fd 编号没有足够运行证据/);
  assert.match(lab7.fields.fileSize.value, /具体大小没有足够运行证据/);
});

test("Lab5 switch counts prefer explicit switch events without double counting task markers", () => {
  const lab5 = computeState([
    event("lab5", "scheduler-ready", "running", 1),
    event("lab5", "task-a-step-1", "running", 2),
    event("lab5", "context-switched", "running", 3),
    event("lab5", "task-b-step-1", "running", 4),
    event("lab5", "context-switched", "running", 5),
    event("lab5", "task-c-step-1", "running", 6)
  ], { lab: "lab5" });
  assert.equal(lab5.fields.switchCount.value, "2 次（按显式 context-switched 事件计算）");
});
