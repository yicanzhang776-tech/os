"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  CODE_DIFF_DEFAULT_CONTEXT_LINES,
  CODE_DIFF_DEFAULT_MAX_LINES,
  CODE_DIFF_MAX_BYTES,
  CODE_DIFF_MAX_FILES,
  CODE_DIFF_MAX_LINES,
  CODE_DIFF_MAX_PATHS,
  CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES,
  CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES,
  CODE_DIFF_MAX_UNTRACKED_FILES,
  CODE_DIFF_SCHEMA_VERSION,
  STARTER_BASELINES,
  createSafeGitEnvironment,
  createCodeDiffEngine,
  isInsideDirectory,
  projectPatch,
  resolveStarterContext,
  sanitizedGitEnvironment,
  validateCodeDiffInput
} = require("./code-diff");

function writeFile(repoDir, relativePath, content) {
  const target = path.join(repoDir, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function writeMarkerHelper(repoDir, marker) {
  if (process.platform === "win32") {
    return writeFile(
      repoDir,
      "unsafe-helper.cmd",
      `@echo invoked>"${marker}"\r\n@more\r\n@exit /b 0\r\n`
    );
  }
  const escapedMarker = marker.replaceAll("'", "'\\''");
  const helper = writeFile(
    repoDir,
    "unsafe-helper.sh",
    `#!/bin/sh\nprintf invoked > '${escapedMarker}'\ncat\n`
  );
  fs.chmodSync(helper, 0o755);
  return helper;
}

function git(repoDir, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    ...options
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${String(result.stderr || result.error || "")}`
  );
  return String(result.stdout || "").trim();
}

function createFixture(options = {}) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "os-tutor-code-diff-"));
  git(repoDir, ["init", "-b", "lab4-starter"]);
  git(repoDir, ["config", "user.name", "Code Diff Test"]);
  git(repoDir, ["config", "user.email", "code-diff@example.invalid"]);
  writeFile(repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 1 }\n");
  writeFile(repoDir, "kernel/src/memory/page_table.rs", "pub fn map_page() { /* starter */ }\n");
  writeFile(repoDir, "kernel/src/trap/mod.rs", "pub fn trap_entry() { /* starter */ }\n");
  writeFile(repoDir, ".gitattributes", "*.rs diff=danger\n");
  git(repoDir, ["add", ".gitattributes", "kernel/src"]);
  git(repoDir, ["commit", "-m", "starter"]);
  const baselineCommit = git(repoDir, ["rev-parse", "HEAD"]);
  for (const lab of options.refs || ["lab1", "lab4", "lab7"]) {
    git(repoDir, ["update-ref", `refs/remotes/origin/${lab}-starter`, baselineCommit]);
  }
  return {
    repoDir,
    baselineCommit,
    cleanup() {
      fs.rmSync(repoDir, { recursive: true, force: true });
    },
    context(branch = "lab4-starter") {
      return { branch, commit: git(repoDir, ["rev-parse", "--short", "HEAD"]) };
    },
    inspect(args = {}, branch = "lab4-starter", engineOptions = {}) {
      return createCodeDiffEngine({ repoDir, ...engineOptions })(args, this.context(branch));
    }
  };
}

function errorCode(callback) {
  assert.throws(callback, (error) => {
    assert.equal(typeof error.code, "string");
    return true;
  });
  try {
    callback();
  } catch (error) {
    return error.code;
  }
  return null;
}

function captureError(callback) {
  let captured = null;
  try {
    callback();
  } catch (error) {
    captured = error;
  }
  assert.notEqual(captured, null, "expected an error");
  return captured;
}

function fileSystemWith(overrides) {
  return new Proxy(fs, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property];
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function temporaryDirectoryTracker() {
  const roots = [];
  return {
    roots,
    factory(prefix) {
      const root = fs.mkdtempSync(prefix);
      roots.push(root);
      return root;
    },
    assertCleaned() {
      assert.ok(roots.length > 0, "expected an isolated snapshot directory");
      assert.equal(roots.every((root) => !fs.existsSync(root)), true);
    }
  };
}

function createSymlinkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (error && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`symbolic links are unavailable on ${process.platform}`);
      return false;
    }
    throw error;
  }
}

function patchSection(relativePath, oldValue = "old", newValue = "new") {
  return [
    `diff --git a/${relativePath} b/${relativePath}\n`,
    `--- a/${relativePath}\n`,
    `+++ b/${relativePath}\n`,
    "@@ -1 +1 @@\n",
    `-${oldValue}\n`,
    `+${newValue}\n`
  ].join("");
}

function gitSubcommand(args) {
  let index = 0;
  while (index < args.length) {
    if (args[index] === "--literal-pathspecs") {
      index += 1;
      continue;
    }
    if (args[index] === "-c") {
      index += 2;
      continue;
    }
    return args[index] || null;
  }
  return null;
}

function recordingGit(calls, intercept = null) {
  return (program, args, options) => {
    const call = { program, args: [...args], options };
    calls.push(call);
    const intercepted = intercept?.(call);
    if (intercepted) return intercepted;
    return spawnSync(program, args, options);
  };
}

test("starter registry is generated for the seven registered teaching labs", () => {
  assert.deepEqual(Object.keys(STARTER_BASELINES).sort(), [
    "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"
  ]);
  for (let number = 1; number <= 7; number += 1) {
    const lab = `lab${number}`;
    assert.deepEqual(STARTER_BASELINES[lab], {
      branch: `${lab}-starter`,
      ref: `refs/remotes/origin/${lab}-starter`
    });
  }
});

test("trusted lab1, lab4, and lab7 contexts select only their fixed starter refs", () => {
  for (const lab of ["lab1", "lab4", "lab7"]) {
    const result = resolveStarterContext({ branch: `${lab}-starter`, commit: "abc1234" });
    assert.equal(result.lab, lab);
    assert.equal(result.baseline.ref, `refs/remotes/origin/${lab}-starter`);
  }
  assert.equal(
    errorCode(() => resolveStarterContext(
      { branch: "lab4-starter", commit: "abc1234" },
      "lab1"
    )),
    "lab_mismatch"
  );
});

test("untrusted, non-lab, solution, and agent-mvp contexts are rejected", () => {
  const cases = [
    [{ branch: "p0-baseline", commit: "abc1234" }, "branch_not_allowed"],
    [{ branch: "custom-work", commit: "abc1234" }, "branch_not_allowed"],
    [{ branch: "agent-mvp", commit: "abc1234" }, "branch_not_allowed"],
    [{ branch: "main", commit: "abc1234" }, "solution_diff_forbidden"],
    [{ branch: "lab4-solution", commit: "abc1234" }, "solution_diff_forbidden"],
    [{ branch: "lab4-starter", commit: "" }, "context_unavailable"]
  ];
  for (const [context, expected] of cases) {
    assert.equal(errorCode(() => resolveStarterContext(context)), expected);
  }
});

test("input defaults and safe boundary values are stable", () => {
  assert.deepEqual(validateCodeDiffInput({}), {
    lab: null,
    scope: ["kernel/src/"],
    contextLines: CODE_DIFF_DEFAULT_CONTEXT_LINES,
    maxLines: CODE_DIFF_DEFAULT_MAX_LINES
  });
  assert.deepEqual(validateCodeDiffInput({
    lab: "lab4",
    paths: ["kernel/src/trap/mod.rs", "kernel/src/lib.rs", "kernel/src/lib.rs"],
    contextLines: 0,
    maxLines: CODE_DIFF_MAX_LINES
  }), {
    lab: "lab4",
    scope: ["kernel/src/lib.rs", "kernel/src/trap/mod.rs"],
    contextLines: 0,
    maxLines: 800
  });
  assert.equal(validateCodeDiffInput({ contextLines: 5 }).contextLines, 5);
});

test("unsafe and protected paths are rejected", () => {
  const paths = [
    "docs/labs/lab4/README.md",
    "kernel/src/../Cargo.toml",
    "/kernel/src/lib.rs",
    "C:/repo/kernel/src/lib.rs",
    "kernel\\src\\lib.rs",
    "kernel/src/.git/config.rs",
    "kernel/src/target/generated.rs",
    "kernel/src/solution.rs",
    "kernel/src/teacher/answer.rs",
    "kernel/src/.env.rs",
    "kernel/src/secrets.token"
  ];
  for (const unsafePath of paths) {
    assert.equal(
      errorCode(() => validateCodeDiffInput({ paths: [unsafePath] })),
      "path_not_allowed",
      unsafePath
    );
  }
  assert.equal(errorCode(() => validateCodeDiffInput({ paths: [] })), "path_not_allowed");
  assert.equal(
    errorCode(() => validateCodeDiffInput({
      paths: Array.from({ length: CODE_DIFF_MAX_PATHS + 1 }, (_, index) => `kernel/src/f${index}.rs`)
    })),
    "too_many_paths"
  );
});

test("Git pathspec magic and wildcard expressions are rejected while literal files pass", () => {
  const unsafePaths = [
    "kernel/src/*.rs",
    "kernel/src/?.rs",
    "kernel/src/[ab].rs",
    "kernel/src/**/mod.rs",
    ":(glob)kernel/src/*.rs",
    ":(top)kernel/src/lib.rs",
    ":(exclude)kernel/src/lib.rs",
    ":!kernel/src/lib.rs",
    ":^kernel/src/lib.rs"
  ];
  for (const unsafePath of unsafePaths) {
    assert.equal(
      errorCode(() => validateCodeDiffInput({ paths: [unsafePath] })),
      "path_not_allowed",
      unsafePath
    );
  }
  assert.deepEqual(validateCodeDiffInput({ paths: ["kernel/src/lib.rs"] }).scope, [
    "kernel/src/lib.rs"
  ]);
});

test("sensitive path tokens are rejected without false-positive tokenizer matches", () => {
  const sensitivePaths = [
    "kernel/src/secret.rs",
    "kernel/src/secrets.rs",
    "kernel/src/credentials/keyring.rs",
    "kernel/src/github_token.rs",
    "kernel/src/access_token.rs",
    "kernel/src/api_key.rs",
    "kernel/src/password.rs",
    "kernel/src/private_key.rs",
    "kernel/src/API-KEY.rs"
  ];
  for (const sensitivePath of sensitivePaths) {
    assert.equal(
      errorCode(() => validateCodeDiffInput({ paths: [sensitivePath] })),
      "path_not_allowed",
      sensitivePath
    );
  }
  assert.deepEqual(validateCodeDiffInput({ paths: ["kernel/src/tokenizer.rs"] }).scope, [
    "kernel/src/tokenizer.rs"
  ]);
});

test("unknown and caller-controlled Git fields are rejected", () => {
  const fields = [
    "baseline", "ref", "commit", "solutionRef", "starterRef", "gitRef",
    "branch", "cwd", "command", "shell", "env", "args", "unexpected"
  ];
  for (const field of fields) {
    assert.equal(errorCode(() => validateCodeDiffInput({ [field]: "unsafe" })), "invalid_tool_input");
  }
  assert.equal(errorCode(() => validateCodeDiffInput(null)), "invalid_tool_input");
  assert.equal(errorCode(() => validateCodeDiffInput({ lab: "lab8" })), "unknown_lab");
});

test("numeric limits reject unsafe numbers", () => {
  for (const value of [-1, 6, 1.5, "3", Infinity, NaN]) {
    assert.equal(
      errorCode(() => validateCodeDiffInput({ contextLines: value })),
      "invalid_context_lines"
    );
  }
  for (const value of [0, -1, 801, 1.5, "400", Infinity, NaN]) {
    assert.equal(errorCode(() => validateCodeDiffInput({ maxLines: value })), "invalid_max_lines");
  }
});

test("clean committed changes compare the fixed baseline to the current worktree", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 2 }\n");
    git(fixture.repoDir, ["add", "kernel/src/lib.rs"]);
    git(fixture.repoDir, ["commit", "-m", "student committed change"]);
    const data = fixture.inspect();
    assert.equal(data.schemaVersion, CODE_DIFF_SCHEMA_VERSION);
    assert.equal(data.lab, "lab4");
    assert.deepEqual(data.baseline, {
      ref: "refs/remotes/origin/lab4-starter",
      commit: fixture.baselineCommit
    });
    assert.deepEqual(data.student, {
      branch: "lab4-starter",
      commit: git(fixture.repoDir, ["rev-parse", "--short", "HEAD"]),
      workspaceDirty: false
    });
    assert.deepEqual(data.scope, ["kernel/src/"]);
    assert.deepEqual(data.files, ["kernel/src/lib.rs"]);
    assert.match(data.diff, /-pub fn lesson_value\(\) -> u32 \{ 1 \}/);
    assert.match(data.diff, /\+pub fn lesson_value\(\) -> u32 \{ 2 \}/);
    assert.equal(data.truncated, false);
    assert.deepEqual(data.omittedFiles, []);
  } finally {
    fixture.cleanup();
  }
});

test("lab1 and lab7 resolve their own refs without cross-lab access", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 7 }\n");
    for (const lab of ["lab1", "lab7"]) {
      const data = fixture.inspect({ lab }, `${lab}-starter`);
      assert.equal(data.lab, lab);
      assert.equal(data.baseline.ref, `refs/remotes/origin/${lab}-starter`);
    }
  } finally {
    fixture.cleanup();
  }
});

test("staged, unstaged, and mixed tracked changes are included", async (t) => {
  const modes = ["staged", "unstaged", "mixed"];
  for (const mode of modes) {
    await t.test(mode, () => {
      const fixture = createFixture();
      try {
        if (mode !== "unstaged") {
          writeFile(fixture.repoDir, "kernel/src/memory/page_table.rs", "pub fn map_page() { /* staged */ }\n");
          git(fixture.repoDir, ["add", "kernel/src/memory/page_table.rs"]);
        }
        if (mode !== "staged") {
          writeFile(fixture.repoDir, "kernel/src/trap/mod.rs", "pub fn trap_entry() { /* unstaged */ }\n");
        }
        if (mode === "mixed") {
          writeFile(fixture.repoDir, "kernel/src/memory/page_table.rs", "pub fn map_page() { /* staged then modified */ }\n");
        }
        const data = fixture.inspect();
        assert.equal(data.student.workspaceDirty, true);
        assert.equal(data.diff.includes("/* staged */"), mode === "staged");
        assert.equal(data.diff.includes("/* staged then modified */"), mode === "mixed");
        assert.equal(data.diff.includes("/* unstaged */"), mode !== "staged");
      } finally {
        fixture.cleanup();
      }
    });
  }
});

test("deletions, new tracked files, and index/worktree divergence keep filesystem semantics", async (t) => {
  await t.test("deleted tracked file", () => {
    const fixture = createFixture();
    try {
      fs.rmSync(path.join(fixture.repoDir, "kernel", "src", "lib.rs"));
      const data = fixture.inspect();
      assert.deepEqual(data.files, ["kernel/src/lib.rs"]);
      assert.match(data.diff, /deleted file mode 100644/);
      assert.match(data.diff, /-pub fn lesson_value\(\) -> u32 \{ 1 \}/);
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("new tracked file", () => {
    const fixture = createFixture();
    try {
      writeFile(fixture.repoDir, "kernel/src/new_lesson.rs", "pub fn new_lesson() -> u32 { 8 }\n");
      git(fixture.repoDir, ["add", "kernel/src/new_lesson.rs"]);
      const data = fixture.inspect();
      assert.deepEqual(data.files, ["kernel/src/new_lesson.rs"]);
      assert.match(data.diff, /new file mode 100644/);
      assert.match(data.diff, /\+pub fn new_lesson\(\) -> u32 \{ 8 \}/);
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("staged plus unstaged uses only worktree content", () => {
    const fixture = createFixture();
    try {
      writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub const INDEX_ONLY_MARKER: u32 = 10;\n");
      git(fixture.repoDir, ["add", "kernel/src/lib.rs"]);
      writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub const WORKTREE_MARKER: u32 = 11;\n");
      const data = fixture.inspect();
      assert.match(data.diff, /WORKTREE_MARKER/);
      assert.doesNotMatch(data.diff, /INDEX_ONLY_MARKER/);
    } finally {
      fixture.cleanup();
    }
  });
});

test("current file and ancestor symlinks or junctions are rejected", async (t) => {
  await t.test("final symlink metadata is rejected before realpath", () => {
    const fixture = createFixture();
    try {
      const target = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
      let targetRealpathCalls = 0;
      const fileSystem = fileSystemWith({
        lstatSync(candidate) {
          const stats = fs.lstatSync(candidate);
          if (!isInsideDirectory(target, candidate) || !isInsideDirectory(candidate, target)) {
            return stats;
          }
          return new Proxy(stats, {
            get(value, property) {
              if (property === "isFile") return () => false;
              if (property === "isSymbolicLink") return () => true;
              const selected = Reflect.get(value, property);
              return typeof selected === "function" ? selected.bind(value) : selected;
            }
          });
        },
        realpathSync(candidate) {
          if (isInsideDirectory(target, candidate) && isInsideDirectory(candidate, target)) {
            targetRealpathCalls += 1;
          }
          return fs.realpathSync(candidate);
        }
      });
      assert.equal(
        errorCode(() => fixture.inspect({}, "lab4-starter", { fileSystem })),
        "unsafe_working_tree_file"
      );
      assert.equal(targetRealpathCalls, 0);
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("final symlink to a repository-external file", (subtest) => {
    const fixture = createFixture();
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "os-tutor-external-"));
    try {
      const target = writeFile(externalRoot, "outside.rs", "OUTSIDE_FILE_MUST_NOT_APPEAR\n");
      const link = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
      fs.rmSync(link);
      if (!createSymlinkOrSkip(subtest, target, link, "file")) return;
      const error = captureError(() => fixture.inspect());
      assert.equal(error.code, "unsafe_working_tree_file");
      assert.doesNotMatch(JSON.stringify({ message: error.message, details: error.details }), /OUTSIDE_FILE/);
    } finally {
      fixture.cleanup();
      fs.rmSync(externalRoot, { recursive: true, force: true });
    }
  });

  await t.test("final symlink to another teaching file", (subtest) => {
    const fixture = createFixture();
    try {
      const target = path.join(fixture.repoDir, "kernel", "src", "memory", "page_table.rs");
      const link = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
      fs.rmSync(link);
      if (!createSymlinkOrSkip(subtest, target, link, "file")) return;
      assert.equal(errorCode(() => fixture.inspect()), "unsafe_working_tree_file");
    } finally {
      fixture.cleanup();
    }
  });

  const directoryLinkType = process.platform === "win32" ? "junction" : "dir";
  const ancestorCases = [
    { name: "ancestor link outside the repository", target: "external" },
    { name: "ancestor link inside the repository but outside kernel/src", target: "repo" },
    { name: "kernel/src2 is not a kernel/src descendant", target: "src2" }
  ];
  for (const scenario of ancestorCases) {
    await t.test(scenario.name, (subtest) => {
      const fixture = createFixture();
      let externalRoot = null;
      try {
        let targetRoot;
        if (scenario.target === "external") {
          externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "os-tutor-external-dir-"));
          targetRoot = externalRoot;
        } else if (scenario.target === "repo") {
          targetRoot = path.join(fixture.repoDir, "kernel", "other");
        } else {
          targetRoot = path.join(fixture.repoDir, "kernel", "src2");
        }
        fs.mkdirSync(targetRoot, { recursive: true });
        fs.writeFileSync(path.join(targetRoot, "mod.rs"), "LINK_TARGET_MUST_NOT_APPEAR\n");
        const ancestor = path.join(fixture.repoDir, "kernel", "src", "trap");
        fs.rmSync(ancestor, { recursive: true, force: true });
        if (!createSymlinkOrSkip(subtest, targetRoot, ancestor, directoryLinkType)) return;
        const error = captureError(() => fixture.inspect());
        assert.equal(error.code, "unsafe_working_tree_file");
        assert.doesNotMatch(
          JSON.stringify({ message: error.message, details: error.details }),
          /LINK_TARGET_MUST_NOT_APPEAR/
        );
      } finally {
        fixture.cleanup();
        if (externalRoot) fs.rmSync(externalRoot, { recursive: true, force: true });
      }
    });
  }
});

test("baseline symlink and gitlink modes are rejected before blob reads", async (t) => {
  const entries = [
    { name: "symlink", mode: "120000", type: "blob" },
    { name: "gitlink", mode: "160000", type: "commit" }
  ];
  for (const entry of entries) {
    await t.test(entry.name, () => {
      const fixture = createFixture();
      try {
        const calls = [];
        const engine = createCodeDiffEngine({
          repoDir: fixture.repoDir,
          spawnSync: recordingGit(calls, (call) => (
            gitSubcommand(call.args) === "ls-tree"
              ? {
                  status: 0,
                  stdout: `${entry.mode} ${entry.type} ${"a".repeat(40)}\tkernel/src/unsafe.rs\0`,
                  stderr: ""
                }
              : null
          ))
        });
        const error = captureError(() => engine({}, fixture.context()));
        assert.equal(error.code, "unsafe_baseline_entry");
        assert.equal(calls.some((call) => gitSubcommand(call.args) === "cat-file"), false);
      } finally {
        fixture.cleanup();
      }
    });
  }
});

test("directories and supported special files are rejected as current teaching files", async (t) => {
  await t.test("directory", () => {
    const fixture = createFixture();
    try {
      const target = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
      fs.rmSync(target);
      fs.mkdirSync(target);
      assert.equal(errorCode(() => fixture.inspect()), "unsafe_working_tree_file");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("FIFO", (subtest) => {
    if (process.platform === "win32") {
      subtest.skip("FIFO filesystem nodes are unavailable on Windows");
      return;
    }
    const fixture = createFixture();
    try {
      const target = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
      fs.rmSync(target);
      const made = spawnSync("mkfifo", [target], { shell: false });
      if (made.error?.code === "ENOENT") {
        subtest.skip("mkfifo is unavailable");
        return;
      }
      assert.equal(made.status, 0);
      assert.equal(errorCode(() => fixture.inspect()), "unsafe_working_tree_file");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("Unix socket", async (subtest) => {
    if (process.platform === "win32") {
      subtest.skip("Unix-domain filesystem sockets are not used on Windows");
      return;
    }
    const fixture = createFixture();
    const target = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
    fs.rmSync(target);
    const server = net.createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(target, resolve);
      });
      assert.equal(errorCode(() => fixture.inspect()), "unsafe_working_tree_file");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fixture.cleanup();
    }
  });
});

test("current snapshot accepts safe UTF-8 and rejects binary, invalid UTF-8, and oversized files", async (t) => {
  await t.test("normal UTF-8 uses fd reads and preserves tokenizer.rs", () => {
    const fixture = createFixture();
    try {
      writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn 教学值() -> u32 { 12 }\n");
      writeFile(fixture.repoDir, "kernel/src/tokenizer.rs", "pub struct Tokenizer;\n");
      git(fixture.repoDir, ["add", "kernel/src/tokenizer.rs"]);
      const openFlags = [];
      const fileSystem = fileSystemWith({
        openSync(candidate, flags) {
          openFlags.push(flags);
          return fs.openSync(candidate, flags);
        },
        readFileSync() {
          throw new Error("path-based readFileSync must not be used");
        }
      });
      const data = fixture.inspect({}, "lab4-starter", { fileSystem });
      assert.deepEqual(data.files, ["kernel/src/lib.rs", "kernel/src/tokenizer.rs"]);
      assert.match(data.diff, /教学值/);
      assert.match(data.diff, /pub struct Tokenizer/);
      assert.ok(openFlags.length >= 4);
      if (process.platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) {
        assert.equal(openFlags.every((flags) => (flags & fs.constants.O_NOFOLLOW) !== 0), true);
      }
    } finally {
      fixture.cleanup();
    }
  });

  const unsafeCases = [
    {
      name: "NUL binary",
      content: Buffer.from("SAFE_PREFIX\0BINARY_SECRET", "utf8"),
      code: "binary_file"
    },
    {
      name: "invalid UTF-8",
      content: Buffer.from([0x70, 0x75, 0x62, 0xc3, 0x28]),
      code: "invalid_utf8"
    },
    {
      name: "oversized file",
      content: Buffer.alloc(CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES + 1, 0x61),
      code: "file_too_large"
    }
  ];
  for (const scenario of unsafeCases) {
    await t.test(scenario.name, () => {
      const fixture = createFixture();
      const temporary = temporaryDirectoryTracker();
      try {
        writeFile(fixture.repoDir, "kernel/src/lib.rs", scenario.content);
        const error = captureError(() => fixture.inspect({}, "lab4-starter", {
          temporaryDirectoryFactory: temporary.factory
        }));
        assert.equal(error.code, scenario.code);
        const serialized = JSON.stringify({
          code: error.code,
          message: error.message,
          details: error.details
        });
        assert.doesNotMatch(serialized, /BINARY_SECRET|os-tutor-code-diff-|[A-Za-z]:\\/);
        temporary.assertCleaned();
      } finally {
        fixture.cleanup();
      }
    });
  }
});

test("bounded fd reads enforce growing-file and cumulative snapshot limits", async (t) => {
  await t.test("file growth during read stops after the per-file limit", () => {
    const fixture = createFixture();
    const temporary = temporaryDirectoryTracker();
    try {
      const target = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
      let grew = false;
      let bytesRead = 0;
      const fileSystem = fileSystemWith({
        readSync(fd, buffer, offset, length, position) {
          if (!grew) {
            grew = true;
            fs.appendFileSync(target, Buffer.alloc(CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES + 1, 0x61));
          }
          const count = fs.readSync(fd, buffer, offset, length, position);
          bytesRead += count;
          return count;
        }
      });
      const error = captureError(() => fixture.inspect({}, "lab4-starter", {
        fileSystem,
        temporaryDirectoryFactory: temporary.factory
      }));
      assert.equal(error.code, "file_too_large");
      assert.ok(bytesRead <= CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES + 1);
      temporary.assertCleaned();
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("cumulative current reads stop at the snapshot limit", () => {
    const fixture = createFixture();
    const temporary = temporaryDirectoryTracker();
    try {
      for (let index = 0; index < 17; index += 1) {
        writeFile(
          fixture.repoDir,
          `kernel/src/large_${String(index).padStart(2, "0")}.rs`,
          Buffer.alloc(CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES, 0x61)
        );
      }
      git(fixture.repoDir, ["add", "kernel/src"]);
      let bytesRead = 0;
      const fileSystem = fileSystemWith({
        readSync(fd, buffer, offset, length, position) {
          const count = fs.readSync(fd, buffer, offset, length, position);
          bytesRead += count;
          return count;
        }
      });
      const error = captureError(() => fixture.inspect({}, "lab4-starter", {
        fileSystem,
        temporaryDirectoryFactory: temporary.factory
      }));
      assert.equal(error.code, "snapshot_too_large");
      assert.ok(bytesRead <= CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES + 1);
      temporary.assertCleaned();
    } finally {
      fixture.cleanup();
    }
  });
});

test("file identity replacement between validation and open is rejected and cleaned", () => {
  const fixture = createFixture();
  const temporary = temporaryDirectoryTracker();
  try {
    const target = path.join(fixture.repoDir, "kernel", "src", "lib.rs");
    const original = path.join(fixture.repoDir, "original-lib.rs");
    const replacement = writeFile(
      fixture.repoDir,
      "replacement-lib.rs",
      "RACE_REPLACEMENT_CONTENT_MUST_NOT_APPEAR\n"
    );
    let replaced = false;
    const fileSystem = fileSystemWith({
      openSync(candidate, flags) {
        if (!replaced && isInsideDirectory(target, candidate) && isInsideDirectory(candidate, target)) {
          replaced = true;
          fs.renameSync(target, original);
          fs.renameSync(replacement, target);
        }
        return fs.openSync(candidate, flags);
      }
    });
    const error = captureError(() => fixture.inspect({}, "lab4-starter", {
      fileSystem,
      temporaryDirectoryFactory: temporary.factory
    }));
    assert.equal(error.code, "working_tree_file_changed");
    const serialized = JSON.stringify({
      code: error.code,
      message: error.message,
      details: error.details
    });
    assert.doesNotMatch(serialized, /RACE_REPLACEMENT|replacement-lib|original-lib|[A-Za-z]:\\/);
    temporary.assertCleaned();
  } finally {
    fixture.cleanup();
  }
});

test("descendant containment is segment-aware", () => {
  const root = path.resolve("workspace", "kernel", "src");
  assert.equal(isInsideDirectory(root, path.join(root, "trap", "mod.rs")), true);
  assert.equal(isInsideDirectory(root, path.resolve("workspace", "kernel", "src2", "mod.rs")), false);
});

test("untracked teaching files report paths only with a bounded stable list", () => {
  const fixture = createFixture();
  try {
    const secret = "UNTRACKED_CONTENT_MUST_NOT_APPEAR";
    for (let index = CODE_DIFF_MAX_UNTRACKED_FILES + 2; index >= 0; index -= 1) {
      writeFile(fixture.repoDir, `kernel/src/new_${String(index).padStart(2, "0")}.rs`, `${secret}_${index}\n`);
    }
    writeFile(fixture.repoDir, "outside-secret.txt", `${secret}_outside\n`);
    const data = fixture.inspect();
    assert.equal(data.student.workspaceDirty, true);
    assert.equal(data.untrackedIncluded, false);
    assert.equal(data.untrackedTeachingFiles.length, CODE_DIFF_MAX_UNTRACKED_FILES);
    assert.deepEqual(data.untrackedTeachingFiles, [...data.untrackedTeachingFiles].sort());
    assert.equal(data.untrackedTruncated, true);
    assert.equal(data.diff.includes(secret), false);
    assert.equal(JSON.stringify(data).includes("outside-secret.txt"), false);
  } finally {
    fixture.cleanup();
  }
});

test("sensitive untracked paths are hidden while tokenizer.rs remains allowed", () => {
  const fixture = createFixture();
  try {
    const sensitivePaths = [
      "kernel/src/secret.rs",
      "kernel/src/credentials/keyring.rs",
      "kernel/src/github_token.rs",
      "kernel/src/access_token.rs",
      "kernel/src/api_key.rs",
      "kernel/src/password.rs",
      "kernel/src/private_key.rs"
    ];
    for (const relativePath of sensitivePaths) {
      writeFile(fixture.repoDir, relativePath, "SENSITIVE_UNTRACKED_CONTENT\n");
    }
    writeFile(fixture.repoDir, "kernel/src/tokenizer.rs", "pub struct Tokenizer;\n");
    const data = fixture.inspect();
    assert.deepEqual(data.untrackedTeachingFiles, ["kernel/src/tokenizer.rs"]);
    assert.equal(data.diff.includes("SENSITIVE_UNTRACKED_CONTENT"), false);
    for (const sensitivePath of sensitivePaths) {
      assert.equal(JSON.stringify(data).includes(sensitivePath), false);
    }
  } finally {
    fixture.cleanup();
  }
});

test("sensitive tracked and special-character file names never enter diff outputs", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/secret.rs", "pub const SECRET: &str = \"hidden\";\n");
    writeFile(fixture.repoDir, "kernel/src/github_token.rs", "pub const TOKEN: &str = \"hidden\";\n");
    writeFile(fixture.repoDir, "kernel/src/literal[ab].rs", "pub const GLOB: bool = true;\n");
    writeFile(fixture.repoDir, "kernel/src/tokenizer.rs", "pub struct Tokenizer;\n");
    git(fixture.repoDir, ["add", "kernel/src"]);
    git(fixture.repoDir, ["commit", "-m", "tracked path safety cases"]);
    const data = fixture.inspect();
    assert.deepEqual(data.files, ["kernel/src/tokenizer.rs"]);
    assert.deepEqual(data.omittedFiles, []);
    assert.match(data.diff, /pub struct Tokenizer/);
    assert.doesNotMatch(JSON.stringify(data), /secret\.rs|github_token|literal\[ab\]|hidden|GLOB/);
  } finally {
    fixture.cleanup();
  }
});

test("diff body redacts service credentials without removing normal Rust code", () => {
  const fixture = createFixture();
  try {
    const credentials = [
      "Bearer TOPSECRET",
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "glpat-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    ];
    writeFile(fixture.repoDir, "kernel/src/lib.rs", [
      "pub fn normal_teaching_code() -> u32 { 42 }",
      ...credentials.map((value, index) => `const VALUE_${index}: &str = \"${value}\";`),
      ""
    ].join("\n"));
    const data = fixture.inspect();
    assert.match(data.diff, /pub fn normal_teaching_code\(\) -> u32 \{ 42 \}/);
    assert.match(data.diff, /\[REDACTED\]/);
    for (const credential of credentials) {
      assert.equal(data.diff.includes(credential), false, credential);
    }
    assert.doesNotMatch(data.diff, /TOPSECRET|ghp_|github_pat_|glpat-|sk-/i);
  } finally {
    fixture.cleanup();
  }
});

