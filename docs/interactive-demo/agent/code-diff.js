"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BRANCH_CATALOG, parseBranchContext } = require("../protocol");
const { validateReadCodePath } = require("./policy");
const { classifySafeUtf8Text, redactSensitiveText } = require("./safe-text");

const CODE_DIFF_SCHEMA_VERSION = "os-tutor.code-diff/v1";
const CODE_DIFF_DEFAULT_CONTEXT_LINES = 3;
const CODE_DIFF_MAX_CONTEXT_LINES = 5;
const CODE_DIFF_DEFAULT_MAX_LINES = 400;
const CODE_DIFF_MAX_LINES = 800;
const CODE_DIFF_MAX_BYTES = 64 * 1024;
const CODE_DIFF_MAX_CAPTURE_BYTES = 512 * 1024;
const CODE_DIFF_MAX_PATHS = 20;
const CODE_DIFF_MAX_FILES = 40;
const CODE_DIFF_MAX_OMITTED_FILES = 40;
const CODE_DIFF_MAX_UNTRACKED_FILES = 20;
const CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES = 512 * 1024;
const CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES = 8 * 1024 * 1024;
const CODE_DIFF_MAX_SNAPSHOT_FILES = 512;
const CODE_DIFF_MAX_INDEX_BYTES = 8 * 1024 * 1024;
const CODE_DIFF_READ_CHUNK_BYTES = 64 * 1024;
const CODE_DIFF_DEFAULT_SCOPE = Object.freeze(["kernel/src/"]);
const CODE_DIFF_INPUT_FIELDS = new Set(["lab", "paths", "contextLines", "maxLines"]);
const GIT_PATHSPEC_META = /[:*?\[\]]/;
const FORBIDDEN_TEACHING_PATH_WORDS = new Set([
  "answer",
  "answers",
  "complete",
  "instructor",
  "instructors",
  "reference",
  "solution",
  "solutions",
  "teacher",
  "teachers"
]);
const SENSITIVE_PATH_WORDS = new Set([
  "apikey",
  "credential",
  "credentials",
  "password",
  "secret",
  "secrets",
  "token"
]);
const SENSITIVE_KEY_PREFIXES = new Set(["access", "api", "private", "secret"]);

const STARTER_BASELINES = Object.freeze(Object.fromEntries(
  Object.entries(BRANCH_CATALOG)
    .filter(([, context]) => context.variant === "starter" && /^lab[1-7]$/.test(context.lab))
    .map(([branch, context]) => [
      context.lab,
      Object.freeze({
        branch,
        ref: `refs/remotes/origin/${branch}`
      })
    ])
));

class CodeDiffError extends Error {
  constructor(code, message, retryable = false, details = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function safeExitCode(value) {
  return Number.isInteger(value) ? value : null;
}

function createSafeGitEnvironment(source = process.env, platform = process.platform) {
  const environment = {};
  const allowedKeys = new Set([
    "COMSPEC",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "WINDIR"
  ]);
  for (const [key, value] of Object.entries(source || {})) {
    const canonical = key.toUpperCase();
    if (allowedKeys.has(canonical) && typeof value === "string") {
      environment[canonical] = value;
    }
  }
  const nullDevice = platform === "win32" ? "NUL" : "/dev/null";
  environment.GIT_CONFIG_GLOBAL = nullDevice;
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_SYSTEM = nullDevice;
  environment.GIT_EXTERNAL_DIFF = "";
  environment.GIT_LITERAL_PATHSPECS = "1";
  environment.GIT_NO_LAZY_FETCH = "1";
  environment.GIT_NO_REPLACE_OBJECTS = "1";
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.GIT_PAGER = "";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GCM_INTERACTIVE = "Never";
  environment.PAGER = "cat";
  return environment;
}

const sanitizedGitEnvironment = createSafeGitEnvironment;

function plainContextValue(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function hasForbiddenTeachingPathWord(relativePath) {
  return relativePath.split("/").some((segment) => {
    const stem = segment.replace(/\.[^.]*$/, "").toLowerCase();
    return stem.split(/[^a-z0-9]+/).some((word) => FORBIDDEN_TEACHING_PATH_WORDS.has(word));
  });
}

function hasSensitiveTeachingPathWord(relativePath) {
  return relativePath.split("/").some((segment) => {
    const stem = segment.replace(/\.[^.]*$/, "").toLowerCase();
    const words = stem.split(/[_\-.]+/).filter(Boolean);
    if (SENSITIVE_PATH_WORDS.has(stem)
      || words.some((word) => SENSITIVE_PATH_WORDS.has(word))) {
      return true;
    }
    return words.some((word, index) => (
      word === "key"
      && index > 0
      && SENSITIVE_KEY_PREFIXES.has(words[index - 1])
    ));
  });
}

function validateTeachingPath(value, index = null) {
  if (value === "kernel/src/") return value;
  const check = validateReadCodePath(value);
  if (!check.ok
    || !check.value.startsWith("kernel/src/")
    || GIT_PATHSPEC_META.test(check.value)
    || hasForbiddenTeachingPathWord(check.value)
    || hasSensitiveTeachingPathWord(check.value)) {
    throw new CodeDiffError(
      "path_not_allowed",
      "Each path must be safe teaching code below kernel/src/.",
      false,
      index === null ? {} : { index }
    );
  }
  return check.value;
}

function validateCodeDiffInput(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new CodeDiffError("invalid_tool_input", "get_code_diff input must be an object.");
  }

  const unknownField = Object.keys(args).find((field) => !CODE_DIFF_INPUT_FIELDS.has(field));
  if (unknownField) {
    throw new CodeDiffError(
      "invalid_tool_input",
      "get_code_diff input contains an unknown field.",
      false,
      { field: unknownField }
    );
  }

  let lab = null;
  if (args.lab !== undefined) {
    if (typeof args.lab !== "string" || !Object.hasOwn(STARTER_BASELINES, args.lab)) {
      throw new CodeDiffError("unknown_lab", "lab must be one of lab1 through lab7.");
    }
    lab = args.lab;
  }

  let scope = [...CODE_DIFF_DEFAULT_SCOPE];
  if (args.paths !== undefined) {
    if (!Array.isArray(args.paths) || args.paths.length === 0) {
      throw new CodeDiffError("path_not_allowed", "paths must be a non-empty string array.");
    }
    if (args.paths.length > CODE_DIFF_MAX_PATHS) {
      throw new CodeDiffError(
        "too_many_paths",
        `paths may contain at most ${CODE_DIFF_MAX_PATHS} entries.`
      );
    }
    scope = [...new Set(args.paths.map((value, index) => validateTeachingPath(value, index)))]
      .sort();
  }

  const contextLines = args.contextLines === undefined
    ? CODE_DIFF_DEFAULT_CONTEXT_LINES
    : args.contextLines;
  if (!Number.isSafeInteger(contextLines)
    || contextLines < 0
    || contextLines > CODE_DIFF_MAX_CONTEXT_LINES) {
    throw new CodeDiffError(
      "invalid_context_lines",
      `contextLines must be an integer between 0 and ${CODE_DIFF_MAX_CONTEXT_LINES}.`
    );
  }

  const maxLines = args.maxLines === undefined ? CODE_DIFF_DEFAULT_MAX_LINES : args.maxLines;
  if (!Number.isSafeInteger(maxLines) || maxLines < 1 || maxLines > CODE_DIFF_MAX_LINES) {
    throw new CodeDiffError(
      "invalid_max_lines",
      `maxLines must be an integer between 1 and ${CODE_DIFF_MAX_LINES}.`
    );
  }

  return { lab, scope, contextLines, maxLines };
}

function resolveStarterContext(workspaceContext, requestedLab = null) {
  if (!workspaceContext || typeof workspaceContext !== "object") {
    throw new CodeDiffError("context_unavailable", "The workspace context is unavailable.", true);
  }
  if (!plainContextValue(workspaceContext.branch)
    || !plainContextValue(workspaceContext.commit)) {
    throw new CodeDiffError("context_unavailable", "The workspace branch or commit is unavailable.", true);
  }

  const teaching = parseBranchContext(workspaceContext.branch);
  if (["solution", "complete"].includes(teaching.variant)) {
    throw new CodeDiffError(
      "solution_diff_forbidden",
      "Solution and complete branches cannot be compared to starter baselines."
    );
  }
  if (!teaching.expectedBranch) {
    throw new CodeDiffError(
      "branch_not_allowed",
      "get_code_diff requires a registered starter teaching branch."
    );
  }
  if (!teaching.lab || !Object.hasOwn(STARTER_BASELINES, teaching.lab)) {
    throw new CodeDiffError("unknown_lab", "The current branch has no registered starter baseline.");
  }
  if (teaching.variant !== "starter") {
    throw new CodeDiffError(
      "branch_not_allowed",
      "get_code_diff is available only on registered starter branches."
    );
  }
  if (requestedLab !== null && requestedLab !== teaching.lab) {
    throw new CodeDiffError(
      "lab_mismatch",
      "The requested lab does not match the current trusted workspace context.",
      false,
      { requestedLab, actualLab: teaching.lab }
    );
  }

  return {
    lab: teaching.lab,
    baseline: STARTER_BASELINES[teaching.lab],
    student: {
      branch: teaching.branch,
      commit: workspaceContext.commit
    }
  };
}

function utf8Prefix(value, maxBytes) {
  let bytes = 0;
  let end = 0;
  for (const character of value) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maxBytes) break;
    bytes += width;
    end += character.length;
  }
  return value.slice(0, end);
}

