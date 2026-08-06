"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  DIAGNOSTICS_VERSION,
  EVENT_PROTOCOL,
  diagnose,
  normalizeInput
} = require("./diagnostics");

function event(lab, step, status = "running", sequence = 1, detail = step) {
  return {
    protocol: EVENT_PROTOCOL,
    lab,
    step,
    status,
    source: "tagged",
    detail,
    sequence
  };
}

function input(overrides = {}) {
  return {
    lab: "lab2",
    role: "solution",
    buildResult: "success",
    events: [],
    serialOutput: [],
    finalStatus: "finished",
    ...overrides
  };
}

function findDiagnostic(result, id) {
  return result.find((item) => item.id === id) || null;
}

function hasDiagnostic(result, id) {
  return Boolean(findDiagnostic(result, id));
}

function isSafeRepositoryPath(value) {
  const candidate = String(value || "").replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || /^[a-z]:/i.test(candidate)) return false;
  if (candidate.includes("\0") || candidate.includes("?") || candidate.includes("#")) return false;
  return candidate.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

test("diagnostics expose a stable version and safely normalize malformed input", () => {
  assert.equal(DIAGNOSTICS_VERSION, 1);
  assert.equal(EVENT_PROTOCOL, "os-demo.event/v1");
  assert.deepEqual(diagnose(), []);
  assert.deepEqual(diagnose(null), []);
  assert.deepEqual(diagnose({ lab: "lab99", events: "not-an-array", serialOutput: {} }), []);
  assert.deepEqual(normalizeInput({ events: [null, 42, { protocol: "os-demo.event/v0" }] }).events, []);
});