test("path scope restricts returned diff files and sorts multiple paths", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 4 }\n");
    writeFile(fixture.repoDir, "kernel/src/trap/mod.rs", "pub fn trap_entry() { /* changed */ }\n");
    const single = fixture.inspect({ paths: ["kernel/src/lib.rs"] });
    assert.deepEqual(single.files, ["kernel/src/lib.rs"]);
    assert.equal(single.diff.includes("trap_entry"), false);
    const multiple = fixture.inspect({
      paths: ["kernel/src/trap/mod.rs", "kernel/src/lib.rs", "kernel/src/lib.rs"]
    });
    assert.deepEqual(multiple.scope, ["kernel/src/lib.rs", "kernel/src/trap/mod.rs"]);
    assert.deepEqual(multiple.files, ["kernel/src/lib.rs", "kernel/src/trap/mod.rs"]);
  } finally {
    fixture.cleanup();
  }
});

test("line projection preserves patch text and reports truncation and omitted files", () => {
  const first = "kernel/src/a.rs";
  const second = "kernel/src/b.rs";
  const patch = patchSection(first) + patchSection(second);
  const complete = projectPatch(patch, [first, second], 100);
  assert.equal(complete.diff, patch);
  assert.equal(complete.truncated, false);
  assert.deepEqual(complete.files, [first, second]);

  const limited = projectPatch(patch, [first, second], 6);
  assert.equal(limited.returnedLines, 6);
  assert.equal(limited.truncated, true);
  assert.deepEqual(limited.files, [first]);
  assert.deepEqual(limited.omittedFiles, [second]);
});