function lineRecords(value) {
  if (!value) return [];
  return String(value).match(/[^\n]*\n|[^\n]+$/g) || [];
}

function projectPatch(patch, files, maxLines, maxBytes = CODE_DIFF_MAX_BYTES) {
  if (!patch || files.length === 0) {
    return {
      diff: "",
      files: [],
      omittedFiles: [],
      omittedFilesTruncated: false,
      returnedLines: 0,
      truncated: false
    };
  }

  const starts = [];
  const header = /^diff --git /gm;
  for (let match = header.exec(patch); match; match = header.exec(patch)) starts.push(match.index);
  if (starts.length !== files.length) {
    throw new CodeDiffError(
      "git_diff_failed",
      "Git returned an unexpected patch structure.",
      false,
      { stage: "projection" }
    );
  }

  const sections = starts.map((start, index) => ({
    file: files[index],
    text: patch.slice(start, starts[index + 1] ?? patch.length)
  }));
  const output = [];
  const returnedFiles = [];
  const omitted = [];
  let returnedBytes = 0;
  let returnedLines = 0;
  let truncated = false;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    let sectionStarted = false;
    let sectionComplete = true;
    for (const record of lineRecords(section.text)) {
      if (returnedLines >= maxLines || returnedBytes >= maxBytes) {
        sectionComplete = false;
        break;
      }
      const remainingBytes = maxBytes - returnedBytes;
      const recordBytes = Buffer.byteLength(record, "utf8");
      const selected = recordBytes <= remainingBytes ? record : utf8Prefix(record, remainingBytes);
      if (!selected) {
        sectionComplete = false;
        break;
      }
      output.push(selected);
      sectionStarted = true;
      returnedLines += 1;
      returnedBytes += Buffer.byteLength(selected, "utf8");
      if (selected !== record) {
        sectionComplete = false;
        break;
      }
    }

    if (sectionStarted) returnedFiles.push(section.file);
    if (!sectionComplete) {
      truncated = true;
      const omittedStart = sectionStarted ? sectionIndex + 1 : sectionIndex;
      omitted.push(...sections.slice(omittedStart).map((item) => item.file));
      break;
    }
  }

  const safeOmitted = [...new Set(omitted)].sort();
  return {
    diff: output.join(""),
    files: [...new Set(returnedFiles)].sort(),
    omittedFiles: safeOmitted.slice(0, CODE_DIFF_MAX_OMITTED_FILES),
    omittedFilesTruncated: safeOmitted.length > CODE_DIFF_MAX_OMITTED_FILES,
    returnedLines,
    truncated
  };
}

function safeGitArguments(args, nullDevice, workTree = null) {
  const safeArguments = [
    "--literal-pathspecs",
    "-c",
    "core.untrackedCache=false",
    "-c",
    `core.hooksPath=${nullDevice}`,
    "-c",
    "credential.helper=",
    "-c",
    "diff.external=",
  ];
  if (workTree !== null) {
    safeArguments.push("-c", "core.bare=false", "-c", `core.worktree=${workTree}`);
  }
  safeArguments.push(...args);
  return safeArguments;
}

