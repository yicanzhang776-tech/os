"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  GET_RUN_RESULT_MAX_DIAGNOSTICS,
  GET_RUN_RESULT_MAX_EVIDENCE_SEQUENCES,
  GET_RUN_RESULT_SCHEMA_VERSION,
  SafeToolError,
  createGetCodeDiffTool,
  createGetContextTool,
  createGetQemuEventsTool,
  createGetRunResultTool,
  createReadCodeTool,
  createRunTestTool,
  createToolFailure,
  parsePorcelainStatus
} = require("./tools");
const { TOOL_CONTRACT_VERSION } = require("./policy");
const { RunStore } = require("./run-store");
const { TEST_REGISTRY } = require("./test-registry");
const { normalizeTeachingEvent, parseSerialLine } = require("../protocol");

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

function writeFixtureFile(repoDir, relativePath, content) {
  const filePath = path.join(repoDir, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function withReadCodeFixture(callback) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "os-tutor-read-code-"));
  try {
    writeFixtureFile(repoDir, "Cargo.toml", "[workspace]\nmembers = [\"kernel\"]\n");
    writeFixtureFile(repoDir, "kernel/Cargo.toml", "[package]\nname = \"kernel\"\n");
    writeFixtureFile(repoDir, "kernel/src/lib.rs", "pub mod memory;\n// 教学内核\npub mod trap;\n");
    writeFixtureFile(repoDir, "docs/labs/lab1/README.md", "# Lab 1\n\nStudent notes.\n");
    return callback(repoDir);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

function readCodeToolFor(repoDir, options = {}) {
  let contextReads = 0;
  const tool = createReadCodeTool({
    repoDir,
    readWorkspaceContext() {
      contextReads += 1;
      return {
        branch: options.branch || "lab4-starter",
        commit: options.commit || "abc1234"
      };
    },
    fileSystem: options.fileSystem,
    requestIdFactory: () => "read-code-generated",
    now: () => NOW
  });
  return { tool, contextReads: () => contextReads };
}

function readCodeFailure(relativePath, expectedCode) {
  return withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({ path: relativePath });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, expectedCode);
    assert.equal(result.data, null);
    return result;
  });
}

function codeDiffToolFor(options = {}) {
  let contextReads = 0;
  let engineCalls = 0;
  const contexts = options.contexts || [
    { branch: "lab4-starter", commit: "abc1234" },
    { branch: "lab4-starter", commit: "abc1234" }
  ];
  const data = options.data || {
    schemaVersion: "os-tutor.code-diff/v1",
    lab: "lab4",
    baseline: {
      ref: "refs/remotes/origin/lab4-starter",
      commit: "a".repeat(40)
    },
    student: {
      branch: "lab4-starter",
      commit: "abc1234",
      workspaceDirty: false
    },
    scope: ["kernel/src/"],
    files: [],
    untrackedTeachingFiles: [],
    untrackedIncluded: false,
    untrackedTruncated: false,
    contextLines: 3,
    returnedLines: 0,
    maxLines: 400,
    maxBytes: 64 * 1024,
    truncated: false,
    omittedFiles: [],
    omittedFilesTruncated: false,
    diff: ""
  };
  const tool = createGetCodeDiffTool({
    readWorkspaceContext() {
      const selected = contexts[Math.min(contextReads, contexts.length - 1)];
      contextReads += 1;
      return selected;
    },
    codeDiffEngine(args, context) {
      engineCalls += 1;
      if (options.engineError) throw options.engineError;
      if (typeof options.codeDiffEngine === "function") {
        return options.codeDiffEngine(args, context);
      }
      return structuredClone(data);
    },
    requestIdFactory: () => "code-diff-generated",
    now: () => NOW
  });
  return {
    tool,
    contextReads: () => contextReads,
    engineCalls: () => engineCalls
  };
}

function qemuRunInput(runId = "run-1", overrides = {}) {
  return {
    runId,
    taskKind: "interactive-run",
    branch: "lab4-starter",
    commit: "abc1234",
    lab: "lab4",
    variant: "starter",
    target: "riscv64gc-unknown-none-elf",
    ...overrides
  };
}

function qemuEvent(sequence, overrides = {}) {
  return {
    protocol: "os-demo.event/v1",
    lab: "lab4",
    step: `step-${sequence}`,
    status: "running",
    detail: `event ${sequence}`,
    source: "console",
    raw: `[Lab4] event ${sequence}`,
    sequence,
    timestamp: NOW + sequence,
    ...overrides
  };
}

function recordQemuEvents(store, runId, events) {
  for (const event of events) assert.equal(store.recordEvent(runId, event), true);
}

function qemuEventsToolFor(store, options = {}) {
  let contextReads = 0;
  const tool = createGetQemuEventsTool({
    runStore: store,
    readWorkspaceContext() {
      contextReads += 1;
      return {
        branch: options.branch || "lab4-starter",
        commit: options.commit || "abc1234"
      };
    },
    requestIdFactory: () => "qemu-events-generated",
    now: () => NOW
  });
  return { tool, contextReads: () => contextReads };
}

function runResultToolFor(store, options = {}) {
  let contextReads = 0;
  const tool = createGetRunResultTool({
    runStore: store,
    readWorkspaceContext() {
      contextReads += 1;
      return {
        branch: options.branch || "lab4-starter",
        commit: options.commit || "abc1234"
      };
    },
    diagnose: options.diagnose,
    requestIdFactory: () => "run-result-generated",
    now: () => NOW
  });
  return { tool, contextReads: () => contextReads };
}

function completeQemuRun(store, options = {}) {
  const runId = options.runId || "completed-run";
  const input = {
    startedAt: 100,
    ...options.input
  };
  store.startRun(qemuRunInput(runId, input));
  const build = options.build || { status: "success", exitCode: 0 };
  const qemu = options.qemu || { status: "finished", exitCode: 0 };
  store.updateBuild(runId, build.status, build.exitCode);
  store.updateQemu(runId, qemu.status, qemu.exitCode);
  recordQemuEvents(store, runId, options.events || []);
  for (const line of options.stableOutput || []) store.recordOutput(runId, line);
  return store.completeRun(runId, {
    endedAt: 160,
    finalResult: "finished",
    ...options.result
  });
}

function completedSnapshot(options = {}) {
  const store = new RunStore();
  completeQemuRun(store, options);
  return store.getLastCompletedRun();
}

function snapshotStore(lastCompletedRun, activeRun = null) {
  return {
    getActiveRun: () => activeRun,
    getLastCompletedRun: () => lastCompletedRun
  };
}

function runTestToolFor(options = {}) {
  let contextReads = 0;
  let preflightCalls = 0;
  let startCalls = 0;
  const contexts = options.contexts || [
    { branch: options.branch || "lab4-starter", commit: options.commit || "abc1234" },
    { branch: options.branch || "lab4-starter", commit: options.commit || "abc1234" }
  ];
  const received = [];
  const tool = createRunTestTool({
    registry: options.registry || TEST_REGISTRY,
    readWorkspaceContext() {
      const selected = contexts[Math.min(contextReads, contexts.length - 1)];
      contextReads += 1;
      if (selected instanceof Error) throw selected;
      return selected;
    },
    readPreflight() {
      preflightCalls += 1;
      if (options.preflightError) throw options.preflightError;
      return options.preflight || {
        ok: true,
        checks: [
          { name: "cargo", ok: true },
          { name: "Rust target", ok: true },
          { name: "QEMU", ok: true }
        ]
      };
    },
    startApprovedRun(input) {
      startCalls += 1;
      received.push(input);
      if (typeof options.startApprovedRun === "function") {
        return options.startApprovedRun(input, startCalls);
      }
      if (options.startError) throw options.startError;
      return options.started || {
        started: true,
        runId: "run-test-1",
        startedAt: NOW,
        activeTask: { kind: "agent-test", runId: "run-test-1" }
      };
    },
    requestIdFactory: () => "run-test-generated",
    now: () => NOW
  });
  return {
    tool,
    contextReads: () => contextReads,
    preflightCalls: () => preflightCalls,
    startCalls: () => startCalls,
    received
  };
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

test("unknown and safe-looking errors cannot cross the trusted error boundary", () => {
  const secret = "TEST_SECRET_DO_NOT_LEAK_9A";
  const windowsPath = "C:\\Users\\secret\\token.txt";
  const posixPath = "/home/test/.secret/token";
  const meta = {
    requestId: "request-untrusted-errors",
    branch: "unknown",
    commit: "unknown",
    generatedAt: "2026-08-11T10:20:30.000Z"
  };
  const ordinaryError = new Error(`${secret} ${windowsPath}`);
  ordinaryError.stack = `${secret} ${posixPath}`;
  const safeLooking = {
    code: "context_unavailable",
    message: `${secret} ${windowsPath}`,
    retryable: true,
    details: { path: posixPath, nested: { secret } },
    stack: `${secret} ${windowsPath}`
  };
  const prototypeSpoof = { ...safeLooking };
  Object.setPrototypeOf(prototypeSpoof, SafeToolError.prototype);
  const createdFromPrototype = Object.create(SafeToolError.prototype);
  Object.assign(createdFromPrototype, safeLooking);

  for (const error of [
    ordinaryError,
    safeLooking,
    prototypeSpoof,
    createdFromPrototype,
    null,
    secret,
    9
  ]) {
    const result = createToolFailure("get_context", error, meta);
    assert.deepEqual(result.error, {
      code: "tool_execution_failed",
      message: "The tool could not complete the request.",
      retryable: false,
      details: {}
    });
    assert.doesNotMatch(
      JSON.stringify(result),
      /TEST_SECRET_DO_NOT_LEAK_9A|Users\\secret|\/home\/test|context_unavailable/
    );
  }
});

test("a genuinely constructed SafeToolError keeps its stable safe fields", () => {
  const result = createToolFailure(
    "get_context",
    new SafeToolError(
      "context_changed",
      "The workspace branch or commit changed before the tool executed.",
      true,
      { expectedBranch: "lab4-starter" }
    ),
    {
      requestId: "request-trusted-error",
      branch: "lab4-starter",
      commit: "abc1234",
      generatedAt: "2026-08-11T10:20:30.000Z"
    }
  );
  assert.deepEqual(result.error, {
    code: "context_changed",
    message: "The workspace branch or commit changed before the tool executed.",
    retryable: true,
    details: { expectedBranch: "lab4-starter" }
  });
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
  assert.deepEqual(result.error.details, { field: "expectedBranch" });
  assert.equal(Object.hasOwn(result.error, "stack"), false);
});

test("read_code reads an allowed Rust source file", () => {
  withReadCodeFixture((repoDir) => {
    const expected = fs.readFileSync(path.join(repoDir, "kernel", "src", "lib.rs"));
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/lib.rs" });
    assert.equal(result.ok, true);
    assert.equal(result.data.content, expected.toString("utf8"));
    assert.equal(result.data.fileSizeBytes, expected.length);
    assert.equal(
      result.data.contentSha256,
      crypto.createHash("sha256").update(expected).digest("hex")
    );
  });
});

test("read_code reads allowed student Markdown", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({ path: "docs/labs/lab1/README.md" });
    assert.equal(result.ok, true);
    assert.match(result.data.content, /Student notes/);
  });
});