test("UTF-8 byte projection enforces the total response limit", () => {
  const relativePath = "kernel/src/large.rs";
  const hugeLine = `+${"界".repeat(CODE_DIFF_MAX_BYTES)}\n`;
  const patch = [
    `diff --git a/${relativePath} b/${relativePath}\n`,
    `--- a/${relativePath}\n`,
    `+++ b/${relativePath}\n`,
    "@@ -0,0 +1 @@\n",
    hugeLine
  ].join("");
  const result = projectPatch(patch, [relativePath], 800);
  assert.ok(Buffer.byteLength(result.diff, "utf8") <= CODE_DIFF_MAX_BYTES);
  assert.ok(Buffer.byteLength(result.diff, "utf8") > CODE_DIFF_MAX_BYTES - 3);
  assert.equal(result.truncated, true);
  assert.equal(result.diff.includes("�"), false);
});

test("file projection enforces the file count limit", () => {
  const fixture = createFixture();
  try {
    const files = Array.from(
      { length: CODE_DIFF_MAX_FILES + 2 },
      (_, index) => `kernel/src/f${String(index).padStart(2, "0")}.rs`
    );
    for (const [index, relativePath] of files.entries()) {
      writeFile(fixture.repoDir, relativePath, `pub const VALUE_${index}: usize = ${index};\n`);
    }
    writeFile(fixture.repoDir, "kernel/src/secret.rs", "pub const SECRET: &str = \"hidden\";\n");
    git(fixture.repoDir, ["add", "kernel/src"]);
    git(fixture.repoDir, ["commit", "-m", "many student files"]);
    const data = fixture.inspect();
    assert.equal(data.files.length, CODE_DIFF_MAX_FILES);
    assert.equal(data.truncated, true);
    assert.deepEqual(data.omittedFiles, files.slice(CODE_DIFF_MAX_FILES));
    assert.equal(JSON.stringify(data).includes("secret.rs"), false);
  } finally {
    fixture.cleanup();
  }
});

