"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EVENT_CATALOG,
  isRepositoryPath,
  resolveEventKnowledge
} = require("./event-catalog");
const { EXPECTED_BRANCHES, parseBranchContext } = require("./protocol");
const { createRunRecord } = require("./run-history");
const protocol = "os-demo.event/v1";

test("required Lab1-Lab7 events map to code, knowledge and causal state", () => {
  const required = {
    lab1: ["print-line", "sbi-ecall", "opensbi-console", "uart-write"],
    lab2: ["stvec-installed", "trap-enter", "scause-read", "sepc-advanced", "breakpoint-triggered"],
    lab3: ["frame-allocated", "frame-freed"],
    lab4: ["page-table-built", "pte-written", "satp-activated"],
    lab5: ["task-created", "yield-called", "context-switched"],
    lab6: ["user-mode-entered", "user-ecall", "syscall-dispatched", "user-return"],
    lab7: ["file-open", "file-write", "file-read", "file-close", "file-verified"]
  };

  for (const [lab, steps] of Object.entries(required)) {
    for (const step of steps) {
      const result = resolveEventKnowledge({ protocol, lab, step, status: "running", detail: "runtime evidence" });
      assert.equal(result.known, true, `${lab}:${step}`);
      assert.ok(result.eventName, `${lab}:${step} name`);
      assert.ok(result.knowledge, `${lab}:${step} knowledge`);
      assert.equal(isRepositoryPath(result.file), true, `${lab}:${step} path`);
      assert.ok(result.symbol, `${lab}:${step} symbol`);
      assert.ok(result.cause, `${lab}:${step} cause`);
      assert.ok(result.effect, `${lab}:${step} effect`);
      assert.ok(Array.isArray(result.nextEvents), `${lab}:${step} next`);
      assert.ok(result.knowledgeNode, `${lab}:${step} node`);
    }
  }
});

test("events already emitted by the integrated main branch are all registered", () => {
  const emitted = {
    p0: ["kernel-main", "pass"],
    lab1: ["start", "console-available", "pass"],
    lab2: ["stvec-installed", "breakpoint-triggered", "breakpoint-decoded", "breakpoint-handled", "pass"],
    lab3: ["allocator-ready", "frame-checks-start", "frame-checks-pass", "pass"],
    lab4: [
      "start", "allocator-ready", "root-page-table", "text-mapped", "rodata-mapped",
      "data-mapped", "bss-mapped", "user-pages-mapped", "page-table-built",
      "satp-activated", "paging-active", "translate-verified", "pass"
    ],
    lab5: [
      "start", "scheduler-ready", "task-a-step-1", "task-a-step-2", "task-b-step-1",
      "task-b-step-2", "task-c-step-1", "task-c-step-2", "scheduler-finished", "pass"
    ],
    lab6: ["start", "user-context-ready", "entering-user", "user-ecall", "console-write", "syscall-yield", "user-exit", "pass"],
    lab7: ["start", "file-open", "file-write", "file-read", "file-close", "file-verified", "pass"]
  };

  for (const [lab, steps] of Object.entries(emitted)) {
    for (const step of steps) {
      assert.equal(resolveEventKnowledge({ protocol, lab, step, status: "running" }).known, true, `${lab}:${step}`);
    }
  }
});

test("unknown and old-format events safely fall back to raw evidence", () => {
  const unknown = resolveEventKnowledge({
    protocol: "os-demo.event/v0",
    lab: "lab4",
    step: "legacy-page-event",
    status: "running",
    raw: "old serial marker"
  });
  assert.equal(unknown.known, false);
  assert.equal(unknown.file, null);
  assert.match(unknown.explanation, /old serial marker/);
  assert.match(unknown.raw, /legacy-page-event/);
  assert.match(unknown.raw, /old serial marker/);
  const oldKnownStep = resolveEventKnowledge({
    protocol: "os-demo.event/v0",
    lab: "lab1",
    step: "print-line",
    status: "running",
    detail: "legacy print marker"
  });
  assert.equal(oldKnownStep.known, false);
  assert.equal(oldKnownStep.file, null);
  assert.match(oldKnownStep.raw, /os-demo\.event\/v0/);
  const missingProtocol = resolveEventKnowledge({ lab: "lab1", step: "print-line", status: "running" });
  assert.equal(missingProtocol.known, false);
  assert.equal(missingProtocol.file, null);
  assert.doesNotThrow(() => resolveEventKnowledge(null));
  assert.doesNotThrow(() => resolveEventKnowledge({ raw: { nested: true } }));
});

test("catalog source paths stay inside the repository", () => {
  for (const entry of Object.values(EVENT_CATALOG)) {
    assert.equal(isRepositoryPath(entry.file), true, `${entry.key}: ${entry.file}`);
  }
  for (const unsafe of [
    "../kernel/src/main.rs",
    "docs/../../secret",
    "/etc/passwd",
    "C:\\Windows\\system.ini",
    "kernel/src/../Cargo.toml",
    "kernel/src/main.rs?download=1",
    "\\\\server\\share\\file.rs"
  ]) {
    assert.equal(isRepositoryPath(unsafe), false, unsafe);
  }
});

test("event knowledge lookup does not alter any of the 17 branch contexts", () => {
  assert.equal(EXPECTED_BRANCHES.length, 17);
  for (const branch of EXPECTED_BRANCHES) {
    const before = parseBranchContext(branch);
    const snapshot = structuredClone(before);
    const lab = before.lab || "p0";
    resolveEventKnowledge({ protocol, lab, step: "pass", status: "pass", detail: branch });
    assert.deepEqual(before, snapshot, branch);
    assert.deepEqual(parseBranchContext(branch), snapshot, branch);
  }
});

test("saved replay resolves to the same explanation as the live event", () => {
  const liveEvent = {
    protocol: "os-demo.event/v1",
    lab: "lab7",
    step: "file-read",
    status: "running",
    detail: "read bytes from the RAM device",
    source: "tagged",
    sequence: 8,
    timestamp: 12345
  };
  const run = createRunRecord({
    id: "run-replay-consistency",
    context: { branch: "lab7-solution", lab: "lab7", variant: "solution" },
    events: [liveEvent],
    startedAt: 100,
    endedAt: 200,
    exitCode: 0
  });

  assert.deepEqual(
    resolveEventKnowledge(run.events[0]),
    resolveEventKnowledge(liveEvent)
  );
});