test("read_code reads the root Cargo.toml exact whitelist entry", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({ path: "Cargo.toml" });
    assert.equal(result.ok, true);
    assert.match(result.data.content, /\[workspace\]/);
  });
});

test("read_code reads kernel/Cargo.toml as an exact whitelist entry", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/Cargo.toml" });
    assert.equal(result.ok, true);
    assert.match(result.data.content, /name = \"kernel\"/);
  });
});

test("read_code applies an explicit startLine and endLine", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/lines.rs", "one\ntwo\nthree\nfour\n");
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/lines.rs",
      startLine: 2,
      endLine: 3
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.startLine, 2);
    assert.equal(result.data.endLine, 3);
    assert.equal(result.data.totalLines, 4);
    assert.equal(result.data.content, "two\nthree\n");
    assert.equal(result.data.truncated, false);
  });
});

test("read_code defaults to at most 200 lines and reports truncation", () => {
  withReadCodeFixture((repoDir) => {
    const content = Array.from({ length: 250 }, (_, index) => `line ${index + 1}\n`).join("");
    writeFixtureFile(repoDir, "kernel/src/many_lines.rs", content);
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/many_lines.rs" });
    assert.equal(result.ok, true);
    assert.equal(result.data.endLine, 200);
    assert.equal(result.data.totalLines, 250);
    assert.equal(result.data.content.split("\n").length - 1, 200);
    assert.equal(result.data.truncated, true);
  });
});

test("read_code accepts an explicit 400-line range", () => {
  withReadCodeFixture((repoDir) => {
    const content = Array.from({ length: 450 }, (_, index) => `${index + 1}\n`).join("");
    writeFixtureFile(repoDir, "kernel/src/four_hundred.rs", content);
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/four_hundred.rs",
      startLine: 1,
      endLine: 400
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.endLine, 400);
    assert.equal(result.data.truncated, false);
  });
});

test("read_code rejects a range larger than 400 lines", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/lib.rs",
      startLine: 1,
      endLine: 401
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_line_range");
  });
});

test("read_code enforces the default 32 KiB return limit", () => {
  withReadCodeFixture((repoDir) => {
    const content = Array.from({ length: 200 }, () => `${"x".repeat(199)}\n`).join("");
    writeFixtureFile(repoDir, "kernel/src/default_bytes.rs", content);
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/default_bytes.rs",
      endLine: 200
    });
    assert.equal(result.ok, true);
    assert.ok(result.data.returnedBytes <= 32 * 1024);
    assert.equal(result.data.truncated, true);
  });
});

test("read_code accepts maxBytes at the 64 KiB limit", () => {
  withReadCodeFixture((repoDir) => {
    const content = Array.from({ length: 400 }, () => `${"x".repeat(199)}\n`).join("");
    writeFixtureFile(repoDir, "kernel/src/max_bytes.rs", content);
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/max_bytes.rs",
      endLine: 400,
      maxBytes: 64 * 1024
    });
    assert.equal(result.ok, true);
    assert.ok(result.data.returnedBytes > 32 * 1024);
    assert.ok(result.data.returnedBytes <= 64 * 1024);
    assert.equal(result.data.truncated, true);
  });
});

test("read_code rejects maxBytes above 64 KiB", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/lib.rs",
      maxBytes: 64 * 1024 + 1
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_tool_input");
    assert.equal(result.error.details.field, "maxBytes");
  });
});

test("read_code rejects source files larger than 256 KiB", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/too_large.rs", "x".repeat(256 * 1024 + 1));
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/too_large.rs" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "file_too_large");
    assert.equal(result.error.details.maxFileSizeBytes, 256 * 1024);
  });
});

test("read_code rejects parent-directory traversal", () => {
  readCodeFailure("kernel/src/../Cargo.toml", "path_traversal");
});

test("read_code rejects POSIX absolute paths", () => {
  readCodeFailure("/kernel/src/lib.rs", "absolute_path_forbidden");
});

test("read_code rejects Windows drive paths", () => {
  readCodeFailure("C:/kernel/src/lib.rs", "absolute_path_forbidden");
});

test("read_code rejects nested Windows drive path segments", () => {
  readCodeFailure("kernel/src/C:/outside.rs", "absolute_path_forbidden");
});

test("read_code rejects backslash path bypasses", () => {
  readCodeFailure("kernel\\src\\..\\.env", "path_traversal");
});

test("read_code rejects NUL characters in paths", () => {
  readCodeFailure("kernel/src/lib.rs\u0000.md", "invalid_path");
});

test("read_code rejects .git paths", () => {
  readCodeFailure(".git/config.toml", "forbidden_path");
});

test("read_code rejects .env and .env.* paths", async (t) => {
  for (const relativePath of ["docs/labs/.env", "docs/labs/.env.local"]) {
    await t.test(relativePath, () => {
      readCodeFailure(relativePath, "forbidden_path");
    });
  }
});

test("read_code rejects target paths", () => {
  readCodeFailure("kernel/src/target/generated.rs", "forbidden_path");
});

test("read_code rejects PEM, key, and token files", async (t) => {
  for (const relativePath of [
    "docs/labs/certificate.pem",
    "docs/labs/private.key",
    "docs/labs/access.token"
  ]) {
    await t.test(relativePath, () => {
      readCodeFailure(relativePath, "forbidden_path");
    });
  }
});

test("read_code rejects secrets.* files", () => {
  readCodeFailure("docs/labs/secrets.toml", "forbidden_path");
});

test("read_code rejects SOLUTION.md", () => {
  readCodeFailure("docs/labs/lab1/SOLUTION.md", "solution_content_forbidden");
});

test("read_code rejects TEACHER_GUIDE.md", () => {
  readCodeFailure("docs/labs/lab1/TEACHER_GUIDE.md", "solution_content_forbidden");
});

test("read_code rejects clearly named reference implementations", () => {
  readCodeFailure(
    "docs/labs/lab1/reference-implementation.md",
    "solution_content_forbidden"
  );
});

test("read_code rejects files with an unapproved extension", () => {
  readCodeFailure("kernel/src/generated.bin", "forbidden_extension");
});

test("read_code rejects NUL-containing binary files", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/binary.rs", Buffer.from([0x61, 0x00, 0x62]));
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/binary.rs" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "binary_file");
  });
});

test("read_code rejects invalid UTF-8 files", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/invalid_utf8.rs", Buffer.from([0xc3, 0x28]));
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/invalid_utf8.rs" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "binary_file");
  });
});

test("read_code rejects a resolved symlink escape before reading", () => {
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "os-tutor-outside-"));
  try {
    withReadCodeFixture((repoDir) => {
      const outsideFile = writeFixtureFile(outsideDir, "secret.rs", "do not read\n");
      const escapePath = path.resolve(repoDir, "kernel", "src", "escape.rs");
      let fileReads = 0;
      const fileSystem = {
        realpathSync(candidate) {
          if (path.resolve(candidate) === escapePath) return outsideFile;
          return fs.realpathSync(candidate);
        },
        statSync: fs.statSync,
        readFileSync(candidate) {
          fileReads += 1;
          return fs.readFileSync(candidate);
        }
      };
      const result = readCodeToolFor(repoDir, { fileSystem }).tool({
        path: "kernel/src/escape.rs"
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "forbidden_path");
      assert.equal(fileReads, 0);
    });
  } finally {
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("read_code rejects a missing file with a structured error", () => {
  readCodeFailure("kernel/src/missing.rs", "file_not_found");
});

test("read_code rejects a directory even when its name has an allowed extension", () => {
  withReadCodeFixture((repoDir) => {
    fs.mkdirSync(path.join(repoDir, "kernel", "src", "directory.rs"));
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/directory.rs" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "not_a_file");
  });
});

test("read_code returns valid UTF-8 without splitting a multibyte character", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/utf8.rs", "你好世界\n");
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/utf8.rs",
      maxBytes: 5
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.content, "你");
    assert.equal(result.data.returnedBytes, 3);
    assert.equal(result.data.truncated, true);
  });
});

test("read_code marks explicit byte truncation", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/truncated.rs", "first line\nsecond line\n");
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/truncated.rs",
      endLine: 2,
      maxBytes: 11
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.content, "first line\n");
    assert.equal(result.data.returnedBytes, 11);
    assert.equal(result.data.truncated, true);
  });
});