test("every Git child uses literal argv, safe config, safe environment, and shell false", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 5 }\n");
    const calls = [];
    const inherited = {
      ...process.env,
      GIT_DIR: "C:\\unsafe-git-dir",
      GIT_WORK_TREE: "C:\\unsafe-worktree",
      GIT_INDEX_FILE: "C:\\unsafe-index",
      GIT_EXTERNAL_DIFF: "unsafe-external",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "unsafe-helper",
      UNSAFE_TOKEN: "must-not-be-inherited"
    };
    const data = fixture.inspect({ contextLines: 5 }, "lab4-starter", {
      spawnSync: recordingGit(calls),
      processEnv: inherited
    });
    assert.deepEqual(data.files, ["kernel/src/lib.rs"]);
    assert.ok(calls.length >= 6);
    for (const call of calls) {
      assert.equal(call.program, "git");
      assert.equal(call.options.shell, false);
      assert.equal(call.args[0], "--literal-pathspecs");
      assert.equal(call.args.includes("core.fsmonitor=false"), true);
      assert.equal(call.args.includes("credential.helper="), true);
      assert.equal(call.options.env.GIT_LITERAL_PATHSPECS, "1");
      assert.equal(call.options.env.GIT_NO_LAZY_FETCH, "1");
      assert.equal(call.options.env.GIT_TERMINAL_PROMPT, "0");
      assert.equal(call.options.env.GIT_OPTIONAL_LOCKS, "0");
      assert.equal(call.options.env.GIT_CONFIG_NOSYSTEM, "1");
      assert.equal(call.options.env.GIT_DIR, undefined);
      assert.equal(call.options.env.GIT_WORK_TREE, undefined);
      assert.equal(call.options.env.GIT_INDEX_FILE, undefined);
      assert.equal(call.options.env.GIT_CONFIG_COUNT, undefined);
      assert.equal(call.options.env.UNSAFE_TOKEN, undefined);
    }
    const subcommands = calls.map((call) => gitSubcommand(call.args));
    for (const forbidden of [
      "fetch", "pull", "log", "reflog", "blame", "show", "checkout", "switch",
      "reset", "restore", "clean", "add", "commit", "merge", "rebase", "push"
    ]) {
      assert.equal(subcommands.includes(forbidden), false);
    }
    assert.deepEqual(subcommands, [
      "rev-parse", "status", "ls-tree", "ls-files", "cat-file", "diff"
    ]);
    const isolatedDiff = calls.find((call) => gitSubcommand(call.args) === "diff");
    assert.notEqual(path.resolve(isolatedDiff.options.cwd), path.resolve(fixture.repoDir));
    assert.equal(isolatedDiff.args.includes("--no-index"), true);
    assert.equal(isolatedDiff.args.includes("--no-ext-diff"), true);
    assert.equal(isolatedDiff.args.includes("--no-textconv"), true);
    assert.equal(isolatedDiff.args.includes("--no-color"), true);
    assert.equal(isolatedDiff.args.includes("--no-renames"), true);
    assert.equal(isolatedDiff.args.includes("--unified=5"), true);
    assert.equal(fs.existsSync(isolatedDiff.options.cwd), false);
  } finally {
    fixture.cleanup();
  }
});