function parseBaselineTree(output) {
  const files = new Map();
  for (const entry of String(output || "").split("\0")) {
    if (!entry) continue;
    const match = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40,64})\t([^\0]+)$/i.exec(entry);
    if (!match) {
      throw new CodeDiffError(
        "git_diff_failed",
        "Git returned an unexpected baseline tree entry.",
        false,
        { stage: "baseline_tree" }
      );
    }
    let relativePath;
    try {
      relativePath = validateTeachingPath(match[4]);
    } catch (_) {
      // Unsafe, sensitive, or non-teaching paths are excluded from every output channel.
      continue;
    }
    if (match[2] === "tree") continue;
    if (match[2] !== "blob" || !["100644", "100755"].includes(match[1])) {
      throw new CodeDiffError(
        "unsafe_baseline_entry",
        "The starter baseline contains a non-regular teaching entry.",
        false,
        { stage: "baseline_tree" }
      );
    }
    files.set(relativePath, { objectId: match[3].toLowerCase(), mode: match[1] });
  }
  return files;
}

function normalizeTeachingMetadataPath(value, stage) {
  const invalid = typeof value !== "string"
    || value.length === 0
    || value.length > 1000
    || /[\u0000-\u001f\u007f]/.test(value)
    || value.includes("\\")
    || path.posix.isAbsolute(value)
    || /^[A-Za-z]:/.test(value);
  const segments = invalid ? [] : value.split("/");
  const normalized = invalid ? "" : path.posix.normalize(value);
  if (invalid
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || normalized !== value
    || !normalized.startsWith("kernel/src/")) {
    throw new CodeDiffError(
      "git_diff_failed",
      "Git returned an unsafe teaching metadata path.",
      false,
      { stage }
    );
  }
  return normalized;
}

function visibleTeachingPath(relativePath) {
  try {
    return validateTeachingPath(relativePath);
  } catch (_) {
    return null;
  }
}

function parseTreeMetadata(output, stage) {
  const files = new Map();
  for (const entry of String(output || "").split("\0")) {
    if (!entry) continue;
    const match = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40,64})\t([^\0]+)$/i.exec(entry);
    if (!match) {
      throw new CodeDiffError(
        "git_diff_failed",
        "Git returned unexpected tree metadata.",
        false,
        { stage }
      );
    }
    const relativePath = normalizeTeachingMetadataPath(match[4], stage);
    if (files.has(relativePath)) {
      throw new CodeDiffError(
        "git_diff_failed",
        "Git returned duplicate tree metadata.",
        false,
        { stage }
      );
    }
    files.set(relativePath, {
      mode: match[1],
      objectId: match[3].toLowerCase(),
      type: match[2],
      visiblePath: visibleTeachingPath(relativePath)
    });
  }
  return files;
}

function parseIndexMetadata(output) {
  const entries = new Map();
  const stageZero = new Map();
  let hasUnmergedEntries = false;
  for (const value of String(output || "").split("\0")) {
    if (!value) continue;
    const match = /^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])\t([^\0]+)$/i.exec(value);
    if (!match) {
      throw new CodeDiffError(
        "git_diff_failed",
        "Git returned unexpected index metadata.",
        false,
        { stage: "index_metadata" }
      );
    }
    const relativePath = normalizeTeachingMetadataPath(match[4], "index_metadata");
    const stage = Number(match[3]);
    const metadata = {
      mode: match[1],
      objectId: match[2].toLowerCase(),
      stage,
      visiblePath: visibleTeachingPath(relativePath)
    };
    const pathEntries = entries.get(relativePath) || [];
    if (pathEntries.some((item) => item.stage === stage)) {
      throw new CodeDiffError(
        "git_diff_failed",
        "Git returned duplicate index metadata.",
        false,
        { stage: "index_metadata" }
      );
    }
    pathEntries.push(metadata);
    entries.set(relativePath, pathEntries);
    if (stage === 0) stageZero.set(relativePath, metadata);
    else hasUnmergedEntries = true;
  }
  return { entries, stageZero, hasUnmergedEntries };
}

function sameGitMetadata(left, right) {
  return Boolean(left && right)
    && left.mode === right.mode
    && left.objectId === right.objectId;
}

function metadataMapsDiffer(left, right) {
  if (left.size !== right.size) return true;
  for (const [relativePath, metadata] of left) {
    if (!sameGitMetadata(metadata, right.get(relativePath))) return true;
  }
  return false;
}

function pathMatchesScope(relativePath, scope) {
  return scope.some((selected) => (
    selected.endsWith("/") ? relativePath.startsWith(selected) : relativePath === selected
  ));
}

function gitBlobObjectId(content, objectIdLength) {
  const algorithm = objectIdLength === 64 ? "sha256" : "sha1";
  const header = Buffer.from(`blob ${content.length}\0`, "utf8");
  return crypto.createHash(algorithm).update(header).update(content).digest("hex");
}

function isInsideDirectory(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSamePath(left, right) {
  return path.relative(left, right) === "" && path.relative(right, left) === "";
}

function filesystemError(code, message, stage = "current_snapshot") {
  return new CodeDiffError(code, message, false, { stage });
}

function resolveTrustedTeachingRoot(fileSystem, repoRealPath) {
  let cursor = repoRealPath;
  for (const segment of ["kernel", "src"]) {
    cursor = path.join(cursor, segment);
    let stats;
    try {
      stats = fileSystem.lstatSync(cursor);
    } catch (_) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "The trusted teaching root could not be safely inspected.",
        "snapshot"
      );
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "The trusted teaching root contains an unsafe filesystem entry.",
        "snapshot"
      );
    }
    let resolved;
    try {
      resolved = fileSystem.realpathSync(cursor);
    } catch (_) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "The trusted teaching root could not be safely resolved.",
        "snapshot"
      );
    }
    if (!isSamePath(cursor, resolved)) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "The trusted teaching root contains an unsafe filesystem entry.",
        "snapshot"
      );
    }
  }
  if (!isInsideDirectory(repoRealPath, cursor)) {
    throw filesystemError(
      "unsafe_working_tree_file",
      "The trusted teaching root is outside the workspace.",
      "snapshot"
    );
  }
  return cursor;
}

