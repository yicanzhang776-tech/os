"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createGetContextTool,
  createToolFailure,
  parsePorcelainStatus
} = require("./tools");
const { TOOL_CONTRACT_VERSION } = require("./policy");

const NOW = Date.parse("2026-08-11T10:20:30.000Z");

function toolFor(branch, options = {}) {
  let reads = 0;
  const tool = createGetContextTool({
    repoDir: "C:\\safe-test-repo",
    target: "riscv64gc-unknown-none-elf",
    readWorkspaceContext() {
      reads += 1;
      return { branch, commit: options.commit || "abc1234" };
    },
    readWorkspaceStatus: options.readWorkspaceStatus || (() => parsePorcelainStatus("")),
    getTaskSnapshot: options.getTaskSnapshot || (() => ({ running: false })),
    requestIdFactory: () => "tool-generated",
    now: () => NOW
  });
  return { tool, reads: () => reads };
}

test("get_context resolves the known lab4-starter teaching context", () => {
  const { tool } = toolFor("lab4-starter");
  const result = tool({}, { requestId: "request-lab4" });
  assert.equal(result.ok, true);
  assert.equal(result.data.branch, "lab4-starter");
  assert.equal(result.data.lab, "lab4");
  assert.equal(result.data.variant, "starter");
  assert.equal(result.data.expectedBranch, true);
});

test("get_context resolves main through the shared protocol catalog", () => {
  const { tool } = toolFor("main");
  const result = tool({});
  assert.equal(result.data.lab, "lab7");
  assert.equal(result.data.variant, "complete");
  assert.equal(result.data.expectedBranch, true);
});

test("get_context safely returns a custom context for an unknown branch", () => {
  const { tool } = toolFor("student-local-work");
  const result = tool({});
  assert.equal(result.ok, true);
  assert.equal(result.data.lab, null);
  assert.equal(result.data.variant, "custom");
  assert.equal(result.data.expectedBranch, false);
});

test("branch and commit come from one fresh readWorkspaceContext call", () => {
  const { tool, reads } = toolFor("lab4-starter", { commit: "def5678" });
  const result = tool({}, {
    expectedBranch: "lab4-starter",
    expectedCommit: "def5678"
  });
  assert.equal(reads(), 1);
  assert.equal(result.data.branch, "lab4-starter");
  assert.equal(result.data.commit, "def5678");
  assert.equal(result.meta.commit, "def5678");
});

test("clean workspace status contains counts only", () => {
  assert.deepEqual(parsePorcelainStatus(""), {
    clean: true,
    stagedFiles: 0,
    modifiedFiles: 0,
    untrackedFiles: 0,
    conflictedFiles: 0
  });
});

test("modified workspace status is counted without returning paths", () => {
  assert.deepEqual(parsePorcelainStatus(" M kernel/src/main.rs\0"), {
    clean: false,
    stagedFiles: 0,
    modifiedFiles: 1,
    untrackedFiles: 0,
    conflictedFiles: 0
  });
});

test("staged, untracked and conflicted workspace entries are counted", () => {
  const status = parsePorcelainStatus([
    "M  kernel/src/main.rs",
    "?? notes.txt",
    "UU kernel/src/trap.rs",
    ""
  ].join("\0"));
  assert.deepEqual(status, {
    clean: false,
    stagedFiles: 1,
    modifiedFiles: 0,
    untrackedFiles: 1,
    conflictedFiles: 1
  });
  assert.equal(Object.hasOwn(status, "files"), false);
});

test("get_context normalizes an idle task snapshot", () => {
  const { tool } = toolFor("lab4-starter");
  assert.deepEqual(tool({}).data.task, {
    running: false,
    kind: null,
    phase: "idle",
    runId: null,
    startedAt: null,
    canStop: false
  });
});

test("get_context returns the current running task snapshot", () => {
  const { tool } = toolFor("lab4-starter", {
    getTaskSnapshot: () => ({
      running: true,
      kind: "interactive-run",
      phase: "running",
      runId: "run-123",
      startedAt: NOW,
      canStop: true
    })
  });
  assert.deepEqual(tool({}).data.task, {
    running: true,
    kind: "interactive-run",
    phase: "running",
    runId: "run-123",
    startedAt: "2026-08-11T10:20:30.000Z",
    canStop: true
  });
});

test("get_context rejects a stale invocation context without changing Git", () => {
  const { tool } = toolFor("lab4-starter", { commit: "new5678" });
  const result = tool({}, {
    expectedBranch: "lab4-starter",
    expectedCommit: "old1234"
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "context_changed");
  assert.equal(result.error.retryable, true);
  assert.equal(result.data, null);
});

test("successful ToolResult uses the unified JSON contract", () => {
  const { tool } = toolFor("lab4-starter");
  const result = tool({}, { requestId: "request-success" });
  assert.equal(result.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(result.tool, "get_context");
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.equal(result.meta.requestId, "request-success");
  assert.equal(result.meta.generatedAt, "2026-08-11T10:20:30.000Z");
});

test("failed ToolResult is structured and never exposes an exception stack", () => {
  const failure = createToolFailure("get_context", new Error("secret stack content"), {
    requestId: "request-failure",
    branch: "unknown",
    commit: "unknown",
    generatedAt: "2026-08-11T10:20:30.000Z"
  });
  assert.equal(failure.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(failure.ok, false);
  assert.equal(failure.data, null);
  assert.equal(failure.error.code, "tool_execution_failed");
  assert.equal(Object.hasOwn(failure.error, "stack"), false);
  assert.doesNotMatch(JSON.stringify(failure), /secret stack content/);
});

test("tool input cannot override branch or commit", () => {
  const { tool } = toolFor("lab4-starter");
  const result = tool({ branch: "main" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "context_override_forbidden");
  assert.equal(result.error.details.field, "branch");
});

test("invalid invocation context still returns the structured policy error", () => {
  const { tool } = toolFor("lab4-starter");
  const result = tool({}, { expectedBranch: "" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid_invocation_context");
  assert.equal(Object.hasOwn(result.error, "stack"), false);
});