test("repository, global, and system helpers are isolated from status and diff", () => {
  const fixture = createFixture();
  try {
    const marker = path.join(fixture.repoDir, "unsafe-helper-ran.txt");
    const helper = writeMarkerHelper(fixture.repoDir, marker);
    git(fixture.repoDir, ["config", "diff.external", helper]);
    git(fixture.repoDir, ["config", "diff.danger.textconv", helper]);
    git(fixture.repoDir, ["config", "filter.danger.clean", helper]);
    git(fixture.repoDir, ["config", "core.fsmonitor", helper]);
    writeFile(fixture.repoDir, ".gitattributes", "*.rs diff=danger filter=danger\n");
    const hostileConfig = writeFile(
      fixture.repoDir,
      "hostile.gitconfig",
      `[core]\n\tfsmonitor = ${helper.replaceAll("\\", "/")}\n[diff]\n\texternal = ${helper.replaceAll("\\", "/")}\n`
    );
    writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 9 }\n");
    const data = fixture.inspect({}, "lab4-starter", {
      processEnv: {
        ...process.env,
        GIT_CONFIG_GLOBAL: hostileConfig,
        GIT_CONFIG_SYSTEM: hostileConfig,
        GIT_EXTERNAL_DIFF: helper
      }
    });
    assert.deepEqual(data.files, ["kernel/src/lib.rs"]);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fixture.cleanup();
  }
});

