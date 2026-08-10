"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");
const {
  TOOL_CONTRACT_VERSION,
  protectedContextOverride,
  resolveTeachingContext,
  validateInvocationContext,
  validateReadCodePath,
  validateRequestId
} = require("./policy");

const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const READ_CODE_DEFAULT_LINES = 200;
const READ_CODE_MAX_LINES = 400;
const READ_CODE_DEFAULT_BYTES = 32 * 1024;
const READ_CODE_MAX_BYTES = 64 * 1024;
const READ_CODE_MAX_FILE_BYTES = 256 * 1024;
const READ_CODE_INPUT_FIELDS = new Set(["path", "startLine", "endLine", "maxBytes"]);

class SafeToolError extends Error {
  constructor(code, message, retryable = false, details = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function safeError(error, fallback = {}) {
  if (error instanceof SafeToolError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details
    };
  }
  if (error && typeof error === "object"
    && typeof error.code === "string"
    && /^[a-z][a-z0-9_]{0,79}$/.test(error.code)
    && typeof error.message === "string") {
    return {
      code: error.code,
      message: error.message.slice(0, 500),
      retryable: Boolean(error.retryable),
      details: error.details && typeof error.details === "object" && !Array.isArray(error.details)
        ? error.details
        : {}
    };
  }
  return {
    code: fallback.code || "tool_execution_failed",
    message: fallback.message || "The tool could not complete the request.",
    retryable: Boolean(fallback.retryable),
    details: fallback.details || {}
  };
}

function createToolResult({ tool, ok, data, error, meta }) {
  return {
    contractVersion: TOOL_CONTRACT_VERSION,
    tool,
    ok,
    data: ok ? data : null,
    error: ok ? null : error,
    meta
  };
}

function createToolSuccess(tool, data, meta) {
  return createToolResult({ tool, ok: true, data, error: null, meta });
}

function createToolFailure(tool, error, meta) {
  return createToolResult({ tool, ok: false, data: null, error: safeError(error), meta });
}

function parsePorcelainStatus(output) {
  const workspace = {
    clean: true,
    stagedFiles: 0,
    modifiedFiles: 0,
    untrackedFiles: 0,
    conflictedFiles: 0
  };
  const entries = String(output || "").split("\0");

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    if (code === "??") {
      workspace.untrackedFiles += 1;
      continue;
    }
    if (code === "!!") continue;
    if (CONFLICT_CODES.has(code)) {
      workspace.conflictedFiles += 1;
    } else {
      if (code[0] && code[0] !== " ") workspace.stagedFiles += 1;
      if (code[1] && code[1] !== " ") workspace.modifiedFiles += 1;
    }
    if (["R", "C"].includes(code[0]) || ["R", "C"].includes(code[1])) index += 1;
  }

  workspace.clean = workspace.stagedFiles === 0
    && workspace.modifiedFiles === 0
    && workspace.untrackedFiles === 0
    && workspace.conflictedFiles === 0;
  return workspace;
}

function readGitWorkspaceStatus(repoDir, options = {}) {
  const run = options.spawnSync || spawnSync;
  const result = run("git", [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignore-submodules=all"
  ], {
    cwd: repoDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw new SafeToolError(
      "workspace_status_failed",
      "The Git workspace status could not be read.",
      true
    );
  }
  return parsePorcelainStatus(result.stdout);
}

function normalizeWorkspaceSnapshot(value = {}) {
  const count = (candidate) => (
    Number.isInteger(candidate) && candidate >= 0 ? candidate : 0
  );
  const workspace = {
    clean: false,
    stagedFiles: count(value.stagedFiles),
    modifiedFiles: count(value.modifiedFiles),
    untrackedFiles: count(value.untrackedFiles),
    conflictedFiles: count(value.conflictedFiles)
  };
  workspace.clean = workspace.stagedFiles === 0
    && workspace.modifiedFiles === 0
    && workspace.untrackedFiles === 0
    && workspace.conflictedFiles === 0;
  return workspace;
}

function isoTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const milliseconds = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function normalizeTaskSnapshot(value = {}) {
  const running = Boolean(value.running);
  return {
    running,
    kind: running && typeof value.kind === "string" ? value.kind.slice(0, 40) : null,
    phase: running && typeof value.phase === "string" && value.phase
      ? value.phase.slice(0, 40)
      : "idle",
    runId: running && typeof value.runId === "string" ? value.runId.slice(0, 120) : null,
    startedAt: running ? isoTime(value.startedAt) : null,
    canStop: running && Boolean(value.canStop)
  };
}

function defaultRequestId() {
  return `tool-${crypto.randomUUID()}`;
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isAllowedRealReadPath(repoRealPath, relativePath, realFilePath) {
  if (relativePath === "Cargo.toml" || relativePath === "kernel/Cargo.toml") {
    return realFilePath === path.join(repoRealPath, ...relativePath.split("/"));
  }

  const allowedRoot = relativePath.startsWith("kernel/src/")
    ? path.join(repoRealPath, "kernel", "src")
    : path.join(repoRealPath, "docs", "labs");
  return isPathInside(allowedRoot, realFilePath) && realFilePath !== allowedRoot;
}

function splitTextLineRecords(text) {
  if (text.length === 0) return [];

  const records = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n" && text[index] !== "\r") continue;
    if (text[index] === "\r" && text[index + 1] === "\n") index += 1;
    records.push(text.slice(start, index + 1));
    start = index + 1;
  }
  if (start < text.length) records.push(text.slice(start));
  return records;
}

function utf8Prefix(text, maxBytes) {
  let usedBytes = 0;
  let endOffset = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes > maxBytes) break;
    usedBytes += characterBytes;
    endOffset += character.length;
  }
  return text.slice(0, endOffset);
}