function inspectTeachingPath(fileSystem, repoRealPath, trustedTeachingRoot, relativePath) {
  const segments = relativePath.split("/");
  let cursor = repoRealPath;
  const components = [];
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    const final = index === segments.length - 1;
    let stats;
    try {
      stats = fileSystem.lstatSync(cursor);
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw filesystemError(
        "unsafe_working_tree_file",
        "A teaching path could not be safely inspected."
      );
    }

    const expectedType = final ? stats.isFile() : stats.isDirectory();
    if (!expectedType || stats.isSymbolicLink()) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "A teaching path contains a non-regular or linked filesystem entry."
      );
    }
    let resolved;
    try {
      resolved = fileSystem.realpathSync(cursor);
    } catch (_) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "A teaching path could not be safely resolved."
      );
    }
    if (!isSamePath(cursor, resolved)) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "A teaching path contains a linked filesystem entry."
      );
    }
    if (index === 1 && !isSamePath(resolved, trustedTeachingRoot)) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "The teaching root identity changed while the snapshot was read."
      );
    }
    if (index > 1 && !isInsideDirectory(trustedTeachingRoot, resolved)) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "A teaching file resolved outside the trusted teaching root."
      );
    }
    components.push({ path: cursor, realPath: resolved, stats });
  }
  return {
    candidate: cursor,
    components,
    realPath: components.at(-1).realPath,
    stats: components.at(-1).stats
  };
}

function sameObjectIdentity(left, right) {
  if (!left || !right) return false;
  if (left.dev !== undefined && left.ino !== undefined
    && right.dev !== undefined && right.ino !== undefined) {
    return left.dev === right.dev && left.ino === right.ino;
  }
  return left.mode === right.mode
    && left.birthtimeMs === right.birthtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function sameFileState(left, right) {
  return sameObjectIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function samePathInspection(left, right) {
  if (!left || !right || left.components.length !== right.components.length) return false;
  return left.components.every((component, index) => (
    isSamePath(component.realPath, right.components[index].realPath)
    && sameObjectIdentity(component.stats, right.components[index].stats)
  ));
}

function inspectFilesystemNode(fileSystem, trustedTeachingRoot, candidate) {
  let stats;
  try {
    stats = fileSystem.lstatSync(candidate);
  } catch (_) {
    throw filesystemError(
      "unsafe_working_tree_file",
      "A teaching filesystem entry could not be safely inspected.",
      "filesystem_walk"
    );
  }
  if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
    throw filesystemError(
      "unsafe_working_tree_file",
      "The teaching filesystem contains a linked or non-regular entry.",
      "filesystem_walk"
    );
  }
  let realPath;
  try {
    realPath = fileSystem.realpathSync(candidate);
  } catch (_) {
    throw filesystemError(
      "unsafe_working_tree_file",
      "A teaching filesystem entry could not be safely resolved.",
      "filesystem_walk"
    );
  }
  if (!isSamePath(candidate, realPath) || !isInsideDirectory(trustedTeachingRoot, realPath)) {
    throw filesystemError(
      "unsafe_working_tree_file",
      "A teaching filesystem entry resolved outside its trusted root.",
      "filesystem_walk"
    );
  }
  return { realPath, stats };
}

function readBoundedDirectoryEntries(fileSystem, candidate, state) {
  let directory = null;
  const names = [];
  try {
    directory = fileSystem.opendirSync(candidate);
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      state.candidates += 1;
      if (state.candidates > CODE_DIFF_MAX_SNAPSHOT_FILES) {
        throw filesystemError(
          "too_many_working_tree_files",
          "The teaching filesystem contains too many candidate entries.",
          "filesystem_walk"
        );
      }
      names.push(entry.name);
    }
  } catch (error) {
    if (error instanceof CodeDiffError) throw error;
    throw filesystemError(
      "unsafe_working_tree_file",
      "A teaching directory could not be safely enumerated.",
      "filesystem_walk"
    );
  } finally {
    if (directory !== null) {
      try {
        directory.closeSync();
      } catch (_) {
        throw filesystemError(
          "unsafe_working_tree_file",
          "A teaching directory could not be safely closed.",
          "filesystem_walk"
        );
      }
    }
  }
  return names.sort();
}

function enumerateTeachingFilesystem(fileSystem, trustedTeachingRoot) {
  const files = new Map();
  const state = { candidates: 0 };
  const pending = [{ absolutePath: trustedTeachingRoot, relativePath: "kernel/src" }];
  while (pending.length > 0) {
    const directory = pending.pop();
    const before = inspectFilesystemNode(
      fileSystem,
      trustedTeachingRoot,
      directory.absolutePath
    );
    if (!before.stats.isDirectory()) {
      throw filesystemError(
        "unsafe_working_tree_file",
        "A teaching directory was replaced by a non-directory entry.",
        "filesystem_walk"
      );
    }
    const names = readBoundedDirectoryEntries(fileSystem, directory.absolutePath, state);
    const after = inspectFilesystemNode(
      fileSystem,
      trustedTeachingRoot,
      directory.absolutePath
    );
    if (!after.stats.isDirectory()
      || !isSamePath(before.realPath, after.realPath)
      || !sameFileState(before.stats, after.stats)) {
      throw filesystemError(
        "working_tree_file_changed",
        "A teaching directory changed while it was being safely enumerated.",
        "filesystem_walk"
      );
    }

    for (const name of names) {
      const relativePath = normalizeTeachingMetadataPath(
        `${directory.relativePath}/${name}`,
        "filesystem_walk"
      );
      const absolutePath = path.join(directory.absolutePath, name);
      const inspected = inspectFilesystemNode(fileSystem, trustedTeachingRoot, absolutePath);
      if (inspected.stats.isDirectory()) {
        pending.push({ absolutePath, relativePath });
      } else {
        files.set(relativePath, {
          visiblePath: visibleTeachingPath(relativePath)
        });
      }
    }
  }
  return files;
}

function boundedReadSync(fileSystem, fd, maxBytes) {
  const chunks = [];
  let total = 0;
  const chunk = Buffer.allocUnsafe(Math.max(1, Math.min(CODE_DIFF_READ_CHUNK_BYTES, maxBytes + 1)));
  while (total <= maxBytes) {
    const remaining = maxBytes + 1 - total;
    const bytesRead = fileSystem.readSync(fd, chunk, 0, Math.min(chunk.length, remaining), null);
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    total += bytesRead;
  }
  return Buffer.concat(chunks, total);
}

function indexSnapshotError(code, message, stage = "index_snapshot") {
  return new CodeDiffError(code, message, false, { stage });
}