test("missing and malformed starter baselines return stable errors", () => {
  const fixture = createFixture();
  try {
    assert.equal(
      errorCode(() => fixture.inspect({}, "lab6-starter")),
      "starter_baseline_unavailable"
    );
  } finally {
    fixture.cleanup();
  }
  const malformedFixture = createFixture();
  try {
    const malformed = createCodeDiffEngine({
      repoDir: malformedFixture.repoDir,
      spawnSync: recordingGit([], (call) => (
        gitSubcommand(call.args) === "rev-parse"
          ? { status: 0, stdout: "not-a-commit\n", stderr: "" }
          : null
      ))
    });
    assert.equal(
      errorCode(() => malformed({}, malformedFixture.context())),
      "baseline_resolution_failed"
    );
  } finally {
    malformedFixture.cleanup();
  }
});

test("Git failures do not expose stderr, absolute paths, environment, or tokens", () => {
  const fixture = createFixture();
  try {
    const hostPath = "C:\\Users\\student\\private-repo";
    const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    const engine = createCodeDiffEngine({
      repoDir: fixture.repoDir,
      spawnSync: recordingGit([], (call) => (
        gitSubcommand(call.args) === "ls-tree"
          ? {
              status: 1,
              stdout: "",
              stderr: `fatal at ${hostPath}; Authorization: Bearer ${token}; SECRET_ENV=value`
            }
          : null
      ))
    });
    try {
      engine({}, fixture.context());
      assert.fail("expected git_diff_failed");
    } catch (error) {
      assert.equal(error.code, "git_diff_failed");
      const serialized = JSON.stringify({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details
      });
      assert.equal(serialized.includes(hostPath), false);
      assert.equal(serialized.includes(token), false);
      assert.equal(serialized.includes("SECRET_ENV"), false);
      assert.equal(serialized.includes("stderr"), false);
      assert.equal(Object.hasOwn(error.details, "exitCode"), true);
    }
  } finally {
    fixture.cleanup();
  }
});