function selectTextLines(records, startLine, requestedEndLine, maxBytes) {
  const selected = records.slice(startLine - 1, requestedEndLine);
  const parts = [];
  let returnedBytes = 0;
  let returnedLineCount = 0;
  let byteTruncated = false;

  for (const record of selected) {
    const recordBytes = Buffer.byteLength(record, "utf8");
    if (returnedBytes + recordBytes <= maxBytes) {
      parts.push(record);
      returnedBytes += recordBytes;
      returnedLineCount += 1;
      continue;
    }

    if (parts.length === 0) {
      const prefix = utf8Prefix(record, maxBytes);
      if (prefix) {
        parts.push(prefix);
        returnedBytes = Buffer.byteLength(prefix, "utf8");
        returnedLineCount = 1;
      }
    }
    byteTruncated = true;
    break;
  }

  return {
    content: parts.join(""),
    returnedBytes,
    returnedLineCount,
    byteTruncated: byteTruncated || returnedLineCount < selected.length
  };
}

function decodeUtf8Text(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new SafeToolError("binary_file", "The requested file is not valid UTF-8 text.");
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new SafeToolError("binary_file", "The requested file contains binary data.");
  }
  return text;
}

function validateReadCodeInput(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new SafeToolError("invalid_tool_input", "read_code input must be an object.");
  }

  const protectedField = protectedContextOverride(args);
  if (protectedField) {
    throw new SafeToolError(
      "context_override_forbidden",
      "Tool input cannot override the real branch or commit.",
      false,
      { field: protectedField }
    );
  }
  const unknownField = Object.keys(args).find((field) => !READ_CODE_INPUT_FIELDS.has(field));
  if (unknownField) {
    throw new SafeToolError(
      "invalid_tool_input",
      "read_code input contains an unknown field.",
      false,
      { field: unknownField }
    );
  }

  const pathCheck = validateReadCodePath(args.path);
  if (!pathCheck.ok) throw pathCheck.error;

  const startLine = args.startLine === undefined ? 1 : args.startLine;
  const hasEndLine = args.endLine !== undefined;
  const endLine = hasEndLine ? args.endLine : startLine + READ_CODE_DEFAULT_LINES - 1;
  if (!Number.isSafeInteger(startLine)
    || !Number.isSafeInteger(endLine)
    || startLine < 1
    || endLine < startLine
    || endLine - startLine + 1 > READ_CODE_MAX_LINES) {
    throw new SafeToolError(
      "invalid_line_range",
      `Line ranges must contain between 1 and ${READ_CODE_MAX_LINES} lines.`
    );
  }

  const maxBytes = args.maxBytes === undefined ? READ_CODE_DEFAULT_BYTES : args.maxBytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > READ_CODE_MAX_BYTES) {
    throw new SafeToolError(
      "invalid_tool_input",
      `maxBytes must be an integer between 1 and ${READ_CODE_MAX_BYTES}.`,
      false,
      { field: "maxBytes" }
    );
  }

  return {
    path: pathCheck.value,
    startLine,
    endLine,
    hasEndLine,
    maxBytes
  };
}