function resolveIndexFilePath(fileSystem, repoDir, output) {
  const value = String(output || "").replace(/\r?\n$/, "");
  if (!value
    || value.length > 4096
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw indexSnapshotError(
      "unsafe_index_file",
      "The repository index location could not be safely resolved.",
      "index_path"
    );
  }
  const candidate = path.isAbsolute(value) ? path.normalize(value) : path.resolve(repoDir, value);
  let stats;
  try {
    stats = fileSystem.lstatSync(candidate);
  } catch (_) {
    throw indexSnapshotError(
      "unsafe_index_file",
      "The repository index could not be safely inspected."
    );
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw indexSnapshotError(
      "unsafe_index_file",
      "The repository index is not a safe regular file."
    );
  }
  let realPath;
  try {
    realPath = fileSystem.realpathSync(candidate);
  } catch (_) {
    throw indexSnapshotError(
      "unsafe_index_file",
      "The repository index could not be safely resolved."
    );
  }
  if (!isSamePath(candidate, realPath)) {
    throw indexSnapshotError(
      "unsafe_index_file",
      "The repository index contains a linked filesystem component."
    );
  }
  return { candidate, realPath, stats };
}

function changedIndexError() {
  return indexSnapshotError(
    "index_file_changed",
    "The repository index changed while its safe snapshot was being read."
  );
}

