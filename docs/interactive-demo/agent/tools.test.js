"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createGetContextTool,
  createGetQemuEventsTool,
  createReadCodeTool,
  createToolFailure,
  parsePorcelainStatus
} = require("./tools");
const { TOOL_CONTRACT_VERSION } = require("./policy");
const { RunStore } = require("./run-store");

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