function createGetContextTool(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (typeof options.repoDir !== "string" || !options.repoDir) {
    throw new TypeError("repoDir is required.");
  }

  const readWorkspaceStatus = options.readWorkspaceStatus
    || (() => readGitWorkspaceStatus(options.repoDir));
  const getTaskSnapshot = options.getTaskSnapshot || (() => ({ running: false }));
  const makeRequestId = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;
  const target = String(options.target || "riscv64gc-unknown-none-elf");

  return function getContext(args = {}, invocationContext = {}) {
    const tool = "get_context";
    let actual = { branch: "unknown", commit: "unknown" };
    let requestId = makeRequestId();
    const meta = () => ({
      requestId,
      branch: actual.branch,
      commit: actual.commit,
      generatedAt: new Date(now()).toISOString()
    });

    try {
      const rawContext = options.readWorkspaceContext();
      if (!rawContext || typeof rawContext !== "object") {
        throw new SafeToolError("context_unavailable", "The workspace context is unavailable.", true);
      }
      const teaching = resolveTeachingContext(rawContext.branch);
      actual = {
        ...teaching,
        commit: typeof rawContext.commit === "string" && rawContext.commit
          ? rawContext.commit
          : "unknown"
      };

      const requestIdCheck = validateRequestId(invocationContext?.requestId);
      if (requestIdCheck.ok && requestIdCheck.value) requestId = requestIdCheck.value;
      if (!requestIdCheck.ok) return createToolFailure(tool, requestIdCheck.error, meta());

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) return createToolFailure(tool, invocationCheck.error, meta());

      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new SafeToolError("invalid_tool_input", "get_context input must be an empty object.");
      }
      const protectedField = protectedContextOverride(args);
      if (protectedField) {
        throw new SafeToolError(
          "context_override_forbidden",
          "Tool input cannot override the real branch or commit.",
          false,
          { field: protectedField }
        );
      }
      if (Object.keys(args).length !== 0) {
        throw new SafeToolError("invalid_tool_input", "get_context input must be an empty object.");
      }

      const expectedBranch = invocationCheck.value.expectedBranch;
      const expectedCommit = invocationCheck.value.expectedCommit;
      if ((expectedBranch && expectedBranch !== actual.branch)
        || (expectedCommit && expectedCommit !== actual.commit)) {
        throw new SafeToolError(
          "context_changed",
          "The workspace branch or commit changed before the tool executed.",
          true,
          {
            expectedBranch: expectedBranch || null,
            expectedCommit: expectedCommit || null,
            actualBranch: actual.branch,
            actualCommit: actual.commit
          }
        );
      }

      const workspace = normalizeWorkspaceSnapshot(readWorkspaceStatus());
      const task = normalizeTaskSnapshot(getTaskSnapshot());
      return createToolSuccess(tool, {
        branch: actual.branch,
        commit: actual.commit,
        lab: actual.lab,
        stageIndex: actual.stageIndex,
        variant: actual.variant,
        variantLabel: actual.variantLabel,
        target,
        expectedBranch: actual.expectedBranch,
        workspace,
        task
      }, meta());
    } catch (error) {
      return createToolFailure(tool, error, meta());
    }
  };
}