test("read_code returns context_changed before touching a stale file", () => {
  withReadCodeFixture((repoDir) => {
    let fileReads = 0;
    const fileSystem = {
      realpathSync: fs.realpathSync,
      statSync: fs.statSync,
      readFileSync(candidate) {
        fileReads += 1;
        return fs.readFileSync(candidate);
      }
    };
    const result = readCodeToolFor(repoDir, {
      commit: "new5678",
      fileSystem
    }).tool({ path: "kernel/src/lib.rs" }, {
      expectedBranch: "lab4-starter",
      expectedCommit: "old1234"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "context_changed");
    assert.equal(result.error.retryable, true);
    assert.equal(fileReads, 0);
  });
});

test("successful read_code ToolResult reuses the unified contract", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/lib.rs" }, {
      requestId: "request-read-code",
      expectedBranch: "lab4-starter",
      expectedCommit: "abc1234"
    });
    assert.equal(result.contractVersion, TOOL_CONTRACT_VERSION);
    assert.equal(result.tool, "read_code");
    assert.equal(result.ok, true);
    assert.equal(result.error, null);
    assert.equal(result.meta.requestId, "request-read-code");
    assert.equal(result.meta.branch, "lab4-starter");
    assert.equal(result.meta.commit, "abc1234");
    assert.equal(result.meta.generatedAt, "2026-08-11T10:20:30.000Z");
    assert.equal(Object.hasOwn(result.data, "repoDir"), false);
  });
});

test("failed read_code ToolResult is structured and hides host paths", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/missing.rs" });
    assert.equal(result.contractVersion, TOOL_CONTRACT_VERSION);
    assert.equal(result.tool, "read_code");
    assert.equal(result.ok, false);
    assert.equal(result.data, null);
    assert.equal(Object.hasOwn(result.error, "stack"), false);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(repoDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("read_code input cannot override branch or commit", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/lib.rs",
      expectedCommit: "attacker-controlled"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "context_override_forbidden");
    assert.equal(result.error.details.field, "expectedCommit");
  });
});

test("read_code rejects unknown input fields", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/lib.rs",
      repoDir: "C:/outside"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_tool_input");
    assert.equal(result.error.details.field, "repoDir");
  });
});

test("read_code rejects invalid line values", () => {
  withReadCodeFixture((repoDir) => {
    for (const args of [
      { path: "kernel/src/lib.rs", startLine: 0 },
      { path: "kernel/src/lib.rs", startLine: 2, endLine: 1 },
      { path: "kernel/src/lib.rs", startLine: 1.5 }
    ]) {
      const result = readCodeToolFor(repoDir).tool(args);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "invalid_line_range");
    }
  });
});

test("read_code rejects a startLine beyond the file", () => {
  withReadCodeFixture((repoDir) => {
    const result = readCodeToolFor(repoDir).tool({
      path: "kernel/src/lib.rs",
      startLine: 99
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_line_range");
    assert.equal(result.error.details.totalLines, 3);
  });
});

test("read_code accepts uppercase assembly .S files", () => {
  withReadCodeFixture((repoDir) => {
    writeFixtureFile(repoDir, "kernel/src/switch.S", ".section .text\n");
    const result = readCodeToolFor(repoDir).tool({ path: "kernel/src/switch.S" });
    assert.equal(result.ok, true);
    assert.equal(result.data.encoding, "utf-8");
  });
});

test("get_qemu_events reports when no run is available", () => {
  const result = qemuEventsToolFor(new RunStore()).tool({});
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.equal(result.error.code, "no_run_available");
  assert.equal(Object.hasOwn(result.error, "stack"), false);
});

test("get_qemu_events reads the active run by default", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [qemuEvent(1)]);
  const result = qemuEventsToolFor(store).tool({});
  assert.equal(result.ok, true);
  assert.equal(result.data.runId, "run-1");
  assert.equal(result.data.branch, "lab4-starter");
  assert.equal(result.data.commit, "abc1234");
  assert.equal(result.data.lab, "lab4");
  assert.equal(result.data.variant, "starter");
  assert.equal(result.data.source, "activeRun");
  assert.equal(result.data.active, true);
  assert.equal(result.data.eventProtocol, "os-demo.event/v1");
});

test("get_qemu_events falls back to the last completed run", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput("completed-run"));
  recordQemuEvents(store, "completed-run", [qemuEvent(3)]);
  store.completeRun("completed-run", { finalResult: "finished" });
  const result = qemuEventsToolFor(store).tool({});
  assert.equal(result.ok, true);
  assert.equal(result.data.runId, "completed-run");
  assert.equal(result.data.source, "lastCompletedRun");
  assert.equal(result.data.active, false);
  assert.deepEqual(result.data.events.map((event) => event.sequence), [3]);
});

test("realistic firmware and timeout evidence survives finalization for get_qemu_events", () => {
  const store = new RunStore({ now: () => NOW });
  const runId = "lab1-realistic-timeout";
  store.startRun(qemuRunInput(runId, {
    branch: "lab1-starter",
    lab: "lab1"
  }));
  const evidence = [
    [parseSerialLine("OpenSBI v0.9", { lab: "lab1" }), "OpenSBI v0.9"],
    [
      parseSerialLine("Domain0 Next Mode : S-mode", { lab: "lab1" }),
      "Domain0 Next Mode : S-mode"
    ],
    [normalizeTeachingEvent({
      lab: "lab1",
      step: "qemu-timeout",
      status: "fail",
      detail: "QEMU 运行阶段未在时限内结束；是否执行到固件或内核需结合串口事件判断",
      source: "lifecycle"
    }), "[demo] qemu timeout ended the run."]
  ];
  evidence.forEach(([event, raw], index) => {
    assert.equal(store.recordEvent(runId, {
      ...event,
      raw,
      sequence: index + 1,
      timestamp: NOW + index
    }), true);
  });
  store.updateBuild(runId, "success", 0);
  store.updateQemu(runId, "timeout");
  store.completeRun(runId, {
    finalResult: "timeout",
    timedOut: true,
    error: { code: "qemu_timeout", message: "qemu timeout ended the run.", stage: "qemu" }
  });

  const result = qemuEventsToolFor(store, { branch: "lab1-starter" }).tool({ runId });
  assert.equal(result.ok, true);
  assert.equal(result.data.source, "lastCompletedRun");
  assert.equal(result.data.active, false);
  assert.equal(result.data.returnedCount, 3);
  assert.equal(result.data.totalMatched, 3);
  assert.deepEqual(result.data.events.map((event) => event.step), [
    "opensbi-started", "s-mode-handoff-observed", "qemu-timeout"
  ]);
  assert.equal(result.data.events.some((event) => event.step === "panic"), false);
  assert.equal(result.data.events.some((event) => /exception/.test(event.step)), false);
});

test("get_qemu_events keeps a valid empty result when no serial evidence matches", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput("empty-completed-run"));
  store.completeRun("empty-completed-run", { finalResult: "finished" });
  const result = qemuEventsToolFor(store).tool({ runId: "empty-completed-run" });
  assert.equal(result.ok, true);
  assert.equal(result.data.returnedCount, 0);
  assert.equal(result.data.totalMatched, 0);
  assert.deepEqual(result.data.events, []);
});

test("get_qemu_events selects either retained run by exact runId", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput("completed-run"));
  recordQemuEvents(store, "completed-run", [qemuEvent(1)]);
  store.completeRun("completed-run", { finalResult: "finished" });
  store.startRun(qemuRunInput("active-run"));
  recordQemuEvents(store, "active-run", [qemuEvent(2)]);

  const tool = qemuEventsToolFor(store).tool;
  const completed = tool({ runId: "completed-run" });
  const active = tool({ runId: "active-run" });
  assert.equal(completed.ok, true);
  assert.equal(completed.data.active, false);
  assert.deepEqual(completed.data.events.map((event) => event.sequence), [1]);
  assert.equal(active.ok, true);
  assert.equal(active.data.active, true);
  assert.deepEqual(active.data.events.map((event) => event.sequence), [2]);
});

test("get_qemu_events distinguishes invalid and unavailable runIds", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  const tool = qemuEventsToolFor(store).tool;
  for (const runId of ["", "../run", null, "x".repeat(81)]) {
    const result = tool({ runId });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_run_id");
  }
  const missing = tool({ runId: "other-run" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "run_not_found");
});

test("get_qemu_events applies the default limit and reports truncation", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", Array.from({ length: 51 }, (_, index) => qemuEvent(index + 1)));
  const result = qemuEventsToolFor(store).tool({});
  assert.equal(result.ok, true);
  assert.equal(result.data.limit, 50);
  assert.equal(result.data.totalMatched, 51);
  assert.equal(result.data.returnedCount, 50);
  assert.equal(result.data.truncated, true);
});

test("get_qemu_events accepts limit 1 and the maximum limit 100", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", Array.from({ length: 101 }, (_, index) => qemuEvent(index + 1)));
  const tool = qemuEventsToolFor(store).tool;
  const one = tool({ limit: 1 });
  const hundred = tool({ limit: 100 });
  assert.equal(one.data.returnedCount, 1);
  assert.equal(one.data.truncated, true);
  assert.equal(hundred.data.returnedCount, 100);
  assert.equal(hundred.data.truncated, true);
});

test("get_qemu_events rejects limits outside 1 through 100", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  const tool = qemuEventsToolFor(store).tool;
  for (const limit of [0, -1, 101, 1.5, Infinity]) {
    const result = tool({ limit });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_limit");
  }
});

test("get_qemu_events combines lab and existing protocol status filters", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [
    qemuEvent(1, { lab: "lab4", status: "running" }),
    qemuEvent(2, { lab: "lab4", status: "fail" }),
    qemuEvent(3, { lab: "lab5", status: "fail" }),
    qemuEvent(4, { lab: "p0", status: "pass" })
  ]);
  const tool = qemuEventsToolFor(store).tool;
  assert.deepEqual(tool({ lab: "lab4" }).data.events.map((event) => event.sequence), [1, 2]);
  assert.deepEqual(tool({ status: "fail" }).data.events.map((event) => event.sequence), [2, 3]);
  assert.deepEqual(tool({ lab: "lab4", status: "fail" }).data.events
    .map((event) => event.sequence), [2]);
  assert.deepEqual(tool({ lab: "p0" }).data.events.map((event) => event.sequence), [4]);
});