function readIndexFileSnapshot(fileSystem, repoDir, output, platform) {
  const pre = resolveIndexFilePath(fileSystem, repoDir, output);
  if (pre.stats.size > CODE_DIFF_MAX_INDEX_BYTES) {
    throw indexSnapshotError(
      "index_file_too_large",
      "The repository index exceeds the safe snapshot size limit."
    );
  }

  let fd = null;
  try {
    let flags = fs.constants.O_RDONLY;
    if (platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    try {
      fd = fileSystem.openSync(pre.candidate, flags);
    } catch (_) {
      throw changedIndexError();
    }
    let opened;
    try {
      opened = fileSystem.fstatSync(fd);
    } catch (_) {
      throw changedIndexError();
    }
    if (!opened.isFile() || !sameFileState(pre.stats, opened)) throw changedIndexError();
    if (opened.size > CODE_DIFF_MAX_INDEX_BYTES) {
      throw indexSnapshotError(
        "index_file_too_large",
        "The repository index exceeds the safe snapshot size limit."
      );
    }

    let content;
    try {
      content = boundedReadSync(fileSystem, fd, CODE_DIFF_MAX_INDEX_BYTES);
    } catch (_) {
      throw changedIndexError();
    }
    if (content.length > CODE_DIFF_MAX_INDEX_BYTES) {
      throw indexSnapshotError(
        "index_file_too_large",
        "The repository index exceeds the safe snapshot size limit."
      );
    }

    let openedAfter;
    let post;
    try {
      openedAfter = fileSystem.fstatSync(fd);
      post = resolveIndexFilePath(fileSystem, repoDir, output);
    } catch (_) {
      throw changedIndexError();
    }
    if (!sameFileState(opened, openedAfter)
      || !sameFileState(openedAfter, post.stats)
      || !isSamePath(pre.realPath, post.realPath)) {
      throw changedIndexError();
    }
    return content;
  } finally {
    if (fd !== null) {
      try {
        fileSystem.closeSync(fd);
      } catch (_) {
        throw changedIndexError();
      }
    }
  }
}

function validateTeachingText(content, stage = "current_snapshot") {
  const classification = classifySafeUtf8Text(content);
  if (!classification.ok) {
    throw filesystemError(
      classification.code,
      classification.code === "invalid_utf8"
        ? "A teaching file is not valid UTF-8 text."
        : "A teaching file contains unsafe binary data.",
      stage
    );
  }
}

function changedFileError() {
  return filesystemError(
    "working_tree_file_changed",
    "A teaching file changed while its safe snapshot was being read."
  );
}

function readCurrentTeachingFile(
  fileSystem,
  repoRealPath,
  trustedTeachingRoot,
  relativePath,
  remainingSnapshotBytes,
  platform
) {
  const pre = inspectTeachingPath(fileSystem, repoRealPath, trustedTeachingRoot, relativePath);
  if (pre === null) return null;
  if (pre.stats.size > CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES) {
    throw filesystemError(
      "file_too_large",
      "A teaching file exceeds the safe per-file snapshot limit."
    );
  }
  if (pre.stats.size > remainingSnapshotBytes) {
    throw filesystemError(
      "snapshot_too_large",
      "The safe teaching snapshot exceeds its total size limit."
    );
  }

  let fd = null;
  try {
    let flags = fs.constants.O_RDONLY;
    if (platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    try {
      fd = fileSystem.openSync(pre.candidate, flags);
    } catch (_) {
      throw changedFileError();
    }

    let opened;
    try {
      opened = fileSystem.fstatSync(fd);
    } catch (_) {
      throw changedFileError();
    }
    if (!opened.isFile() || !sameFileState(pre.stats, opened)) throw changedFileError();
    if (opened.size > CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES) {
      throw filesystemError(
        "file_too_large",
        "A teaching file exceeds the safe per-file snapshot limit."
      );
    }
    if (opened.size > remainingSnapshotBytes) {
      throw filesystemError(
        "snapshot_too_large",
        "The safe teaching snapshot exceeds its total size limit."
      );
    }

    const boundedLimit = Math.min(
      CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES,
      remainingSnapshotBytes
    );
    let content;
    try {
      content = boundedReadSync(fileSystem, fd, boundedLimit);
    } catch (_) {
      throw changedFileError();
    }
    if (content.length > boundedLimit) {
      if (remainingSnapshotBytes < CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES) {
        throw filesystemError(
          "snapshot_too_large",
          "The safe teaching snapshot exceeds its total size limit."
        );
      }
      throw filesystemError(
        "file_too_large",
        "A teaching file exceeds the safe per-file snapshot limit."
      );
    }

    let openedAfter;
    let post;
    try {
      openedAfter = fileSystem.fstatSync(fd);
      post = inspectTeachingPath(fileSystem, repoRealPath, trustedTeachingRoot, relativePath);
    } catch (_) {
      throw changedFileError();
    }
    if (post === null
      || !sameFileState(opened, openedAfter)
      || !sameFileState(openedAfter, post.stats)
      || !samePathInspection(pre, post)) {
      throw changedFileError();
    }
    validateTeachingText(content);
    return content;
  } finally {
    if (fd !== null) {
      try {
        fileSystem.closeSync(fd);
      } catch (_) {
        throw filesystemError(
          "working_tree_file_changed",
          "A teaching file could not be safely closed."
        );
      }
    }
  }
}

function writeSnapshotFile(fileSystem, root, side, relativePath, content) {
  const safePath = validateTeachingPath(relativePath);
  const sideRoot = path.join(root, side);
  const target = path.resolve(sideRoot, ...safePath.split("/"));
  if (!isInsideDirectory(sideRoot, target)) {
    throw filesystemError(
      "git_diff_failed",
      "An isolated snapshot path was rejected.",
      "snapshot"
    );
  }
  fileSystem.mkdirSync(path.dirname(target), { recursive: true });
  fileSystem.writeFileSync(target, content);
}

function projectSnapshotPatch(patch) {
  return lineRecords(patch).map((record) => {
    if (!/^(?:diff --git |--- |\+\+\+ |Binary files )/.test(record)) return record;
    return record
      .replaceAll("a/a/kernel/src/", "a/kernel/src/")
      .replaceAll("b/b/kernel/src/", "b/kernel/src/");
  }).join("");
}

function createCodeDiffEngine(options = {}) {
  if (typeof options.repoDir !== "string" || !options.repoDir) {
    throw new TypeError("repoDir is required.");
  }
  const run = options.spawnSync || spawnSync;
  if (typeof run !== "function") throw new TypeError("spawnSync must be a function.");
  const fileSystem = options.fileSystem || fs;
  const makeTemporaryDirectory = options.temporaryDirectoryFactory
    || ((prefix) => fileSystem.mkdtempSync(prefix));
  const platform = options.platform || process.platform;
  const environment = createSafeGitEnvironment(
    options.processEnv || process.env,
    platform
  );
  const nullDevice = environment.GIT_CONFIG_GLOBAL;

  const invokeGit = (args, stage, invokeOptions = {}) => {
    let result;
    try {
      const workTree = invokeOptions.repositoryContext === false ? null : options.repoDir;
      result = run("git", safeGitArguments(args, nullDevice, workTree), {
        cwd: invokeOptions.cwd || options.repoDir,
        encoding: invokeOptions.encoding === undefined ? "utf8" : invokeOptions.encoding,
        env: invokeOptions.environment || environment,
        maxBuffer: invokeOptions.maxBuffer || CODE_DIFF_MAX_CAPTURE_BYTES,
        shell: false,
        windowsHide: true
      });
    } catch (_) {
      throw new CodeDiffError(
        stage === "baseline" ? "baseline_resolution_failed" : "git_diff_failed",
        stage === "baseline"
          ? "The starter baseline could not be resolved."
          : "The restricted Git diff operation failed.",
        false,
        { stage }
      );
    }
    if (result?.error) {
      throw new CodeDiffError(
        stage === "baseline" ? "baseline_resolution_failed" : "git_diff_failed",
        stage === "baseline"
          ? "The starter baseline could not be resolved."
          : "The restricted Git diff operation failed.",
        false,
        { stage }
      );
    }
    const acceptedStatuses = invokeOptions.acceptedStatuses || [0];
    if (!acceptedStatuses.includes(result?.status)) {
      throw new CodeDiffError(
        invokeOptions.unavailableCode || "git_diff_failed",
        invokeOptions.unavailableCode
          ? "The fixed local starter baseline is unavailable."
          : "The restricted Git diff operation failed.",
        false,
        { stage, exitCode: safeExitCode(result?.status) }
      );
    }
    if (invokeOptions.encoding === null) {
      return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || "");
    }
    return typeof result.stdout === "string" ? result.stdout : String(result.stdout || "");
  };

  const inspectIsolatedIndex = (repoRealPath, indexSnapshot) => {
    let cleanupRoot = null;
    try {
      const temporaryBase = fileSystem.realpathSync(os.tmpdir());
      if (isInsideDirectory(repoRealPath, temporaryBase)) {
        throw indexSnapshotError(
          "git_diff_failed",
          "The isolated index base directory is inside the trusted workspace.",
          "index_isolation"
        );
      }
      const temporaryRoot = makeTemporaryDirectory(
        path.join(temporaryBase, "os-tutor-index-")
      );
      const temporaryStats = fileSystem.lstatSync(temporaryRoot);
      const temporaryRealPath = fileSystem.realpathSync(temporaryRoot);
      const safeTemporaryRoot = temporaryStats.isDirectory()
        && !temporaryStats.isSymbolicLink()
        && isInsideDirectory(temporaryBase, temporaryRealPath)
        && !isInsideDirectory(repoRealPath, temporaryRealPath)
        && path.basename(temporaryRealPath).startsWith("os-tutor-index-");
      if (safeTemporaryRoot) cleanupRoot = temporaryRealPath;
      if (!safeTemporaryRoot) {
        throw indexSnapshotError(
          "git_diff_failed",
          "The isolated index context could not be safely created.",
          "index_isolation"
        );
      }

      const temporaryGitDir = path.join(temporaryRealPath, "gitdir");
      const temporaryIndex = path.join(temporaryRealPath, "index");
      fileSystem.mkdirSync(path.join(temporaryGitDir, "objects"), {
        recursive: true,
        mode: 0o700
      });
      fileSystem.mkdirSync(path.join(temporaryGitDir, "refs"), {
        recursive: true,
        mode: 0o700
      });
      fileSystem.writeFileSync(
        path.join(temporaryGitDir, "HEAD"),
        "ref: refs/heads/isolated\n",
        { encoding: "utf8", flag: "wx", mode: 0o600 }
      );
      fileSystem.writeFileSync(temporaryIndex, indexSnapshot, {
        flag: "wx",
        mode: 0o600
      });

      const isolatedEnvironment = {
        ...environment,
        GIT_CEILING_DIRECTORIES: temporaryRealPath,
        GIT_INDEX_FILE: temporaryIndex
      };
      return invokeGit([
        `--git-dir=${temporaryGitDir}`,
        "--bare",
        "ls-files",
        "--stage",
        "--abbrev=64",
        "-z",
        "--",
        ...CODE_DIFF_DEFAULT_SCOPE
      ], "index_metadata", {
        cwd: temporaryRealPath,
        environment: isolatedEnvironment,
        repositoryContext: false
      });
    } finally {
      if (cleanupRoot !== null) {
        try {
          fileSystem.rmSync(cleanupRoot, { recursive: true, force: true });
        } catch (_) {
          throw indexSnapshotError(
            "git_diff_failed",
            "The isolated index context could not be safely removed.",
            "index_snapshot_cleanup"
          );
        }
      }
    }
  };

  return function inspectCodeDiff(args, workspaceContext) {
    const input = validateCodeDiffInput(args);
    const context = resolveStarterContext(workspaceContext, input.lab);
    const baselineRef = context.baseline.ref;
    const baselineCommit = invokeGit(
      ["rev-parse", "--verify", `${baselineRef}^{commit}`],
      "baseline",
      { unavailableCode: "starter_baseline_unavailable" }
    ).trim();
    if (!/^[0-9a-f]{40,64}$/i.test(baselineCommit)) {
      throw new CodeDiffError(
        "baseline_resolution_failed",
        "The starter baseline did not resolve to a valid commit."
      );
    }

    let repoRealPath;
    try {
      repoRealPath = fileSystem.realpathSync(options.repoDir);
    } catch (_) {
      throw new CodeDiffError(
        "git_diff_failed",
        "The trusted workspace could not be safely resolved.",
        false,
        { stage: "snapshot" }
      );
    }

    const baselineFiles = parseBaselineTree(invokeGit([
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      baselineCommit,
      "--",
      ...input.scope
    ], "baseline_tree"));
    const headFiles = parseTreeMetadata(invokeGit([
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      "HEAD",
      "--",
      ...CODE_DIFF_DEFAULT_SCOPE
    ], "head_tree"), "head_tree");
    const indexLocation = invokeGit(
      ["rev-parse", "--git-path", "index"],
      "index_path",
      { maxBuffer: 4096 }
    );
    const indexSnapshot = readIndexFileSnapshot(
      fileSystem,
      repoRealPath,
      indexLocation,
      platform
    );
    const index = parseIndexMetadata(inspectIsolatedIndex(repoRealPath, indexSnapshot));
    const trackedPaths = [...index.entries.keys()].sort();
    if (trackedPaths.length > CODE_DIFF_MAX_SNAPSHOT_FILES) {
      throw new CodeDiffError(
        "git_diff_failed",
        "The safe teaching index contains too many files.",
        false,
        { stage: "index_metadata" }
      );
    }
    const trackedVisibleFiles = trackedPaths.filter((relativePath) => (
      index.entries.get(relativePath).some((metadata) => metadata.visiblePath !== null)
    ));
    const diffTrackedFiles = trackedVisibleFiles.filter((relativePath) => (
      pathMatchesScope(relativePath, input.scope)
    ));
    const candidatePaths = [...new Set([
      ...baselineFiles.keys(),
      ...diffTrackedFiles
    ])].sort();
    if (candidatePaths.length > CODE_DIFF_MAX_SNAPSHOT_FILES) {
      throw new CodeDiffError(
        "git_diff_failed",
        "The safe teaching snapshot contains too many files.",
        false,
        { stage: "snapshot" }
      );
    }

    const trustedTeachingRoot = resolveTrustedTeachingRoot(fileSystem, repoRealPath);

    let cleanupRoot = null;
    let patch = "";
    let patchFiles = [];
    let fileLimitOmitted = [];
    let workspaceDirty = false;
    let untrackedTeachingFiles = [];
    let untrackedTruncated = false;
    try {
      const temporaryBase = fileSystem.realpathSync(os.tmpdir());
      if (isInsideDirectory(repoRealPath, temporaryBase)) {
        throw new CodeDiffError(
          "git_diff_failed",
          "The isolated diff base directory is inside the trusted workspace.",
          false,
          { stage: "snapshot" }
        );
      }
      const temporaryRoot = makeTemporaryDirectory(
        path.join(temporaryBase, "os-tutor-code-diff-")
      );
      const temporaryStats = fileSystem.lstatSync(temporaryRoot);
      const temporaryRealPath = fileSystem.realpathSync(temporaryRoot);
      const safeTemporaryRoot = temporaryStats.isDirectory()
        && !temporaryStats.isSymbolicLink()
        && isInsideDirectory(temporaryBase, temporaryRealPath)
        && !isInsideDirectory(repoRealPath, temporaryRealPath)
        && path.basename(temporaryRealPath).startsWith("os-tutor-code-diff-");
      if (safeTemporaryRoot) cleanupRoot = temporaryRealPath;
      if (!safeTemporaryRoot) {
        throw new CodeDiffError(
          "git_diff_failed",
          "The isolated diff workspace could not be safely created.",
          false,
          { stage: "snapshot" }
        );
      }
      fileSystem.mkdirSync(path.join(temporaryRealPath, "a", "kernel", "src"), { recursive: true });
      fileSystem.mkdirSync(path.join(temporaryRealPath, "b", "kernel", "src"), { recursive: true });

      const filesystemFiles = enumerateTeachingFilesystem(fileSystem, trustedTeachingRoot);
      const trackedSet = new Set(trackedPaths);
      const untrackedPaths = [...filesystemFiles.keys()].filter((relativePath) => (
        !trackedSet.has(relativePath)
      ));
      const visibleUntrackedPaths = untrackedPaths
        .map((relativePath) => filesystemFiles.get(relativePath).visiblePath)
        .filter((relativePath) => relativePath !== null)
        .sort();
      untrackedTeachingFiles = visibleUntrackedPaths.slice(0, CODE_DIFF_MAX_UNTRACKED_FILES);
      untrackedTruncated = visibleUntrackedPaths.length > CODE_DIFF_MAX_UNTRACKED_FILES;

      let snapshotBytes = 0;
      const currentFiles = new Map();
      for (const relativePath of trackedVisibleFiles) {
        const stageZero = index.stageZero.get(relativePath);
        if (stageZero && !["100644", "100755"].includes(stageZero.mode)) {
          throw filesystemError(
            "unsafe_working_tree_file",
            "The teaching index contains a non-regular entry.",
            "index_metadata"
          );
        }
        const content = readCurrentTeachingFile(
          fileSystem,
          repoRealPath,
          trustedTeachingRoot,
          relativePath,
          CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES - snapshotBytes,
          platform
        );
        if (content === null) continue;
        snapshotBytes += content.length;
        currentFiles.set(relativePath, content);
      }

      const stagedDirty = index.hasUnmergedEntries
        || metadataMapsDiffer(headFiles, index.stageZero);
      let worktreeDirty = false;
      let indexBlobBytes = 0;
      for (const [relativePath, metadata] of index.stageZero) {
        if (!filesystemFiles.has(relativePath)) {
          worktreeDirty = true;
          continue;
        }
        if (metadata.visiblePath === null) continue;
        if (!["100644", "100755"].includes(metadata.mode)) {
          throw filesystemError(
            "unsafe_working_tree_file",
            "The teaching index contains a non-regular entry.",
            "index_metadata"
          );
        }
        const current = currentFiles.get(relativePath);
        if (!current) {
          worktreeDirty = true;
          continue;
        }
        const indexBlob = invokeGit(
          ["cat-file", "blob", metadata.objectId],
          "index_blob",
          {
            encoding: null,
            maxBuffer: CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES + 1
          }
        );
        if (indexBlob.length > CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES) {
          throw new CodeDiffError(
            "file_too_large",
            "An indexed teaching file exceeds the safe snapshot size limit.",
            false,
            { stage: "index_blob" }
          );
        }
        indexBlobBytes += indexBlob.length;
        if (indexBlobBytes > CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES) {
          throw new CodeDiffError(
            "snapshot_too_large",
            "The indexed teaching snapshot exceeds its total size limit.",
            false,
            { stage: "index_blob" }
          );
        }
        if (!current.equals(indexBlob)) worktreeDirty = true;
      }
      const untrackedDirty = untrackedPaths.length > 0;
      // Deliberately compare raw teaching bytes instead of executing repository filters.
      workspaceDirty = stagedDirty || worktreeDirty || untrackedDirty;

      const changedFiles = candidatePaths.filter((relativePath) => {
        const baseline = baselineFiles.get(relativePath);
        const current = currentFiles.get(relativePath);
        if (!baseline || !current) return Boolean(baseline) !== Boolean(current);
        return gitBlobObjectId(current, baseline.objectId.length) !== baseline.objectId;
      });
      patchFiles = changedFiles.slice(0, CODE_DIFF_MAX_FILES);
      fileLimitOmitted = changedFiles.slice(CODE_DIFF_MAX_FILES);
      for (const relativePath of patchFiles) {
        const baseline = baselineFiles.get(relativePath);
        if (baseline) {
          const content = invokeGit(
            ["cat-file", "blob", baseline.objectId],
            "baseline_blob",
            {
              encoding: null,
              maxBuffer: CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES + 1
            }
          );
          if (content.length > CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES) {
            throw new CodeDiffError(
              "file_too_large",
              "A baseline teaching file exceeds the safe snapshot size limit.",
              false,
              { stage: "baseline_blob" }
            );
          }
          snapshotBytes += content.length;
          if (snapshotBytes > CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES) {
            throw new CodeDiffError(
              "snapshot_too_large",
              "The safe teaching snapshot exceeds its total size limit.",
              false,
              { stage: "baseline_snapshot" }
            );
          }
          validateTeachingText(content, "baseline_blob");
          writeSnapshotFile(fileSystem, temporaryRealPath, "a", relativePath, content);
        }
        const current = currentFiles.get(relativePath);
        if (current) writeSnapshotFile(fileSystem, temporaryRealPath, "b", relativePath, current);
      }
      if (patchFiles.length > 0) {
        const isolatedEnvironment = {
          ...environment,
          GIT_CEILING_DIRECTORIES: temporaryRealPath
        };
        patch = invokeGit([
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-textconv",
          "--no-color",
          "--no-renames",
          `--unified=${input.contextLines}`,
          "--",
          "a",
          "b"
        ], "isolated_diff", {
          cwd: temporaryRealPath,
          environment: isolatedEnvironment,
          repositoryContext: false,
          acceptedStatuses: [0, 1]
        });
        patch = redactSensitiveText(projectSnapshotPatch(patch));
      }
    } finally {
      if (cleanupRoot !== null) {
        try {
          fileSystem.rmSync(cleanupRoot, { recursive: true, force: true });
        } catch (_) {
          throw new CodeDiffError(
            "git_diff_failed",
            "The isolated diff workspace could not be safely removed.",
            false,
            { stage: "snapshot_cleanup" }
          );
        }
      }
    }
    const projected = projectPatch(patch, patchFiles, input.maxLines);
    const allOmitted = [...new Set([
      ...projected.omittedFiles,
      ...fileLimitOmitted
    ])].sort();

    return {
      schemaVersion: CODE_DIFF_SCHEMA_VERSION,
      lab: context.lab,
      baseline: {
        ref: baselineRef,
        commit: baselineCommit
      },
      student: {
        branch: context.student.branch,
        commit: context.student.commit,
        workspaceDirty
      },
      scope: input.scope,
      files: projected.files,
      untrackedTeachingFiles,
      untrackedIncluded: false,
      untrackedTruncated,
      contextLines: input.contextLines,
      returnedLines: projected.returnedLines,
      maxLines: input.maxLines,
      maxBytes: CODE_DIFF_MAX_BYTES,
      truncated: projected.truncated || fileLimitOmitted.length > 0,
      omittedFiles: allOmitted.slice(0, CODE_DIFF_MAX_OMITTED_FILES),
      omittedFilesTruncated: projected.omittedFilesTruncated
        || allOmitted.length > CODE_DIFF_MAX_OMITTED_FILES,
      diff: projected.diff
    };
  };
}

module.exports = {
  CODE_DIFF_DEFAULT_CONTEXT_LINES,
  CODE_DIFF_DEFAULT_MAX_LINES,
  CODE_DIFF_DEFAULT_SCOPE,
  CODE_DIFF_MAX_BYTES,
  CODE_DIFF_MAX_CAPTURE_BYTES,
  CODE_DIFF_MAX_CONTEXT_LINES,
  CODE_DIFF_MAX_FILES,
  CODE_DIFF_MAX_INDEX_BYTES,
  CODE_DIFF_MAX_LINES,
  CODE_DIFF_MAX_OMITTED_FILES,
  CODE_DIFF_MAX_PATHS,
  CODE_DIFF_MAX_SNAPSHOT_FILE_BYTES,
  CODE_DIFF_MAX_SNAPSHOT_FILES,
  CODE_DIFF_MAX_SNAPSHOT_TOTAL_BYTES,
  CODE_DIFF_MAX_UNTRACKED_FILES,
  CODE_DIFF_SCHEMA_VERSION,
  CodeDiffError,
  STARTER_BASELINES,
  createSafeGitEnvironment,
  createCodeDiffEngine,
  isInsideDirectory,
  projectPatch,
  resolveStarterContext,
  sanitizedGitEnvironment,
  validateCodeDiffInput,
  validateTeachingPath
};
