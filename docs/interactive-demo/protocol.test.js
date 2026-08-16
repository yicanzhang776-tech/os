"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EVENT_PROTOCOL,
  EXPECTED_BRANCHES,
  MAX_SERIAL_LINE_LENGTH,
  createLineBuffer,
  normalizeBranchName,
  normalizeTeachingEvent,
  parseBranchContext,
  parseKernelLine,
  parseSerialLine
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

test("os-demo-event byte-compatible samples keep their normalized meaning", () => {
  const cases = [
    ["[OS_DEMO] lab=p0 step=kernel-main", "p0", "kernel-main", "running"],
    ["[OS_DEMO] lab=lab1 step=console-available", "lab1", "console-available", "running"],
    ["[OS_DEMO] lab=lab2 step=breakpoint-handled", "lab2", "breakpoint-handled", "running"],
    ["[OS_DEMO] lab=lab4 step=satp-activated", "lab4", "satp-activated", "running"],
    ["[OS_DEMO] lab=lab5 step=context-switched", "lab5", "context-switched", "running"],
    ["[OS_DEMO] lab=lab7 step=file-close", "lab7", "file-close", "running"],
    ["[OS_DEMO] lab=lab7 step=pass", "lab7", "pass", "pass"],
    ["[OS_DEMO] lab=lab2 step=panic", "lab2", "panic", "fail"]
  ];

  for (const [line, lab, step, status] of cases) {
    const parsed = parseKernelLine(line);
    assert.equal(parsed.protocol, EVENT_PROTOCOL, line);
    assert.equal(parsed.lab, lab, line);
    assert.equal(parsed.step, step, line);
    assert.equal(parsed.status, status, line);
    assert.equal(parsed.source, "tagged", line);
  }
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

test("the kernel marker parser remains limited to kernel telemetry", () => {
  assert.equal(parseKernelLine("OpenSBI v1.5"), null);
  assert.equal(parseKernelLine("Domain0 Next Address : 0x0000000080200000"), null);
  assert.equal(parseKernelLine(""), null);
});

test("serial parsing creates one OpenSBI event only from a real version banner", () => {
  assert.deepEqual(parseSerialLine("OpenSBI v0.9", { lab: "lab1" }), {
    protocol: EVENT_PROTOCOL,
    lab: "lab1",
    step: "opensbi-started",
    status: "running",
    detail: "串口已观察到 OpenSBI 固件版本信息；这不证明学生内核已经执行",
    source: "console"
  });
  assert.equal(parseSerialLine("OpenSBI documentation", { lab: "lab1" }), null);
  assert.equal(parseSerialLine("OpenSBI v0.9", {}), null);
});

test("serial parsing records S-mode handoff information without claiming kernel execution", () => {
  const parsed = parseSerialLine("Domain0 Next Mode         : S-mode\r", { lab: "lab1" });
  assert.equal(parsed.step, "s-mode-handoff-observed");
  assert.equal(parsed.status, "running");
  assert.match(parsed.detail, /不证明内核入口或 kernel_main 已经执行/);
  assert.notEqual(parsed.step, "kernel-started");
  assert.notEqual(parsed.step, "kernel-main-entered");
  assert.equal(parseSerialLine(
    "Domain0 Next Address      : 0x0000000080200000",
    { lab: "lab1" }
  ), null);
});

test("the shared line buffer parses markers split across arbitrary chunks", () => {
  const events = [];
  const buffer = createLineBuffer((line, channel) => {
    const parsed = parseSerialLine(line, { lab: "lab1" });
    if (parsed) events.push({ ...parsed, channel });
  });
  buffer.push("stdout", "Domain0 Next Mo");
  buffer.push("stdout", "de : S-mode\n");
  assert.deepEqual(events.map((event) => event.step), ["s-mode-handoff-observed"]);
  assert.equal(events[0].channel, "stdout");

  buffer.push("stderr", "OpenSBI v0.9");
  assert.equal(events.length, 1);
  buffer.flush("stderr");
  assert.deepEqual(events.map((event) => event.step), [
    "s-mode-handoff-observed", "opensbi-started"
  ]);
});

test("serial parsing preserves Lab markers and requires real panic or exception evidence", () => {
  assert.equal(parseSerialLine("[Lab1-T1] PASS", { lab: "lab1" }).step, "task-1-pass");
  assert.equal(parseSerialLine("[Lab1] PASS", { lab: "lab1" }).status, "pass");
  assert.equal(parseSerialLine("[Lab1] kernel panic", { lab: "lab1" }).step, "panic");
  assert.equal(
    parseSerialLine("[Lab2] trap: breakpoint exception", { lab: "lab2" }).step,
    "breakpoint-decoded"
  );
  for (const line of [
    "panic handling documentation",
    "no panic was observed",
    "exception notes",
    "ordinary serial text"
  ]) {
    assert.equal(parseSerialLine(line, { lab: "lab1" }), null, line);
  }
});

test("a realistic OpenSBI fixture yields only the two useful firmware events", () => {
  const fixture = [
    "OpenSBI v0.9",
    "",
    "Platform Name             : riscv-virtio,qemu",
    "Platform Features         : timer,mfdeleg",
    "Platform HART Count       : 1",
    "Firmware Base             : 0x80000000",
    "",
    "Domain0 Name              : root",
    "Domain0 Next Address      : 0x0000000080200000",
    "Domain0 Next Arg1         : 0x0000000082200000",
    "Domain0 Next Mode         : S-mode",
    "",
    "Boot HART ID              : 0",
    "Boot HART Domain          : root"
  ];
  const events = fixture
    .map((line) => parseSerialLine(line, { lab: "lab1" }))
    .filter(Boolean);
  assert.deepEqual(events.map((event) => event.step), [
    "opensbi-started", "s-mode-handoff-observed"
  ]);
});

test("oversized untrusted serial lines are discarded rather than parsed", () => {
  const lines = [];
  const buffer = createLineBuffer((line) => lines.push(line));
  buffer.push("stdout", "x".repeat(MAX_SERIAL_LINE_LENGTH + 1));
  buffer.push("stdout", "\nOpenSBI v0.9\n");
  assert.deepEqual(lines, ["OpenSBI v0.9"]);
});