test("get_qemu_events applies start, end, and combined sequence filters", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [qemuEvent(7), qemuEvent(8), qemuEvent(12), qemuEvent(15)]);
  const tool = qemuEventsToolFor(store).tool;
  assert.deepEqual(tool({ sequenceStart: 12 }).data.events.map((event) => event.sequence), [12, 15]);
  assert.deepEqual(tool({ sequenceEnd: 8 }).data.events.map((event) => event.sequence), [7, 8]);
  const range = tool({ sequenceStart: 8, sequenceEnd: 12 });
  assert.deepEqual(range.data.events.map((event) => event.sequence), [8, 12]);
  assert.equal(range.data.sequenceStart, 8);
  assert.equal(range.data.sequenceEnd, 12);
  assert.equal(range.data.truncated, false);
});

test("get_qemu_events rejects invalid sequence ranges", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  const tool = qemuEventsToolFor(store).tool;
  for (const args of [
    { sequenceStart: 5, sequenceEnd: 4 },
    { sequenceStart: -1 },
    { sequenceEnd: 1.5 }
  ]) {
    const result = tool(args);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_sequence_range");
  }
});

test("get_qemu_events preserves stored order and real sequence numbers", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [qemuEvent(7), qemuEvent(8), qemuEvent(12), qemuEvent(15)]);
  const result = qemuEventsToolFor(store).tool({ sequenceStart: 8, status: "running" });
  assert.deepEqual(result.data.events.map((event) => event.sequence), [8, 12, 15]);
});

test("get_qemu_events hides raw by default and bounds explicitly requested raw", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [
    qemuEvent(1, { raw: "x".repeat(900) }),
    qemuEvent(2, { raw: "C:\\private\\kernel.log api_key=unsafe PATH=/private/bin" })
  ]);
  const tool = qemuEventsToolFor(store).tool;
  const hidden = tool({});
  const included = tool({ includeRaw: true });
  assert.equal(hidden.data.includeRaw, false);
  assert.equal(Object.hasOwn(hidden.data.events[0], "raw"), false);
  assert.equal(included.data.includeRaw, true);
  assert.equal(included.data.events[0].raw.length, 500);
  assert.doesNotMatch(included.data.events[1].raw, /private|unsafe|PATH=/);
});

test("get_qemu_events does not mutate the RunStore event snapshots", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [qemuEvent(1), qemuEvent(2)]);
  const before = store.getActiveRun().events;
  const result = qemuEventsToolFor(store).tool({ limit: 1, includeRaw: false });
  result.data.events[0].detail = "changed by caller";
  assert.deepEqual(store.getActiveRun().events, before);
  assert.equal(store.getActiveRun().events.length, 2);
  assert.equal(Object.hasOwn(store.getActiveRun().events[0], "raw"), true);
});

test("get_qemu_events rejects invalid filters and protected or unknown fields", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  const tool = qemuEventsToolFor(store).tool;
  for (const lab of ["lab8", null]) {
    assert.equal(tool({ lab }).error.code, "invalid_lab");
  }
  for (const status of ["finished", null]) {
    assert.equal(tool({ status }).error.code, "invalid_status");
  }
  assert.equal(tool({ sequenceStart: null }).error.code, "invalid_sequence_range");
  assert.equal(tool({ includeRaw: "yes" }).error.code, "invalid_tool_input");
  assert.equal(tool({ branch: "other" }).error.code, "context_override_forbidden");
  assert.equal(tool({ history: true }).error.code, "invalid_tool_input");
});

test("get_qemu_events reuses invocation context_changed protection", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  const result = qemuEventsToolFor(store).tool({}, {
    expectedBranch: "lab4-starter",
    expectedCommit: "old-commit"
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "context_changed");
  assert.equal(result.error.retryable, true);
});

test("get_qemu_events rejects a run from another branch or commit", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput("stale-run", { commit: "old-commit" }));
  recordQemuEvents(store, "stale-run", [qemuEvent(1)]);
  const result = qemuEventsToolFor(store).tool({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "run_context_mismatch");
  assert.equal(result.error.details.runCommit, "old-commit");
  assert.equal(result.error.details.actualCommit, "abc1234");
});

test("get_qemu_events success and failure reuse the unified ToolResult", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [qemuEvent(1)]);
  const tool = qemuEventsToolFor(store).tool;
  const success = tool({}, { requestId: "request-qemu-events" });
  assert.equal(success.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(success.tool, "get_qemu_events");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.equal(success.meta.requestId, "request-qemu-events");
  assert.equal(success.meta.branch, "lab4-starter");
  assert.equal(success.meta.commit, "abc1234");
  assert.equal(success.meta.generatedAt, "2026-08-11T10:20:30.000Z");
  const failure = tool({ limit: 101 });
  assert.equal(failure.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(failure.tool, "get_qemu_events");
  assert.equal(failure.ok, false);
  assert.equal(failure.data, null);
  assert.equal(Object.hasOwn(failure.error, "stack"), false);
});

test("get_qemu_events returns only valid os-demo.event/v1 stored events", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", [
    qemuEvent(1),
    qemuEvent(2, { protocol: "other.event/v1" })
  ]);
  const result = qemuEventsToolFor(store).tool({});
  assert.equal(result.data.totalMatched, 1);
  assert.equal(result.data.returnedCount, 1);
  assert.equal(result.data.events.every((event) => event.protocol === "os-demo.event/v1"), true);
});

test("get_qemu_events returns at most 100 of RunStore's 512 retained events", () => {
  const store = new RunStore();
  store.startRun(qemuRunInput());
  recordQemuEvents(store, "run-1", Array.from({ length: 512 }, (_, index) => qemuEvent(index + 1)));
  const result = qemuEventsToolFor(store).tool({ limit: 100 });
  assert.equal(store.getActiveRun().events.length, 512);
  assert.equal(result.data.totalMatched, 512);
  assert.equal(result.data.returnedCount, 100);
  assert.equal(result.data.truncated, true);
});

test("get_run_result distinguishes no completed run from an active run", () => {
  const empty = runResultToolFor(new RunStore()).tool({});
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, "no_completed_run");
  assert.equal(empty.error.retryable, false);

  const store = new RunStore();
  store.startRun(qemuRunInput("active-run", { startedAt: 100 }));
  const active = runResultToolFor(store).tool({});
  assert.equal(active.ok, false);
  assert.equal(active.error.code, "run_in_progress");
  assert.equal(active.error.details.runId, "active-run");
});

test("get_run_result defaults to the completed run even while a newer run is active", () => {
  const store = new RunStore();
  completeQemuRun(store, { runId: "completed-run" });
  store.startRun(qemuRunInput("active-run", { startedAt: 200 }));

  const result = runResultToolFor(store).tool({});
  assert.equal(result.ok, true);
  assert.equal(result.data.runId, "completed-run");
  assert.equal(store.getActiveRun().runId, "active-run");
});

test("get_run_result selects exact completed and active runIds", () => {
  const store = new RunStore();
  completeQemuRun(store, { runId: "completed-run" });
  store.startRun(qemuRunInput("active-run", { startedAt: 200 }));
  const tool = runResultToolFor(store).tool;

  assert.equal(tool({ runId: "completed-run" }).data.runId, "completed-run");
  assert.equal(tool({ runId: "active-run" }).error.code, "run_in_progress");
  assert.equal(tool({ runId: "missing-run" }).error.code, "run_not_found");
});

test("get_run_result validates runId, lab, includeDiagnostics, and input fields", () => {
  const store = new RunStore();
  completeQemuRun(store);
  const tool = runResultToolFor(store).tool;

  for (const runId of ["", null, {}, [], "x".repeat(81)]) {
    assert.equal(tool({ runId }).error.code, "invalid_run_id");
  }
  for (const lab of ["lab8", null, {}, []]) {
    assert.equal(tool({ lab }).error.code, "invalid_lab");
  }
  assert.equal(tool({ lab: "lab4" }).ok, true);
  assert.equal(tool({ lab: "p0" }).error.code, "lab_mismatch");
  assert.equal(tool({ includeDiagnostics: "false" }).error.code, "invalid_include_diagnostics");
  assert.equal(tool({ branch: "other" }).error.code, "context_override_forbidden");
  assert.equal(tool({ commit: "other" }).error.code, "context_override_forbidden");
  for (const field of ["finalResult", "exitCode", "events", "command", "cwd", "env"]) {
    assert.equal(tool({ [field]: true }).error.code, "invalid_tool_input");
  }
});