test("missing promisor objects fail locally with lazy fetch and prompts disabled", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/lib.rs", "pub fn lesson_value() -> u32 { 10 }\n");
    const calls = [];
    let temporaryRoot = null;
    const engine = createCodeDiffEngine({
      repoDir: fixture.repoDir,
      temporaryDirectoryFactory(prefix) {
        temporaryRoot = fs.mkdtempSync(prefix);
        return temporaryRoot;
      },
      spawnSync: recordingGit(calls, (call) => (
        gitSubcommand(call.args) === "cat-file"
          ? {
              status: 128,
              stdout: Buffer.alloc(0),
              stderr: "missing promisor object; credential=https://token@example.invalid"
            }
          : null
      ))
    });
    assert.equal(errorCode(() => engine({}, fixture.context())), "git_diff_failed");
    assert.equal(calls.every((call) => call.options.env.GIT_NO_LAZY_FETCH === "1"), true);
    assert.equal(calls.every((call) => call.options.env.GIT_TERMINAL_PROMPT === "0"), true);
    assert.equal(calls.some((call) => ["fetch", "pull"].includes(gitSubcommand(call.args))), false);
    assert.notEqual(temporaryRoot, null);
    assert.equal(fs.existsSync(temporaryRoot), false);
  } finally {
    fixture.cleanup();
  }
});

