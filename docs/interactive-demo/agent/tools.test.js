"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createGetContextTool,
  createReadCodeTool,
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