function createReadCodeTool(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (typeof options.repoDir !== "string" || !options.repoDir) {
    throw new TypeError("repoDir is required.");
  }

  const fileSystem = options.fileSystem || fs;
  const makeRequestId = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;

  return function readCode(args = {}, invocationContext = {}) {
    const tool = "read_code";
    let actual = { branch: "unknown", commit: "unknown" };
    let requestId = makeRequestId();
    const meta = () => ({
      requestId,
      branch: actual.branch,
      commit: actual.commit,
      generatedAt: new Date(now()).toISOString()
    });

    try {
      const rawContext = options.readWorkspaceContext();
      if (!rawContext || typeof rawContext !== "object") {
        throw new SafeToolError("context_unavailable", "The workspace context is unavailable.", true);
      }
      actual = {
        branch: typeof rawContext.branch === "string" && rawContext.branch
          ? rawContext.branch
          : "unknown",
        commit: typeof rawContext.commit === "string" && rawContext.commit
          ? rawContext.commit
          : "unknown"
      };

      const requestIdCheck = validateRequestId(invocationContext?.requestId);
      if (requestIdCheck.ok && requestIdCheck.value) requestId = requestIdCheck.value;
      if (!requestIdCheck.ok) return createToolFailure(tool, requestIdCheck.error, meta());

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) return createToolFailure(tool, invocationCheck.error, meta());

      const expectedBranch = invocationCheck.value.expectedBranch;
      const expectedCommit = invocationCheck.value.expectedCommit;
      if ((expectedBranch && expectedBranch !== actual.branch)
        || (expectedCommit && expectedCommit !== actual.commit)) {
        throw new SafeToolError(
          "context_changed",
          "The workspace branch or commit changed before the tool executed.",
          true,
          {
            expectedBranch: expectedBranch || null,
            expectedCommit: expectedCommit || null,
            actualBranch: actual.branch,
            actualCommit: actual.commit
          }
        );
      }

      const input = validateReadCodeInput(args);
      let repoRealPath;
      let realFilePath;
      try {
        repoRealPath = fileSystem.realpathSync(options.repoDir);
        const candidatePath = path.resolve(options.repoDir, ...input.path.split("/"));
        realFilePath = fileSystem.realpathSync(candidatePath);
      } catch (error) {
        if (error && ["ENOENT", "ENOTDIR"].includes(error.code)) {
          throw new SafeToolError(
            "file_not_found",
            "The requested file does not exist.",
            false,
            { path: input.path }
          );
        }
        throw new SafeToolError("forbidden_path", "The requested path could not be safely resolved.");
      }

      if (!isAllowedRealReadPath(repoRealPath, input.path, realFilePath)) {
        throw new SafeToolError(
          "forbidden_path",
          "The resolved file is outside the read_code whitelist.",
          false,
          { path: input.path }
        );
      }

      let stats;
      try {
        stats = fileSystem.statSync(realFilePath);
      } catch (error) {
        if (error && ["ENOENT", "ENOTDIR"].includes(error.code)) {
          throw new SafeToolError(
            "file_not_found",
            "The requested file does not exist.",
            false,
            { path: input.path }
          );
        }
        throw new SafeToolError("forbidden_path", "The requested file could not be safely inspected.");
      }
      if (!stats.isFile()) {
        throw new SafeToolError(
          "not_a_file",
          "The requested path is not a regular file.",
          false,
          { path: input.path }
        );
      }
      if (stats.size > READ_CODE_MAX_FILE_BYTES) {
        throw new SafeToolError(
          "file_too_large",
          "The requested source file exceeds the read_code file-size limit.",
          false,
          {
            path: input.path,
            fileSizeBytes: stats.size,
            maxFileSizeBytes: READ_CODE_MAX_FILE_BYTES
          }
        );
      }

      const buffer = fileSystem.readFileSync(realFilePath);
      if (!Buffer.isBuffer(buffer) || buffer.length > READ_CODE_MAX_FILE_BYTES) {
        throw new SafeToolError(
          "file_too_large",
          "The requested source file exceeds the read_code file-size limit.",
          false,
          {
            path: input.path,
            fileSizeBytes: Buffer.isBuffer(buffer) ? buffer.length : null,
            maxFileSizeBytes: READ_CODE_MAX_FILE_BYTES
          }
        );
      }

      const text = decodeUtf8Text(buffer);
      const records = splitTextLineRecords(text);
      if (records.length > 0 && input.startLine > records.length) {
        throw new SafeToolError(
          "invalid_line_range",
          "startLine is beyond the end of the requested file.",
          false,
          { startLine: input.startLine, totalLines: records.length }
        );
      }

      const requestedEndLine = Math.min(input.endLine, records.length);
      const selection = selectTextLines(
        records,
        input.startLine,
        requestedEndLine,
        input.maxBytes
      );
      const lineLimitTruncated = !input.hasEndLine && input.endLine < records.length;
      const endLine = selection.returnedLineCount > 0
        ? input.startLine + selection.returnedLineCount - 1
        : Math.min(input.startLine - 1, records.length);

      return createToolSuccess(tool, {
        path: input.path,
        encoding: "utf-8",
        fileSizeBytes: buffer.length,
        contentSha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        startLine: input.startLine,
        endLine,
        totalLines: records.length,
        returnedBytes: selection.returnedBytes,
        truncated: lineLimitTruncated || selection.byteTruncated,
        content: selection.content
      }, meta());
    } catch (error) {
      return createToolFailure(tool, error, meta());
    }
  };
}

module.exports = {
  READ_CODE_DEFAULT_BYTES,
  READ_CODE_DEFAULT_LINES,
  READ_CODE_MAX_BYTES,
  READ_CODE_MAX_FILE_BYTES,
  READ_CODE_MAX_LINES,
  SafeToolError,
  createGetContextTool,
  createReadCodeTool,
  createToolFailure,
  createToolResult,
  createToolSuccess,
  normalizeTaskSnapshot,
  normalizeWorkspaceSnapshot,
  parsePorcelainStatus,
  readGitWorkspaceStatus
};