test("get_code_diff leaves branch, HEAD, staged state, status, and files unchanged", () => {
  const fixture = createFixture();
  try {
    writeFile(fixture.repoDir, "kernel/src/memory/page_table.rs", "pub fn map_page() { /* staged */ }\n");
    git(fixture.repoDir, ["add", "kernel/src/memory/page_table.rs"]);
    writeFile(fixture.repoDir, "kernel/src/trap/mod.rs", "pub fn trap_entry() { /* unstaged */ }\n");
    writeFile(fixture.repoDir, "kernel/src/new.rs", "untracked teaching file\n");
    const trackedFiles = [
      "kernel/src/lib.rs",
      "kernel/src/memory/page_table.rs",
      "kernel/src/trap/mod.rs"
    ];
    const snapshot = () => ({
      branch: git(fixture.repoDir, ["branch", "--show-current"]),
      head: git(fixture.repoDir, ["rev-parse", "HEAD"]),
      status: git(fixture.repoDir, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      cached: git(fixture.repoDir, ["diff", "--cached", "--binary"]),
      index: crypto.createHash("sha256")
        .update(fs.readFileSync(path.join(fixture.repoDir, ".git", "index")))
        .digest("hex"),
      files: Object.fromEntries(trackedFiles.map((file) => [
        file,
        crypto.createHash("sha256").update(fs.readFileSync(path.join(fixture.repoDir, ...file.split("/")))).digest("hex")
      ])),
      untracked: fs.readFileSync(path.join(fixture.repoDir, "kernel", "src", "new.rs"), "utf8")
    });
    const before = snapshot();
    const data = fixture.inspect();
    const after = snapshot();
    assert.equal(data.student.workspaceDirty, true);
    assert.deepEqual(after, before);
  } finally {
    fixture.cleanup();
  }
});

test("sanitized Git environment removes inherited Git controls", () => {
  const clean = createSafeGitEnvironment({
    PATH: "safe",
    TEMP: "C:\\safe-temp",
    Git_Dir: "unsafe",
    GIT_WORK_TREE: "unsafe",
    GIT_CONFIG_PARAMETERS: "unsafe",
    TOKEN: "not-returned"
  }, "win32");
  assert.equal(clean.PATH, "safe");
  assert.equal(clean.TEMP, "C:\\safe-temp");
  assert.equal(clean.Git_Dir, undefined);
  assert.equal(clean.GIT_WORK_TREE, undefined);
  assert.equal(clean.GIT_CONFIG_PARAMETERS, undefined);
  assert.equal(clean.TOKEN, undefined);
  assert.equal(clean.GIT_PAGER, "");
  assert.equal(clean.GIT_EXTERNAL_DIFF, "");
  assert.equal(clean.GIT_LITERAL_PATHSPECS, "1");
  assert.equal(clean.GIT_NO_LAZY_FETCH, "1");
  assert.equal(clean.GIT_NO_REPLACE_OBJECTS, "1");
  assert.equal(clean.GIT_OPTIONAL_LOCKS, "0");
  assert.equal(clean.GIT_TERMINAL_PROMPT, "0");
  assert.equal(clean.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(clean.GIT_CONFIG_GLOBAL, "NUL");
  assert.equal(clean.GIT_CONFIG_SYSTEM, "NUL");
  const posix = createSafeGitEnvironment({ PATH: "/usr/bin" }, "linux");
  assert.equal(posix.GIT_CONFIG_GLOBAL, "/dev/null");
  assert.equal(posix.GIT_CONFIG_SYSTEM, "/dev/null");
  assert.deepEqual(sanitizedGitEnvironment({ PATH: "safe" }, "win32"),
    createSafeGitEnvironment({ PATH: "safe" }, "win32"));
});
