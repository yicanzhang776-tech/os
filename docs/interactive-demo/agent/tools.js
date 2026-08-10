"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  TOOL_CONTRACT_VERSION,
  protectedContextOverride,
  resolveTeachingContext,
  validateInvocationContext,
  validateRequestId
} = require("./policy");

const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

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

module.exports = {
  SafeToolError,
  createGetContextTool,
  createToolFailure,
  createToolResult,
  createToolSuccess,
  normalizeTaskSnapshot,
  normalizeWorkspaceSnapshot,
  parsePorcelainStatus,
  readGitWorkspaceStatus
};