test("diagnosis is deterministic and does not mutate caller-owned evidence", () => {
  const value = input({
    buildResult: "failure",
    finalStatus: "failure",
    events: [event("lab2", "trap-enter", "running", 1)],
    serialOutput: [{ line: "cargo build failed with exit code 101", channel: "build", timestamp: 100 }]
  });
  const before = structuredClone(value);
  const first = diagnose(value);
  const second = diagnose(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
});

test("every diagnosis carries evidence, possible causes, safe code locations and a document", () => {
  const fixtures = [
    input({ buildResult: "failure", finalStatus: "failure" }),
    input({ serialOutput: ["Rust target riscv64gc-unknown-none-elf is unavailable."] }),
    input({ serialOutput: ["Missing dependency: qemu-system-riscv64."] }),
    input({ finalStatus: "timeout" }),
    input({
      events: [
        event("lab2", "trap-enter", "running", 1),
        event("lab2", "trap-enter", "running", 2)
      ],
      finalStatus: "failure"
    })
  ];
  const results = fixtures.flatMap(diagnose);

  assert.ok(results.length >= fixtures.length);
  for (const item of results) {
    assert.equal(typeof item.id, "string");
    assert.ok(item.id.length > 0);
    assert.ok(Array.isArray(item.triggerEvidence) && item.triggerEvidence.length > 0, item.id);
    assert.deepEqual(item.evidence, item.triggerEvidence, item.id);
    assert.ok(Array.isArray(item.possibleCauses) && item.possibleCauses.length > 0, item.id);
    assert.ok(Array.isArray(item.codeLocations) && item.codeLocations.length > 0, item.id);
    for (const location of item.codeLocations) {
      assert.equal(isSafeRepositoryPath(location.file), true, `${item.id}: ${location.file}`);
      assert.equal(typeof location.symbol, "string");
      assert.ok(location.symbol.length > 0, item.id);
    }
    assert.equal(isSafeRepositoryPath(item.document), true, `${item.id}: ${item.document}`);
    if (item.guideDocument) assert.equal(isSafeRepositoryPath(item.guideDocument), true, item.id);
    assert.equal(typeof item.canDetermine, "boolean", item.id);
    assert.equal(item.certain, item.canDetermine, item.id);
    assert.equal(item.certainty, item.canDetermine ? "confirmed" : "possible", item.id);
  }
});

test("Cargo build failure is reported from an explicit build result", () => {
  const result = diagnose(input({ buildResult: "failure", finalStatus: "failure" }));
  const item = findDiagnostic(result, "cargo-build-failed");

  assert.ok(item);
  assert.equal(item.category, "environment");
  assert.equal(item.isError, true);
  assert.equal(item.canDetermine, true);
  assert.ok(item.triggerEvidence.some((evidence) => /failure/i.test(evidence)));
});

test("missing RISC-V target requires an explicit stable environment message", () => {
  const confirmed = diagnose(input({
    serialOutput: [
      "Rust target riscv64gc-unknown-none-elf is unavailable. Run: rustup target add riscv64gc-unknown-none-elf"
    ]
  }));
  const casual = diagnose(input({
    serialOutput: ["The RISC-V target is documented and available for this exercise."]
  }));

  assert.equal(findDiagnostic(confirmed, "riscv-target-missing")?.canDetermine, true);
  assert.equal(hasDiagnostic(casual, "riscv-target-missing"), false);
});

test("missing QEMU requires an explicit preflight or process-start failure", () => {
  const missing = diagnose(input({
    serialOutput: ["Missing dependency: qemu-system-riscv64. Install QEMU with RISC-V system support."]
  }));
  const available = diagnose(input({
    serialOutput: ["found qemu-system-riscv64: /usr/bin/qemu-system-riscv64"]
  }));

  assert.equal(findDiagnostic(missing, "qemu-missing")?.canDetermine, true);
  assert.equal(hasDiagnostic(available, "qemu-missing"), false);
});

test("a normal starter TODO is an expected teaching stop rather than an error", () => {
  const todo = diagnose(input({
    lab: "lab5",
    role: "starter",
    buildResult: "success",
    finalStatus: "todo",
    events: [event("lab5", "task-2-todo", "todo", 1, "implement cooperative scheduler")]
  }));
  const item = findDiagnostic(todo, "starter-todo");

  assert.ok(item);
  assert.equal(item.category, "teaching");
  assert.equal(item.severity, "info");
  assert.equal(item.isError, false);
  assert.equal(item.canDetermine, true);
  assert.equal(todo.some((diagnostic) => diagnostic.severity === "error"), false);

  const solutionTodo = diagnose(input({
    lab: "lab5",
    role: "solution",
    finalStatus: "todo",
    events: [event("lab5", "task-2-todo", "todo", 1)]
  }));
  assert.equal(hasDiagnostic(solutionTodo, "starter-todo"), false);
});

test("QEMU timeout is diagnosed only from an explicit timeout status", () => {
  const timeout = diagnose(input({ finalStatus: "timeout" }));
  const stopped = diagnose(input({ finalStatus: "stopped" }));
  const running = diagnose(input({ finalStatus: "running" }));

  assert.equal(findDiagnostic(timeout, "qemu-timeout")?.canDetermine, true);
  assert.equal(hasDiagnostic(stopped, "qemu-timeout"), false);
  assert.equal(hasDiagnostic(running, "qemu-timeout"), false);
});

test("repeated Trap requires two distinct occurrences, not one event or a duplicate copy", () => {
  const repeated = diagnose(input({
    finalStatus: "failure",
    events: [
      event("lab2", "trap-enter", "running", 10),
      event("lab2", "trap-enter", "running", 11)
    ]
  }));
  const single = diagnose(input({
    finalStatus: "failure",
    events: [event("lab2", "trap-enter", "running", 10)]
  }));
  const duplicate = diagnose(input({
    finalStatus: "failure",
    events: [
      event("lab2", "trap-enter", "running", 10),
      event("lab2", "trap-enter", "running", 10)
    ]
  }));
  const missingSequence = diagnose(input({
    finalStatus: "failure",
    events: [
      { ...event("lab2", "trap-enter"), sequence: null },
      { ...event("lab2", "trap-enter"), sequence: null }
    ]
  }));

  assert.equal(findDiagnostic(repeated, "trap-repeated")?.canDetermine, true);
  assert.equal(hasDiagnostic(single, "trap-repeated"), false);
  assert.equal(hasDiagnostic(duplicate, "trap-repeated"), false);
  assert.equal(hasDiagnostic(missingSequence, "trap-repeated"), false);
});

test("missing sepc progress remains a possible cause and is suppressed by progress evidence", () => {
  const traps = [
    event("lab2", "trap-enter", "running", 1),
    event("lab2", "trap-enter", "running", 2)
  ];
  const possible = diagnose(input({ events: traps, finalStatus: "failure" }));
  const progressed = diagnose(input({
    events: [...traps, event("lab2", "sepc-advanced", "running", 3)],
    finalStatus: "failure"
  }));
  const item = findDiagnostic(possible, "sepc-not-advanced");

  assert.ok(item);
  assert.equal(item.canDetermine, false);
  assert.equal(item.certain, false);
  assert.equal(item.severity, "warning");
  assert.ok(item.possibleCauses.length > 0);
  assert.equal(hasDiagnostic(progressed, "sepc-not-advanced"), false);
});

test("evidence that paging recovered after satp suppresses the activation-fault rule", () => {
  const abnormal = diagnose(input({
    lab: "lab4",
    finalStatus: "failure",
    events: [
      event("lab4", "satp-activated", "running", 1),
      event("lab4", "fail", "fail", 2, "mapping failed after activation")
    ]
  }));
  const recovered = diagnose(input({
    lab: "lab4",
    finalStatus: "failure",
    events: [
      event("lab4", "satp-activated", "running", 1),
      event("lab4", "paging-active", "running", 2),
      event("lab4", "fail", "fail", 3, "a later unrelated check failed")
    ]
  }));

  assert.equal(findDiagnostic(abnormal, "satp-activation-fault")?.canDetermine, false);
  assert.equal(hasDiagnostic(recovered, "satp-activation-fault"), false);
});

test("page-frame exhaustion requires explicit evidence and ignores a generic allocator failure", () => {
  const exhausted = diagnose(input({
    lab: "lab3",
    finalStatus: "failure",
    events: [event("lab3", "fail", "fail", 1, "out of physical frames")]
  }));
  const generic = diagnose(input({
    lab: "lab3",
    finalStatus: "failure",
    events: [event("lab3", "fail", "fail", 1, "physical frame allocator check failed")],
    serialOutput: ["cargo process terminated: out of memory"]
  }));

  assert.equal(findDiagnostic(exhausted, "page-frame-exhausted")?.canDetermine, true);
  assert.equal(hasDiagnostic(generic, "page-frame-exhausted"), false);
});

test("Lab5 reports a possible missing switch only after scheduling was attempted", () => {
  const stuck = diagnose(input({
    lab: "lab5",
    finalStatus: "failure",
    events: [
      event("lab5", "scheduler-ready", "running", 1),
      event("lab5", "yield-called", "running", 2)
    ]
  }));
  const switched = diagnose(input({
    lab: "lab5",
    finalStatus: "finished",
    events: [
      event("lab5", "scheduler-ready", "running", 1),
      event("lab5", "task-a-step-1", "running", 2),
      event("lab5", "task-b-step-1", "running", 3),
      event("lab5", "scheduler-finished", "running", 4)
    ]
  }));
  const notAttempted = diagnose(input({
    lab: "lab5",
    finalStatus: "failure",
    events: [event("lab5", "scheduler-ready", "running", 1)]
  }));

  assert.equal(findDiagnostic(stuck, "scheduler-no-switch")?.canDetermine, false);
  assert.equal(hasDiagnostic(switched, "scheduler-no-switch"), false);
  assert.equal(hasDiagnostic(notAttempted, "scheduler-no-switch"), false);
});

test("Lab6 ecall dispatch diagnosis is possible-only and normal syscall evidence suppresses it", () => {
  const stalled = diagnose(input({
    lab: "lab6",
    finalStatus: "failure",
    events: [event("lab6", "user-ecall", "running", 1)]
  }));
  const handled = diagnose(input({
    lab: "lab6",
    finalStatus: "finished",
    events: [
      event("lab6", "user-ecall", "running", 1),
      event("lab6", "syscall-dispatched", "running", 2),
      event("lab6", "console-write", "running", 3),
      event("lab6", "user-exit", "running", 4)
    ]
  }));
  const noEcallEvidence = diagnose(input({
    lab: "lab6",
    finalStatus: "failure",
    events: [event("lab6", "entering-user", "running", 1)]
  }));

  assert.equal(findDiagnostic(stalled, "user-ecall-not-dispatched")?.canDetermine, false);
  assert.equal(hasDiagnostic(handled, "user-ecall-not-dispatched"), false);
  assert.equal(hasDiagnostic(noEcallEvidence, "user-ecall-not-dispatched"), false);
});

test("Lab7 diagnoses explicit open, write and read failures", () => {
  const cases = [
    "file open failed",
    "file write failed",
    "file read failed"
  ];

  for (const [index, detail] of cases.entries()) {
    const result = diagnose(input({
      lab: "lab7",
      finalStatus: "failure",
      events: [event("lab7", "fail", "fail", index + 1, detail)]
    }));
    const item = findDiagnostic(result, "file-io-failed");
    assert.ok(item, detail);
    assert.equal(item.canDetermine, true, detail);
    assert.ok(item.codeLocations.some((location) => location.file === "kernel/src/fs/mod.rs"), detail);
    assert.equal(item.document, "docs/labs/lab7.md", detail);
  }
});

test("normal Lab7 open-write-close-read-verify evidence does not produce an I/O error", () => {
  const result = diagnose(input({
    lab: "lab7",
    finalStatus: "finished",
    events: [
      event("lab7", "file-open", "running", 1),
      event("lab7", "file-write", "running", 2),
      event("lab7", "file-close", "running", 3),
      event("lab7", "file-read", "running", 4),
      event("lab7", "file-verified", "running", 5),
      event("lab7", "pass", "pass", 6)
    ]
  }));

  assert.equal(hasDiagnostic(result, "file-io-failed"), false);
  assert.equal(result.some((item) => item.severity === "error"), false);
});

test("events from other Labs and old protocols cannot trigger current-Lab rules", () => {
  const result = diagnose(input({
    lab: "lab5",
    finalStatus: "failure",
    events: [
      event("lab2", "trap-enter", "running", 1),
      event("lab2", "trap-enter", "running", 2),
      event("lab7", "fail", "fail", 3, "file write failed"),
      { ...event("lab5", "yield-called", "running", 4), protocol: "os-demo.event/v0" },
      { ...event("lab5", "context-switched", "running", 5), protocol: "os-demo.event/v0" }
    ]
  }));

  assert.equal(hasDiagnostic(result, "trap-repeated"), false);
  assert.equal(hasDiagnostic(result, "sepc-not-advanced"), false);
  assert.equal(hasDiagnostic(result, "file-io-failed"), false);
  assert.equal(hasDiagnostic(result, "scheduler-no-switch"), false);
});

test("a generic terminal failure without mechanism evidence does not claim a low-level cause", () => {
  const cases = [
    input({ lab: "lab2", finalStatus: "failure" }),
    input({ lab: "lab3", finalStatus: "failure", events: [event("lab3", "fail", "fail", 1, "allocator check failed")] }),
    input({ lab: "lab4", finalStatus: "failure" }),
    input({ lab: "lab5", finalStatus: "failure", events: [event("lab5", "scheduler-ready", "running", 1)] }),
    input({ lab: "lab6", finalStatus: "failure", events: [event("lab6", "entering-user", "running", 1)] }),
    input({ lab: "lab7", finalStatus: "failure", events: [event("lab7", "fail", "fail", 1, "unknown failure")] })
  ];

  for (const value of cases) assert.deepEqual(diagnose(value), [], value.lab);
});

test("healthy Lab2, Lab4, Lab5 and Lab6 chains stay free of error diagnostics", () => {
  const cases = [
    input({
      lab: "lab2",
      events: [
        event("lab2", "stvec-installed", "running", 1),
        event("lab2", "trap-enter", "running", 2),
        event("lab2", "scause-read", "running", 3),
        event("lab2", "sepc-advanced", "running", 4),
        event("lab2", "breakpoint-handled", "running", 5),
        event("lab2", "pass", "pass", 6)
      ]
    }),
    input({
      lab: "lab4",
      events: [
        event("lab4", "satp-activated", "running", 1),
        event("lab4", "paging-active", "running", 2),
        event("lab4", "translate-verified", "running", 3),
        event("lab4", "pass", "pass", 4)
      ]
    }),
    input({
      lab: "lab5",
      events: [
        event("lab5", "scheduler-ready", "running", 1),
        event("lab5", "task-a-step-1", "running", 2),
        event("lab5", "context-switched", "running", 3),
        event("lab5", "task-b-step-1", "running", 4),
        event("lab5", "scheduler-finished", "running", 5)
      ]
    }),
    input({
      lab: "lab6",
      events: [
        event("lab6", "user-context-ready", "running", 1),
        event("lab6", "user-ecall", "running", 2),
        event("lab6", "console-write", "running", 3),
        event("lab6", "user-exit", "running", 4),
        event("lab6", "pass", "pass", 5)
      ]
    })
  ];

  for (const value of cases) {
    const result = diagnose(value);
    assert.equal(result.some((item) => item.severity === "error"), false, value.lab);
    assert.equal(result.some((item) => item.category === "runtime"), false, value.lab);
  }
});

test("the deterministic diagnostics module contains no network or dynamic-code API", () => {
  const source = fs.readFileSync(path.join(__dirname, "diagnostics.js"), "utf8");
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest|sendBeacon|eval)\b/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|Ollama|agent|model endpoint)\b/i);
});