test("get_run_result returns the unified ToolResult and stable result schema", () => {
  const store = new RunStore();
  completeQemuRun(store, {
    events: [qemuEvent(7, { step: "pass", status: "pass" })]
  });
  const tool = runResultToolFor(store).tool;
  const success = tool({}, { requestId: "request-run-result" });

  assert.equal(success.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(success.tool, "get_run_result");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.equal(success.meta.requestId, "request-run-result");
  assert.equal(success.meta.branch, "lab4-starter");
  assert.equal(success.meta.commit, "abc1234");
  assert.equal(success.meta.generatedAt, "2026-08-11T10:20:30.000Z");
  assert.equal(success.data.schemaVersion, GET_RUN_RESULT_SCHEMA_VERSION);
  assert.equal(success.data.eventProtocol, "os-demo.event/v1");
  assert.equal(success.data.runId, "completed-run");
  assert.equal(success.data.branch, "lab4-starter");
  assert.equal(success.data.commit, "abc1234");
  assert.equal(success.data.lab, "lab4");
  assert.equal(success.data.variant, "starter");
  assert.equal(success.data.target, "riscv64gc-unknown-none-elf");
  assert.deepEqual(success.data.build, { status: "success", exitCode: 0 });
  assert.deepEqual(success.data.qemu, { status: "finished", exitCode: 0 });
  assert.equal(success.data.finalResult, "pass");
  assert.equal(success.data.failureSummary, null);

  const failure = tool({ includeDiagnostics: 1 });
  assert.equal(failure.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(failure.tool, "get_run_result");
  assert.equal(failure.ok, false);
  assert.equal(failure.data, null);
  assert.equal(Object.hasOwn(failure.error, "stack"), false);
});

test("get_run_result derives teaching results only from the target lab", () => {
  const resultFor = (events, result = {}) => {
    const store = new RunStore();
    completeQemuRun(store, { events, result });
    return runResultToolFor(store).tool({ includeDiagnostics: false }).data.finalResult;
  };

  assert.equal(resultFor([qemuEvent(1, { step: "pass", status: "pass" })]), "pass");
  assert.equal(resultFor([
    qemuEvent(1, { step: "pass", status: "pass" }),
    qemuEvent(2, { step: "todo", status: "todo" })
  ]), "todo");
  assert.equal(resultFor([
    qemuEvent(1, { lab: "lab3", step: "pass", status: "pass" }),
    qemuEvent(2, { lab: "p0", step: "pass", status: "pass" })
  ]), "finished");
  assert.equal(resultFor([]), "finished");
  assert.equal(resultFor([qemuEvent(1, { step: "panic", status: "fail" })]), "fail");
  assert.equal(resultFor([], { finalResult: "pass" }), "finished");
  assert.equal(resultFor([], { finalResult: "todo" }), "finished");
  assert.equal(resultFor([], { finalResult: "fail" }), "finished");
});

test("get_run_result never promotes exitCode zero to PASS", () => {
  const store = new RunStore();
  completeQemuRun(store, {
    qemu: { status: "finished", exitCode: 0 },
    events: [qemuEvent(3, { step: "task-2-todo", status: "todo" })]
  });

  const result = runResultToolFor(store).tool({ includeDiagnostics: false });
  assert.equal(result.data.qemu.exitCode, 0);
  assert.equal(result.data.finalResult, "todo");
  assert.notEqual(result.data.finalResult, "pass");
});

test("get_run_result preserves timeout, stopped, and existing failure semantics", () => {
  const cases = [
    {
      qemu: { status: "timeout", exitCode: null },
      result: {
        finalResult: "timeout",
        timedOut: true,
        error: { code: "qemu_timeout", message: "qemu timeout ended the run.", stage: "qemu" }
      },
      expected: "timeout"
    },
    {
      qemu: { status: "stopped", exitCode: null },
      result: { finalResult: "stopped", manuallyStopped: true },
      expected: "stopped"
    },
    {
      build: { status: "failure", exitCode: 101 },
      qemu: { status: "not-started", exitCode: null },
      result: {
        finalResult: "build-failure",
        error: { code: "build_failure", message: "cargo build failed.", stage: "build" }
      },
      expected: "fail"
    },
    {
      qemu: { status: "failure", exitCode: 2 },
      result: {
        finalResult: "qemu-failure",
        error: { code: "qemu_failure", message: "QEMU exited with code 2.", stage: "qemu" }
      },
      expected: "fail"
    }
  ];

  for (const item of cases) {
    const store = new RunStore();
    completeQemuRun(store, item);
    const result = runResultToolFor(store).tool({ includeDiagnostics: false });
    assert.equal(result.data.finalResult, item.expected);
  }
});

test("get_run_result returns recorded lifecycle times and event counters", () => {
  const store = new RunStore();
  completeQemuRun(store, {
    events: [qemuEvent(7), qemuEvent(12)]
  });
  const result = runResultToolFor(store).tool({ includeDiagnostics: false });
  assert.equal(result.data.startedAt, 100);
  assert.equal(result.data.endedAt, 160);
  assert.equal(result.data.durationMs, 60);
  assert.equal(result.data.timedOut, false);
  assert.equal(result.data.manuallyStopped, false);
  assert.equal(result.data.eventCount, 2);
  assert.equal(result.data.lastEventSequence, 12);

  const noEvents = new RunStore();
  completeQemuRun(noEvents);
  assert.equal(runResultToolFor(noEvents).tool({ includeDiagnostics: false })
    .data.lastEventSequence, null);
});

test("get_run_result forms deterministic timeout, build, QEMU, and stopped summaries", () => {
  const timeoutStore = new RunStore();
  completeQemuRun(timeoutStore, {
    qemu: { status: "timeout", exitCode: null },
    events: [qemuEvent(7), qemuEvent(8), qemuEvent(12)],
    result: {
      finalResult: "timeout",
      timedOut: true,
      error: { code: "qemu_timeout", message: "qemu timeout ended the run.", stage: "qemu" }
    }
  });
  const timeout = runResultToolFor(timeoutStore).tool({ includeDiagnostics: false }).data;
  assert.deepEqual(timeout.failureSummary, {
    code: "qemu_timeout",
    phase: "qemu",
    message: "qemu timeout ended the run.",
    evidenceSequences: [8, 12]
  });

  const buildStore = new RunStore();
  completeQemuRun(buildStore, {
    build: { status: "failure", exitCode: 101 },
    qemu: { status: "not-started", exitCode: null },
    result: {
      finalResult: "build-failure",
      error: { code: "build_failure", message: "cargo build failed.", stage: "build" }
    }
  });
  const build = runResultToolFor(buildStore).tool({ includeDiagnostics: false }).data;
  assert.equal(build.failureSummary.code, "build_failure");
  assert.equal(build.failureSummary.phase, "build");
  assert.deepEqual(build.failureSummary.evidenceSequences, []);

  const qemuStore = new RunStore();
  completeQemuRun(qemuStore, {
    qemu: { status: "failure", exitCode: 2 },
    events: [qemuEvent(4, { step: "panic", status: "fail" })],
    result: {
      finalResult: "qemu-failure",
      error: { code: "qemu_failure", message: "QEMU exited with code 2.", stage: "qemu" }
    }
  });
  const qemu = runResultToolFor(qemuStore).tool({ includeDiagnostics: false }).data;
  assert.equal(qemu.failureSummary.code, "qemu_failure");
  assert.deepEqual(qemu.failureSummary.evidenceSequences, [4]);

  const stoppedStore = new RunStore();
  completeQemuRun(stoppedStore, {
    qemu: { status: "stopped", exitCode: null },
    result: { finalResult: "stopped", manuallyStopped: true }
  });
  const stopped = runResultToolFor(stoppedStore).tool({ includeDiagnostics: false }).data;
  assert.equal(stopped.failureSummary.code, "run_stopped");
  assert.equal(stopped.failureSummary.phase, "qemu");
  assert.match(stopped.failureSummary.message, /stopped manually/i);
});

test("get_run_result bounds and sanitizes stored failure summaries", () => {
  const events = Array.from({ length: 12 }, (_, index) => qemuEvent(index + 1, {
    status: "fail",
    step: `failure-${index + 1}`
  }));
  const snapshot = completedSnapshot({
    qemu: { status: "failure", exitCode: 2 },
    events,
    result: {
      finalResult: "qemu-failure",
      error: { code: "qemu_failure", message: "QEMU failed.", stage: "qemu" }
    }
  });
  snapshot.failureSummary = {
    code: "qemu_failure",
    phase: "qemu",
    message: `C:\\private\\kernel.log api_key=unsafe PATH=/private/bin ${"x".repeat(700)}`,
    evidenceSequences: [...Array.from({ length: 12 }, (_, index) => index + 1), 999]
  };
  const result = runResultToolFor(snapshotStore(snapshot)).tool({ includeDiagnostics: false });
  const summary = result.data.failureSummary;
  assert.equal(summary.message.length <= 500, true);
  assert.doesNotMatch(summary.message, /private|unsafe|PATH=/);
  assert.equal(summary.evidenceSequences.length, GET_RUN_RESULT_MAX_EVIDENCE_SEQUENCES);
  assert.deepEqual(summary.evidenceSequences, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(summary.evidenceSequences.includes(999), false);
});

test("get_run_result redacts bearer and service tokens without changing teaching text", () => {
  const snapshot = completedSnapshot({
    qemu: { status: "failure", exitCode: 2 },
    result: {
      finalResult: "qemu-failure",
      error: { code: "qemu_failure", message: "QEMU failed.", stage: "qemu" }
    }
  });
  const messages = [
    ["Bearer TOPSECRET", "TOPSECRET"],
    ["bearer abc123", "abc123"],
    ["ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ", "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ", "github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["glpat-ABCDEFGHIJKLMNOPQRSTUVWXYZ", "glpat-ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ", "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ", "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
  ];

  for (const [message, secret] of messages) {
    const candidate = structuredClone(snapshot);
    candidate.failureSummary = {
      code: "qemu_failure",
      phase: "qemu",
      message,
      evidenceSequences: []
    };
    const result = runResultToolFor(snapshotStore(candidate))
      .tool({ includeDiagnostics: false });
    assert.equal(result.ok, true);
    assert.equal(result.data.failureSummary.message.includes(secret), false, message);
    assert.match(result.data.failureSummary.message, /\[REDACTED\]/);
  }

  const combined = structuredClone(snapshot);
  combined.failureSummary = {
    code: "qemu_failure",
    phase: "qemu",
    message: "Bearer first ghp_SECOND github_pat_THIRD glpat-FOURTH sk-FIFTH sk-proj-SIXTH",
    evidenceSequences: []
  };
  const combinedResult = runResultToolFor(snapshotStore(combined))
    .tool({ includeDiagnostics: false });
  assert.doesNotMatch(
    combinedResult.data.failureSummary.message,
    /first|ghp_|github_pat_|glpat-|sk-/i
  );
  assert.equal(
    combinedResult.data.failureSummary.message.match(/\[REDACTED\]/g).length,
    6
  );

  const bounded = structuredClone(snapshot);
  bounded.failureSummary = {
    code: "qemu_failure",
    phase: "qemu",
    message: `${"x".repeat(480)} Bearer ${"s".repeat(200)}`,
    evidenceSequences: []
  };
  const boundedResult = runResultToolFor(snapshotStore(bounded))
    .tool({ includeDiagnostics: false });
  assert.equal(boundedResult.data.failureSummary.message.length <= 500, true);
  assert.doesNotMatch(boundedResult.data.failureSummary.message, /s{10}/);

  const teaching = structuredClone(snapshot);
  teaching.failureSummary = {
    code: "qemu_timeout",
    phase: "qemu",
    message: "QEMU timeout after 20 seconds",
    evidenceSequences: []
  };
  assert.equal(
    runResultToolFor(snapshotStore(teaching)).tool({ includeDiagnostics: false })
      .data.failureSummary.message,
    "QEMU timeout after 20 seconds"
  );
});

test("get_run_result revalidates stored teaching results against lifecycle and Lab evidence", () => {
  const finalResultFor = (options = {}) => {
    const store = new RunStore();
    completeQemuRun(store, options);
    return runResultToolFor(store).tool({ includeDiagnostics: false }).data.finalResult;
  };

  assert.equal(finalResultFor({
    qemu: { status: "failure", exitCode: 2 },
    result: { finalResult: "pass" }
  }), "fail");
  assert.equal(finalResultFor({
    build: { status: "failure", exitCode: 101 },
    qemu: { status: "not-started", exitCode: null },
    result: { finalResult: "pass" }
  }), "fail");
  assert.equal(finalResultFor({
    qemu: { status: "timeout", exitCode: null },
    result: { finalResult: "pass", timedOut: true }
  }), "timeout");
  assert.equal(finalResultFor({
    qemu: { status: "stopped", exitCode: null },
    result: { finalResult: "pass", manuallyStopped: true }
  }), "stopped");
  assert.equal(finalResultFor({ result: { finalResult: "pass" } }), "finished");
  assert.equal(finalResultFor({
    events: [qemuEvent(1, { lab: "lab3", step: "pass", status: "pass" })],
    result: { finalResult: "pass" }
  }), "finished");
  assert.equal(finalResultFor({
    events: [qemuEvent(1, { step: "pass", status: "pass" })],
    result: { finalResult: "pass" }
  }), "pass");
  assert.equal(finalResultFor({ result: { finalResult: "todo" } }), "finished");
  assert.equal(finalResultFor({
    events: [qemuEvent(1, { step: "task-2-todo", status: "todo" })],
    result: { finalResult: "todo" }
  }), "todo");
  assert.equal(finalResultFor({ result: { finalResult: "fail" } }), "finished");
  assert.equal(finalResultFor({
    events: [qemuEvent(1, { step: "panic", status: "fail" })],
    result: { finalResult: "fail" }
  }), "fail");
  assert.equal(finalResultFor({}), "finished");

  const immutableStore = new RunStore();
  completeQemuRun(immutableStore, {
    events: [qemuEvent(1, { step: "pass", status: "pass" })],
    result: { finalResult: "pass" }
  });
  const before = immutableStore.getLastCompletedRun();
  const result = runResultToolFor(immutableStore).tool({ includeDiagnostics: false });
  assert.equal(result.data.finalResult, "pass");
  assert.deepEqual(immutableStore.getLastCompletedRun(), before);
});

test("get_run_result reuses diagnostics by default, caps them, and supports opt-out", () => {
  const store = new RunStore();
  completeQemuRun(store);
  let calls = 0;
  const diagnose = () => {
    calls += 1;
    return Array.from({ length: 7 }, (_, index) => ({
      id: `diagnostic-${index + 1}`,
      severity: index % 2 ? "warning" : "error",
      title: `Diagnostic ${index + 1}`,
      evidence: ["must not escape"],
      codeLocations: [{ file: "C:\\private\\kernel.rs" }]
    }));
  };
  const tool = runResultToolFor(store, { diagnose }).tool;

  const implicit = tool({});
  assert.equal(calls, 1);
  assert.equal(implicit.data.diagnostics.length, GET_RUN_RESULT_MAX_DIAGNOSTICS);
  assert.deepEqual(Object.keys(implicit.data.diagnostics[0]), ["id", "severity", "title"]);
  const explicit = tool({ includeDiagnostics: true });
  assert.equal(calls, 2);
  assert.equal(explicit.data.diagnostics.length, GET_RUN_RESULT_MAX_DIAGNOSTICS);
  const excluded = tool({ includeDiagnostics: false });
  assert.equal(calls, 2);
  assert.deepEqual(excluded.data.diagnostics, []);
});

test("get_run_result returns existing deterministic diagnostics for the selected run", () => {
  const store = new RunStore();
  completeQemuRun(store, {
    qemu: { status: "timeout", exitCode: null },
    result: {
      finalResult: "timeout",
      timedOut: true,
      error: { code: "qemu_timeout", message: "qemu timeout ended the run.", stage: "qemu" }
    }
  });
  const result = runResultToolFor(store).tool({ includeDiagnostics: true });
  assert.equal(result.ok, true);
  assert.equal(result.data.diagnostics.some((item) => item.id === "qemu-timeout"), true);
  assert.equal(result.data.diagnostics.length <= GET_RUN_RESULT_MAX_DIAGNOSTICS, true);

  const otherLabStore = new RunStore();
  completeQemuRun(otherLabStore, {
    events: [
      qemuEvent(1, { lab: "lab2", step: "trap-enter", status: "running" }),
      qemuEvent(2, { lab: "lab2", step: "trap-enter", status: "running" })
    ]
  });
  const otherLab = runResultToolFor(otherLabStore).tool({ includeDiagnostics: true });
  assert.equal(otherLab.data.diagnostics.some((item) => item.id === "trap-repeated"), false);
});

test("get_run_result isolates diagnostics and returned data from RunStore snapshots", () => {
  const snapshot = completedSnapshot({
    events: [qemuEvent(1, { detail: "original event" })]
  });
  const active = {
    runId: "active-run",
    branch: "lab4-starter",
    commit: "abc1234",
    events: [{ detail: "active event" }]
  };
  const beforeCompleted = structuredClone(snapshot);
  const beforeActive = structuredClone(active);
  const tool = runResultToolFor(snapshotStore(snapshot, active), {
    diagnose(input) {
      input.events[0].detail = "mutated by diagnostics";
      input.serialOutput.push("mutated output");
      return [];
    }
  }).tool;
  const result = tool({});
  result.data.build.status = "mutated";
  result.data.diagnostics.push({ id: "caller", severity: "error", title: "caller" });

  assert.deepEqual(snapshot, beforeCompleted);
  assert.deepEqual(active, beforeActive);
});

test("get_run_result reports diagnostics failures without changing the OS result", () => {
  const store = new RunStore();
  completeQemuRun(store, {
    events: [qemuEvent(1, { step: "pass", status: "pass" })]
  });
  const before = store.getLastCompletedRun();
  const result = runResultToolFor(store, {
    diagnose() {
      throw new Error("C:\\private\\diagnostics stack");
    }
  }).tool({ includeDiagnostics: true });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "diagnostics_failed");
  assert.doesNotMatch(JSON.stringify(result), /private|stack/);
  assert.deepEqual(store.getLastCompletedRun(), before);

  const invalid = runResultToolFor(store, { diagnose: () => ({}) })
    .tool({ includeDiagnostics: true });
  assert.equal(invalid.error.code, "diagnostics_failed");
});

test("get_run_result reuses context_changed and rejects mismatched run context", () => {
  const store = new RunStore();
  completeQemuRun(store);
  const tool = runResultToolFor(store).tool;
  const changed = tool({}, {
    expectedBranch: "lab4-starter",
    expectedCommit: "old-commit"
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.error.code, "context_changed");
  assert.equal(changed.error.retryable, true);

  const mismatch = runResultToolFor(store, { commit: "different-commit" }).tool({});
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, "run_context_mismatch");
  assert.equal(mismatch.error.details.runCommit, "abc1234");
  assert.equal(mismatch.error.details.actualCommit, "different-commit");
});

test("get_run_result rejects incomplete completed records instead of guessing", () => {
  const requiredFields = [
    "runId",
    "branch",
    "commit",
    "lab",
    "variant",
    "target",
    "build",
    "qemu",
    "finalResult",
    "startedAt",
    "endedAt",
    "durationMs",
    "timedOut",
    "manuallyStopped",
    "error",
    "eventCount",
    "lastEventSequence",
    "events",
    "stableOutput"
  ];
  const base = completedSnapshot();
  for (const field of requiredFields) {
    const incomplete = structuredClone(base);
    delete incomplete[field];
    const result = runResultToolFor(snapshotStore(incomplete)).tool({ includeDiagnostics: false });
    assert.equal(result.ok, false, field);
    assert.equal(result.error.code, "incomplete_run_record", field);
  }

  const badDuration = structuredClone(base);
  badDuration.durationMs += 1;
  assert.equal(runResultToolFor(snapshotStore(badDuration)).tool({}).error.code,
    "incomplete_run_record");
  const badSequence = structuredClone(base);
  badSequence.eventCount = 1;
  badSequence.lastEventSequence = 99;
  assert.equal(runResultToolFor(snapshotStore(badSequence)).tool({}).error.code,
    "incomplete_run_record");
});

test("get_run_result supports p0 and enforces an exact selected-run lab", () => {
  const snapshot = completedSnapshot({
    events: [qemuEvent(1, { lab: "p0", step: "pass", status: "pass" })]
  });
  snapshot.lab = "p0";
  const tool = runResultToolFor(snapshotStore(snapshot)).tool;
  const p0 = tool({ lab: "p0", includeDiagnostics: false });
  assert.equal(p0.ok, true);
  assert.equal(p0.data.lab, "p0");
  assert.equal(p0.data.finalResult, "pass");
  assert.equal(tool({ lab: "lab4" }).error.code, "lab_mismatch");
});

test("get_run_result omits event arrays, output logs, paths, environment, and errors", () => {
  const store = new RunStore();
  completeQemuRun(store, {
    qemu: { status: "failure", exitCode: 2 },
    events: [qemuEvent(5, {
      step: "panic",
      status: "fail",
      detail: "C:\\private\\kernel.log api_key=unsafe PATH=/private/bin"
    })],
    result: {
      finalResult: "qemu-failure",
      error: {
        code: "qemu_failure",
        message: "C:\\private\\server.log password=unsafe HOME=/home/private",
        stage: "qemu"
      }
    },
    stableOutput: ["stderr C:\\private\\trace.log TOKEN=unsafe"]
  });
  const before = store.getLastCompletedRun();
  const result = runResultToolFor(store).tool({ includeDiagnostics: false });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.data, "events"), false);
  assert.equal(Object.hasOwn(result.data, "stableOutput"), false);
  assert.equal(Object.hasOwn(result.data, "error"), false);
  assert.doesNotMatch(serialized, /private|unsafe|HOME=|PATH=|TOKEN=|server\.log|trace\.log/);
  assert.deepEqual(store.getLastCompletedRun(), before);
});

test("get_code_diff returns the shared ToolResult contract and fixed schema data", () => {
  let received = null;
  const harness = codeDiffToolFor({
    codeDiffEngine(args, context) {
      received = { args, context };
      return {
        schemaVersion: "os-tutor.code-diff/v1",
        lab: "lab4",
        baseline: { ref: "refs/remotes/origin/lab4-starter", commit: "a".repeat(40) },
        student: { branch: context.branch, commit: context.commit, workspaceDirty: true },
        scope: args.paths,
        files: ["kernel/src/lib.rs"],
        untrackedTeachingFiles: [],
        untrackedIncluded: false,
        untrackedTruncated: false,
        contextLines: args.contextLines,
        returnedLines: 1,
        maxLines: args.maxLines,
        maxBytes: 64 * 1024,
        truncated: false,
        omittedFiles: [],
        omittedFilesTruncated: false,
        diff: "+student change\n"
      };
    }
  });
  const args = {
    lab: "lab4",
    paths: ["kernel/src/lib.rs"],
    contextLines: 0,
    maxLines: 50
  };
  const result = harness.tool(args, {
    requestId: "request-code-diff",
    expectedBranch: "lab4-starter",
    expectedCommit: "abc1234"
  });

  assert.equal(result.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(result.tool, "get_code_diff");
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.equal(result.data.schemaVersion, "os-tutor.code-diff/v1");
  assert.equal(result.data.baseline.ref, "refs/remotes/origin/lab4-starter");
  assert.equal(result.data.student.workspaceDirty, true);
  assert.deepEqual(received, {
    args,
    context: { branch: "lab4-starter", commit: "abc1234" }
  });
  assert.equal(harness.contextReads(), 2);
  assert.equal(harness.engineCalls(), 1);
  assert.deepEqual(result.meta, {
    requestId: "request-code-diff",
    branch: "lab4-starter",
    commit: "abc1234",
    generatedAt: "2026-08-11T10:20:30.000Z"
  });
});

test("get_code_diff rejects a stale invocation before running Git", () => {
  const harness = codeDiffToolFor();
  const result = harness.tool({}, {
    expectedBranch: "lab4-starter",
    expectedCommit: "old-commit"
  });
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.equal(result.error.code, "context_changed");
  assert.equal(result.error.retryable, true);
  assert.equal(harness.contextReads(), 1);
  assert.equal(harness.engineCalls(), 0);
});

test("get_code_diff discards a diff when context changes during Git operations", () => {
  const harness = codeDiffToolFor({
    contexts: [
      { branch: "lab4-starter", commit: "abc1234" },
      { branch: "lab5-starter", commit: "def5678" }
    ]
  });
  const result = harness.tool({});
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.equal(result.error.code, "context_changed");
  assert.equal(result.error.retryable, true);
  assert.deepEqual(result.error.details, {
    expectedBranch: "lab4-starter",
    expectedCommit: "abc1234",
    actualBranch: "lab5-starter",
    actualCommit: "def5678"
  });
  assert.equal(harness.contextReads(), 2);
  assert.equal(harness.engineCalls(), 1);
});

test("get_code_diff failures omit stacks, host paths, Git stderr, and tokens", () => {
  const unsafe = new Error(
    "fatal C:\\Users\\student\\repo Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz"
  );
  unsafe.stack = "STACK C:\\Users\\student\\repo";
  const rawFailure = codeDiffToolFor({ engineError: unsafe }).tool({});
  assert.equal(rawFailure.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(rawFailure.tool, "get_code_diff");
  assert.equal(rawFailure.ok, false);
  assert.equal(rawFailure.error.code, "tool_execution_failed");
  assert.doesNotMatch(JSON.stringify(rawFailure), /Users|Bearer|ghp_|STACK|stderr/);

  const fakeSafeFailure = new Error("The restricted Git diff operation failed.");
  fakeSafeFailure.code = "git_diff_failed";
  fakeSafeFailure.retryable = true;
  fakeSafeFailure.details = { stage: "patch", exitCode: 1 };
  const result = codeDiffToolFor({ engineError: fakeSafeFailure }).tool({});
  assert.equal(result.error.code, "tool_execution_failed");
  assert.equal(result.error.retryable, false);
  assert.deepEqual(result.error.details, {});
  assert.equal(Object.hasOwn(result.error, "stack"), false);
});

test("get_code_diff adapts only real local CodeDiffError fields", () => {
  const secret = "TEST_SECRET_DO_NOT_LEAK_9A";
  const tool = createGetCodeDiffTool({
    repoDir: "C:\\safe-test-repo",
    readWorkspaceContext() {
      return { branch: "lab4-starter", commit: "abc1234" };
    },
    spawnSync() {
      return {
        status: 1,
        stdout: "",
        stderr: `${secret} /home/test/.secret/token`
      };
    },
    requestIdFactory: () => "code-diff-local-error",
    now: () => NOW
  });
  const result = tool({});
  assert.equal(result.error.code, "starter_baseline_unavailable");
  assert.equal(result.error.message, "The fixed local starter baseline is unavailable.");
  assert.equal(result.error.retryable, false);
  assert.deepEqual(result.error.details, { stage: "baseline", exitCode: 1 });
  assert.doesNotMatch(JSON.stringify(result), /TEST_SECRET_DO_NOT_LEAK_9A|\/home\/test/);
});

test("run_test starts approved main, starter, and solution tests", () => {
  const cases = [
    ["main", "main-lab7-qemu", "lab7", "complete"],
    ["lab4-starter", "lab4-starter-qemu", "lab4", "starter"],
    ["lab4-solution", "lab4-solution-qemu", "lab4", "solution"]
  ];
  for (const [branch, testId, lab, variant] of cases) {
    const harness = runTestToolFor({ branch });
    const result = harness.tool({ testId, lab });
    assert.equal(result.ok, true, testId);
    assert.equal(result.data.testId, testId);
    assert.equal(result.data.lab, lab);
    assert.equal(harness.contextReads(), 2);
    assert.equal(harness.preflightCalls(), 1);
    assert.equal(harness.startCalls(), 1);
    assert.equal(harness.received[0].approvedTest.variant, variant);
    assert.equal(harness.received[0].approvedTest, TEST_REGISTRY[testId]);
  }
});

test("run_test validates required testId and lab fields before starting", () => {
  for (const [args, code] of [
    [{ lab: "lab4" }, "invalid_test_id"],
    [{ testId: "Lab4 Starter" }, "invalid_test_id"],
    [{ testId: "lab4-starter-qemu" }, "invalid_lab"],
    [{ testId: "lab4-starter-qemu", lab: "p0" }, "invalid_lab"],
    [null, "invalid_tool_input"],
    [[], "invalid_tool_input"]
  ]) {
    const harness = runTestToolFor();
    const result = harness.tool(args);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    assert.equal(harness.preflightCalls(), 0);
    assert.equal(harness.startCalls(), 0);
  }
});

test("run_test rejects unknown tests and testId-to-lab mismatches", () => {
  const unknownHarness = runTestToolFor();
  const unknown = unknownHarness.tool({ testId: "lab4-unknown-qemu", lab: "lab4" });
  assert.equal(unknown.error.code, "unknown_test");
  assert.equal(unknownHarness.startCalls(), 0);

  const mismatchHarness = runTestToolFor();
  const mismatch = mismatchHarness.tool({ testId: "lab4-starter-qemu", lab: "lab5" });
  assert.equal(mismatch.error.code, "lab_mismatch");
  assert.deepEqual(mismatch.error.details, { requestedLab: "lab5", testLab: "lab4" });
  assert.equal(mismatchHarness.startCalls(), 0);
});

test("run_test enforces current lab, variant, and exact branch policies", () => {
  const wrongLab = runTestToolFor({ branch: "lab5-starter" });
  assert.equal(wrongLab.tool({
    testId: "lab4-starter-qemu",
    lab: "lab4"
  }).error.code, "lab_mismatch");

  const wrongVariant = runTestToolFor({ branch: "lab4-solution" });
  assert.equal(wrongVariant.tool({
    testId: "lab4-starter-qemu",
    lab: "lab4"
  }).error.code, "branch_not_allowed");

  const entry = TEST_REGISTRY["lab4-starter-qemu"];
  const wrongBranchRegistry = Object.freeze({
    [entry.testId]: Object.freeze({
      ...entry,
      branchPolicy: Object.freeze({ type: "exact", branch: "lab4-approved" })
    })
  });
  const wrongBranch = runTestToolFor({ registry: wrongBranchRegistry });
  assert.equal(wrongBranch.tool({ testId: entry.testId, lab: "lab4" }).error.code,
    "branch_not_allowed");

  assert.equal(wrongLab.startCalls(), 0);
  assert.equal(wrongVariant.startCalls(), 0);
  assert.equal(wrongBranch.startCalls(), 0);
});

test("run_test rejects custom, agent-mvp, and demo branches", () => {
  for (const branch of ["custom-work", "agent-mvp", "interactive-demo-learning-map"]) {
    const testId = branch === "interactive-demo-learning-map"
      ? "main-lab7-qemu"
      : "lab4-starter-qemu";
    const lab = branch === "interactive-demo-learning-map" ? "lab7" : "lab4";
    const harness = runTestToolFor({ branch });
    const result = harness.tool({ testId, lab });
    assert.equal(result.error.code, "branch_not_allowed", branch);
    assert.equal(harness.startCalls(), 0);
  }
});

test("run_test rejects stale expected branch and commit contexts", () => {
  for (const invocationContext of [
    { expectedBranch: "lab4-solution" },
    { expectedCommit: "old-commit" }
  ]) {
    const harness = runTestToolFor();
    const result = harness.tool({
      testId: "lab4-starter-qemu",
      lab: "lab4"
    }, invocationContext);
    assert.equal(result.error.code, "context_changed");
    assert.equal(result.error.retryable, true);
    assert.equal(harness.contextReads(), 1);
    assert.equal(harness.startCalls(), 0);
  }
});

test("run_test rechecks branch and commit immediately before start", () => {
  const harness = runTestToolFor({
    contexts: [
      { branch: "lab4-starter", commit: "abc1234" },
      { branch: "lab4-starter", commit: "def5678" }
    ]
  });
  const result = harness.tool({ testId: "lab4-starter-qemu", lab: "lab4" });
  assert.equal(result.error.code, "context_changed");
  assert.equal(result.error.retryable, true);
  assert.deepEqual(result.error.details, {
    expectedBranch: "lab4-starter",
    expectedCommit: "abc1234",
    actualBranch: "lab4-starter",
    actualCommit: "def5678"
  });
  assert.equal(harness.contextReads(), 2);
  assert.equal(harness.preflightCalls(), 1);
  assert.equal(harness.startCalls(), 0);
});

test("run_test explicitly rejects every process and repository execution field", () => {
  const executionFields = [
    "command", "args", "cwd", "env", "shell", "timeout", "target",
    "branch", "ref", "commit", "makeTarget", "cargoTarget", "script",
    "path", "executable", "marker", "mode", "log"
  ];
  const values = [null, "", false];
  executionFields.forEach((field, index) => {
    const harness = runTestToolFor();
    const result = harness.tool({
      testId: "lab4-starter-qemu",
      lab: "lab4",
      [field]: values[index % values.length]
    });
    assert.equal(result.error.code, "execution_field_forbidden", field);
    assert.deepEqual(result.error.details, { field });
    assert.equal(harness.preflightCalls(), 0, field);
    assert.equal(harness.startCalls(), 0, field);
  });
});

test("run_test rejects ordinary unknown fields without treating them as commands", () => {
  const harness = runTestToolFor();
  const result = harness.tool({
    testId: "lab4-starter-qemu",
    lab: "lab4",
    extra: true
  });
  assert.equal(result.error.code, "invalid_tool_input");
  assert.deepEqual(result.error.details, { field: "extra" });
  assert.equal(harness.startCalls(), 0);
});

test("run_test returns context_unavailable without exposing context reader failures", () => {
  const unsafe = new Error("C:\\private\\repo API_KEY=secret");
  unsafe.stack = "STACK C:\\private\\repo";
  const harness = runTestToolFor({ contexts: [unsafe] });
  const result = harness.tool({ testId: "lab4-starter-qemu", lab: "lab4" });
  assert.equal(result.error.code, "context_unavailable");
  assert.equal(result.error.retryable, true);
  assert.doesNotMatch(JSON.stringify(result), /private|API_KEY|secret|STACK/);
  assert.equal(harness.startCalls(), 0);
});

test("run_test sanitizes preflight failures to safe component names", () => {
  const harness = runTestToolFor({
    preflight: {
      ok: false,
      checks: [
        { name: "cargo", ok: false, detail: "C:\\private\\cargo.exe" },
        { name: "C:\\private\\qemu.exe", ok: false, detail: "API_KEY=secret" },
        { name: "Rust target", ok: true }
      ]
    }
  });
  const result = harness.tool({ testId: "lab4-starter-qemu", lab: "lab4" });
  assert.equal(result.error.code, "preflight_failed");
  assert.equal(result.error.retryable, true);
  assert.deepEqual(result.error.details, { missing: ["cargo"] });
  assert.doesNotMatch(JSON.stringify(result), /private|API_KEY|secret|cargo\.exe/);
  assert.equal(harness.startCalls(), 0);
});

test("run_test reports interactive and agent lock conflicts as retryable run_busy", () => {
  for (const kind of ["interactive-run", "agent-test"]) {
    const harness = runTestToolFor({
      started: { started: false, activeTask: { kind, runId: "active-run" } }
    });
    const result = harness.tool({ testId: "lab4-starter-qemu", lab: "lab4" });
    assert.equal(result.error.code, "run_busy");
    assert.equal(result.error.retryable, true);
    assert.deepEqual(result.error.details, { activeKind: kind });
    assert.equal(harness.startCalls(), 1);
  }
});

test("run_test converts shared runner failures and malformed starts to run_start_failed", () => {
  const unsafe = new Error("spawn C:\\private\\qemu.exe API_KEY=secret");
  unsafe.code = "unsafe_start";
  unsafe.details = { cwd: "C:\\private" };
  const thrown = runTestToolFor({ startError: unsafe }).tool({
    testId: "lab4-starter-qemu",
    lab: "lab4"
  });
  assert.equal(thrown.error.code, "run_start_failed");
  assert.equal(thrown.error.message, "The approved test could not be started.");
  assert.deepEqual(thrown.error.details, {});
  assert.doesNotMatch(JSON.stringify(thrown), /private|API_KEY|secret|unsafe_start|qemu\.exe/);

  const malformed = runTestToolFor({ started: { started: true } }).tool({
    testId: "lab4-starter-qemu",
    lab: "lab4"
  });
  assert.equal(malformed.error.code, "run_start_failed");
});

test("run_test success uses the unified contract and returns only approved fields", () => {
  const harness = runTestToolFor();
  const result = harness.tool({
    testId: "lab4-starter-qemu",
    lab: "lab4"
  }, {
    requestId: "request-run-test",
    expectedBranch: "lab4-starter",
    expectedCommit: "abc1234"
  });
  assert.equal(result.contractVersion, TOOL_CONTRACT_VERSION);
  assert.equal(result.tool, "run_test");
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.deepEqual(Object.keys(result.data), [
    "runId", "testId", "lab", "status", "startedAt"
  ]);
  assert.deepEqual(result.data, {
    runId: "run-test-1",
    testId: "lab4-starter-qemu",
    lab: "lab4",
    status: "started",
    startedAt: NOW
  });
  assert.deepEqual(result.meta, {
    requestId: "request-run-test",
    branch: "lab4-starter",
    commit: "abc1234",
    generatedAt: "2026-08-11T10:20:30.000Z"
  });
  assert.equal(Object.hasOwn(result.data, "expectedResult"), false);
  assert.equal(Object.hasOwn(result.data, "events"), false);
  assert.equal(Object.hasOwn(result.data, "command"), false);
});

test("run_test passes only a frozen registry entry and verified context to the runner", () => {
  const harness = runTestToolFor();
  const result = harness.tool({ testId: "lab4-starter-qemu", lab: "lab4" });
  assert.equal(result.ok, true);
  assert.equal(harness.received.length, 1);
  assert.deepEqual(Object.keys(harness.received[0]).sort(), ["approvedTest", "context"]);
  assert.equal(harness.received[0].approvedTest, TEST_REGISTRY["lab4-starter-qemu"]);
  assert.equal(Object.isFrozen(harness.received[0].approvedTest), true);
  assert.equal(harness.received[0].context.branch, "lab4-starter");
  assert.equal(harness.received[0].context.commit, "abc1234");
  for (const field of ["command", "args", "cwd", "env", "shell", "timeout", "target"]) {
    assert.equal(Object.hasOwn(harness.received[0], field), false);
  }
});

test("duplicate run_test requests cannot start a second approved operation", () => {
  let active = false;
  let operationStarts = 0;
  const harness = runTestToolFor({
    startApprovedRun(_input, callNumber) {
      if (active) {
        return {
          started: false,
          activeTask: { kind: "agent-test", runId: "run-test-1" }
        };
      }
      active = true;
      operationStarts += 1;
      return {
        started: true,
        runId: `run-test-${callNumber}`,
        startedAt: NOW,
        activeTask: { kind: "agent-test", runId: `run-test-${callNumber}` }
      };
    }
  });
  const args = { testId: "lab4-starter-qemu", lab: "lab4" };
  assert.equal(harness.tool(args).ok, true);
  assert.equal(harness.tool(args).error.code, "run_busy");
  assert.equal(harness.startCalls(), 2);
  assert.equal(operationStarts, 1);
});

test("run_test implementation has no direct spawn, Git mutation, or file write path", () => {
  const source = fs.readFileSync(path.join(__dirname, "tools.js"), "utf8");
  const start = source.indexOf("function createRunTestTool");
  const end = source.indexOf("function createGetContextTool", start);
  const implementation = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(implementation, /\bspawn(?:Sync)?\s*\(/);
  assert.doesNotMatch(implementation, /\bexec(?:File|Sync)?\s*\(/);
  assert.doesNotMatch(implementation, /\bwriteFile(?:Sync)?\s*\(/);
  assert.doesNotMatch(implementation, /git\s+(?:checkout|switch|fetch|pull|reset|merge|rebase|add|commit|push)/);
  assert.doesNotMatch(implementation, /\.acquire\s*\(/);
});
