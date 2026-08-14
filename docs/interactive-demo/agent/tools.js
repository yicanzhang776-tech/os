"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  EVENT_PROTOCOL,
  STAGE_INDEX,
  normalizeTeachingEvent
} = require("../protocol");
const { diagnose } = require("../diagnostics");
const { createRunRecord } = require("../run-history");
const { CodeDiffError, createCodeDiffEngine } = require("./code-diff");
const { classifySafeUtf8Text, redactSensitiveText } = require("./safe-text");
const { TEST_REGISTRY } = require("./test-registry");
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
const GET_QEMU_EVENTS_DEFAULT_LIMIT = 50;
const GET_QEMU_EVENTS_MAX_LIMIT = 100;
const GET_QEMU_EVENTS_MAX_TEXT = 500;
const GET_QEMU_EVENTS_INPUT_FIELDS = new Set([
  "runId",
  "lab",
  "status",
  "sequenceStart",
  "sequenceEnd",
  "limit",
  "includeRaw"
]);
const GET_RUN_RESULT_SCHEMA_VERSION = "os-tutor.run-result/v1";
const GET_RUN_RESULT_INPUT_FIELDS = new Set(["runId", "lab", "includeDiagnostics"]);
const GET_RUN_RESULT_MAX_DIAGNOSTICS = 5;
const GET_RUN_RESULT_MAX_EVIDENCE_SEQUENCES = 10;
const GET_RUN_RESULT_BUILD_STATUSES = new Set([
  "not-started",
  "running",
  "success",
  "failure",
  "stopped",
  "timeout"
]);
const GET_RUN_RESULT_QEMU_STATUSES = new Set([
  "not-started",
  "running",
  "finished",
  "failure",
  "timeout",
  "stopped"
]);
const GET_RUN_RESULT_STORED_FINAL_RESULTS = new Set([
  "pass",
  "todo",
  "fail",
  "timeout",
  "finished",
  "stopped",
  "build-failure",
  "qemu-start-failure",
  "qemu-failure",
  "error"
]);
const RUN_TEST_INPUT_FIELDS = new Set(["testId", "lab"]);
const RUN_TEST_EXECUTION_FIELDS = new Set([
  "command",
  "args",
  "cwd",
  "env",
  "shell",
  "timeout",
  "target",
  "branch",
  "ref",
  "commit",
  "makeTarget",
  "cargoTarget",
  "script",
  "path",
  "executable",
  "marker",
  "mode",
  "log"
]);
const RUN_TEST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RUN_TEST_LAB_PATTERN = /^lab[1-7]$/;
const SAFE_PREFLIGHT_COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;
const SAFE_POLICY_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,79}$/;
const CODE_DIFF_ERROR_DEFINITIONS = Object.freeze({
  baseline_resolution_failed: Object.freeze({
    message: "The starter baseline could not be resolved."
  }),
  binary_file: Object.freeze({ message: "A teaching file contains binary data." }),
  branch_not_allowed: Object.freeze({
    message: "get_code_diff requires a registered starter teaching branch."
  }),
  context_unavailable: Object.freeze({
    message: "The workspace context is unavailable.",
    retryable: true
  }),
  file_too_large: Object.freeze({ message: "A teaching file exceeds the safe size limit." }),
  git_diff_failed: Object.freeze({ message: "The restricted Git diff operation failed." }),
  index_file_changed: Object.freeze({
    message: "The repository index changed while it was being inspected."
  }),
  index_file_too_large: Object.freeze({
    message: "The repository index exceeds the safe size limit."
  }),
  invalid_context_lines: Object.freeze({ message: "contextLines is outside the safe range." }),
  invalid_max_lines: Object.freeze({ message: "maxLines is outside the safe range." }),
  invalid_tool_input: Object.freeze({ message: "get_code_diff input is invalid." }),
  invalid_utf8: Object.freeze({ message: "A teaching file is not valid UTF-8 text." }),
  lab_mismatch: Object.freeze({
    message: "The requested lab does not match the trusted workspace context."
  }),
  path_not_allowed: Object.freeze({ message: "A requested teaching path is not allowed." }),
  snapshot_too_large: Object.freeze({
    message: "The teaching snapshot exceeds the safe size limit."
  }),
  solution_diff_forbidden: Object.freeze({
    message: "Solution and complete branches cannot be compared to starter baselines."
  }),
  starter_baseline_unavailable: Object.freeze({
    message: "The fixed local starter baseline is unavailable."
  }),
  too_many_paths: Object.freeze({ message: "Too many teaching paths were requested." }),
  too_many_working_tree_files: Object.freeze({
    message: "The teaching workspace contains too many candidate files."
  }),
  unknown_lab: Object.freeze({ message: "The requested lab is not registered." }),
  unsafe_baseline_entry: Object.freeze({
    message: "The starter baseline contains an unsafe teaching entry."
  }),
  unsafe_index_file: Object.freeze({
    message: "The repository index could not be safely inspected."
  }),
  unsafe_working_tree_file: Object.freeze({
    message: "A teaching workspace file could not be safely inspected."
  }),
  working_tree_file_changed: Object.freeze({
    message: "A teaching workspace file changed while it was being inspected."
  })
});
const CODE_DIFF_SAFE_STAGES = new Set([
  "baseline",
  "baseline_blob",
  "baseline_snapshot",
  "baseline_tree",
  "current_snapshot",
  "filesystem_walk",
  "head_tree",
  "index_blob",
  "index_isolation",
  "index_metadata",
  "index_path",
  "index_snapshot",
  "index_snapshot_cleanup",
  "isolated_diff",
  "patch",
  "projection",
  "snapshot",
  "snapshot_cleanup",
  "utf8"
]);

const trustedSafeToolErrors = new WeakSet();

class SafeToolError extends Error {
  constructor(code, message, retryable = false, details = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    trustedSafeToolErrors.add(this);
  }
}

function safeError(error, fallback = {}) {
  if (error && trustedSafeToolErrors.has(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details
    };
  }
  return {
    code: fallback.code || "tool_execution_failed",
    message: fallback.message || "The tool could not complete the request.",
    retryable: Boolean(fallback.retryable),
    details: fallback.details || {}
  };
}

function requestIdPolicyError(error) {
  if (!error || error.code !== "invalid_request_id") return null;
  return new SafeToolError(
    "invalid_request_id",
    "requestId must contain only safe identifier characters and be at most 80 characters."
  );
}

function invocationContextPolicyError(error) {
  if (!error || error.code !== "invalid_invocation_context") return null;
  const field = error.details && ["expectedBranch", "expectedCommit"].includes(error.details.field)
    ? error.details.field
    : null;
  return new SafeToolError(
    "invalid_invocation_context",
    field ? `${field} must be a non-empty plain string.` : "invocationContext must be an object.",
    false,
    field ? { field } : {}
  );
}

function readCodePathPolicyError(error) {
  const definitions = {
    absolute_path_forbidden: "Absolute paths are not allowed.",
    forbidden_extension: "The requested file extension is not allowed.",
    forbidden_path: "The requested path is protected or outside the read_code whitelist.",
    invalid_path: "path must be a safe repository-relative POSIX path.",
    path_traversal: "Path traversal is not allowed.",
    solution_content_forbidden: "Solution and teacher-only content cannot be read by this tool."
  };
  const message = error && definitions[error.code];
  return message ? new SafeToolError(error.code, message) : null;
}

function safeCodeDiffDetails(code, details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const safe = {};
  if (code === "invalid_tool_input"
    && typeof details.field === "string"
    && SAFE_POLICY_FIELD_PATTERN.test(details.field)) {
    safe.field = details.field;
  }
  if (code === "path_not_allowed"
    && Number.isSafeInteger(details.index)
    && details.index >= 0
    && details.index < 100) {
    safe.index = details.index;
  }
  if (code === "lab_mismatch") {
    if (typeof details.requestedLab === "string" && RUN_TEST_LAB_PATTERN.test(details.requestedLab)) {
      safe.requestedLab = details.requestedLab;
    }
    if (typeof details.actualLab === "string" && RUN_TEST_LAB_PATTERN.test(details.actualLab)) {
      safe.actualLab = details.actualLab;
    }
  }
  if (typeof details.stage === "string" && CODE_DIFF_SAFE_STAGES.has(details.stage)) {
    safe.stage = details.stage;
  }
  if (Number.isSafeInteger(details.exitCode)
    && details.exitCode >= -1
    && details.exitCode <= 255) {
    safe.exitCode = details.exitCode;
  }
  return safe;
}

function localCodeDiffError(error, fromLocalEngine) {
  if (!fromLocalEngine || !(error instanceof CodeDiffError)) return null;
  const definition = CODE_DIFF_ERROR_DEFINITIONS[error.code];
  if (!definition) return null;
  return new SafeToolError(
    error.code,
    definition.message,
    definition.retryable === true,
    safeCodeDiffDetails(error.code, error.details)
  );
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
  const result = classifySafeUtf8Text(buffer);
  if (!result.ok) {
    throw new SafeToolError("binary_file", result.message);
  }
  return result.text;
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
  if (!pathCheck.ok) {
    throw readCodePathPolicyError(pathCheck.error)
      || new SafeToolError("tool_execution_failed", "The tool could not complete the request.");
  }

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

function validEventStatus(status) {
  if (typeof status !== "string") return false;
  const normalized = normalizeTeachingEvent({
    lab: "p0",
    step: "status-filter",
    status,
    source: "lifecycle"
  });
  return Boolean(normalized && normalized.status === status);
}

function validateGetQemuEventsInput(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new SafeToolError("invalid_tool_input", "get_qemu_events input must be an object.");
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
  const unknownField = Object.keys(args)
    .find((field) => !GET_QEMU_EVENTS_INPUT_FIELDS.has(field));
  if (unknownField) {
    throw new SafeToolError(
      "invalid_tool_input",
      "get_qemu_events input contains an unknown field.",
      false,
      { field: unknownField }
    );
  }

  let runId = null;
  if (args.runId !== undefined) {
    const runIdCheck = validateRequestId(args.runId);
    if (!runIdCheck.ok || !runIdCheck.value) {
      throw new SafeToolError(
        "invalid_run_id",
        "runId must contain only safe identifier characters and be at most 80 characters."
      );
    }
    runId = runIdCheck.value;
  }

  const lab = args.lab === undefined ? null : args.lab;
  if (args.lab !== undefined
    && (typeof lab !== "string" || !Object.hasOwn(STAGE_INDEX, lab))) {
    throw new SafeToolError(
      "invalid_lab",
      "lab must be one of p0 or lab1 through lab7."
    );
  }

  const status = args.status === undefined ? null : args.status;
  if (args.status !== undefined && !validEventStatus(status)) {
    throw new SafeToolError(
      "invalid_status",
      "status must be a valid os-demo.event/v1 status."
    );
  }

  const sequenceStart = args.sequenceStart === undefined ? null : args.sequenceStart;
  const sequenceEnd = args.sequenceEnd === undefined ? null : args.sequenceEnd;
  if ((args.sequenceStart !== undefined
      && (!Number.isSafeInteger(sequenceStart) || sequenceStart < 0))
    || (args.sequenceEnd !== undefined
      && (!Number.isSafeInteger(sequenceEnd) || sequenceEnd < 0))
    || (sequenceStart !== null && sequenceEnd !== null && sequenceStart > sequenceEnd)) {
    throw new SafeToolError(
      "invalid_sequence_range",
      "sequenceStart and sequenceEnd must be non-negative safe integers with start <= end."
    );
  }

  const limit = args.limit === undefined ? GET_QEMU_EVENTS_DEFAULT_LIMIT : args.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > GET_QEMU_EVENTS_MAX_LIMIT) {
    throw new SafeToolError(
      "invalid_limit",
      `limit must be an integer between 1 and ${GET_QEMU_EVENTS_MAX_LIMIT}.`
    );
  }

  const includeRaw = args.includeRaw === undefined ? false : args.includeRaw;
  if (typeof includeRaw !== "boolean") {
    throw new SafeToolError(
      "invalid_tool_input",
      "includeRaw must be a boolean.",
      false,
      { field: "includeRaw" }
    );
  }

  return {
    runId,
    lab,
    status,
    sequenceStart,
    sequenceEnd,
    limit,
    includeRaw
  };
}

function redactStoredEventText(value) {
  const redacted = redactSensitiveText(String(value || "").slice(0, GET_QEMU_EVENTS_MAX_TEXT));
  return redacted.slice(0, GET_QEMU_EVENTS_MAX_TEXT);
}

function safeStoredQemuEvent(event, selectedRunId, includeRaw) {
  if (!event || typeof event !== "object" || event.protocol !== EVENT_PROTOCOL) return null;
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) return null;
  const normalized = normalizeTeachingEvent(event);
  if (!normalized) return null;

  const safeEvent = {
    protocol: EVENT_PROTOCOL,
    lab: normalized.lab,
    step: normalized.step,
    status: normalized.status,
    detail: redactStoredEventText(normalized.detail),
    source: normalized.source,
    runId: selectedRunId,
    sequence: event.sequence,
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : null
  };
  if (includeRaw && typeof event.raw === "string") {
    safeEvent.raw = redactStoredEventText(event.raw);
  }
  return safeEvent;
}

function validateGetRunResultInput(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new SafeToolError("invalid_tool_input", "get_run_result input must be an object.");
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
  const unknownField = Object.keys(args)
    .find((field) => !GET_RUN_RESULT_INPUT_FIELDS.has(field));
  if (unknownField) {
    throw new SafeToolError(
      "invalid_tool_input",
      "get_run_result input contains an unknown field.",
      false,
      { field: unknownField }
    );
  }

  let runId = null;
  if (args.runId !== undefined) {
    const runIdCheck = validateRequestId(args.runId);
    if (!runIdCheck.ok || !runIdCheck.value) {
      throw new SafeToolError(
        "invalid_run_id",
        "runId must contain only safe identifier characters and be at most 80 characters."
      );
    }
    runId = runIdCheck.value;
  }

  const lab = args.lab === undefined ? null : args.lab;
  if (args.lab !== undefined
    && (typeof lab !== "string" || !Object.hasOwn(STAGE_INDEX, lab))) {
    throw new SafeToolError("invalid_lab", "lab must be one of p0 or lab1 through lab7.");
  }

  const includeDiagnostics = args.includeDiagnostics === undefined
    ? true
    : args.includeDiagnostics;
  if (typeof includeDiagnostics !== "boolean") {
    throw new SafeToolError(
      "invalid_include_diagnostics",
      "includeDiagnostics must be a boolean."
    );
  }

  return { runId, lab, includeDiagnostics };
}

function cloneToolSnapshot(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}

function plainBoundedString(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function incompleteRunRecord(field) {
  throw new SafeToolError(
    "incomplete_run_record",
    "The completed run record is missing required lifecycle data.",
    false,
    { field }
  );
}

function validateCompletedRunRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return incompleteRunRecord("record");
  }

  const runIdCheck = validateRequestId(value.runId);
  if (!runIdCheck.ok || !runIdCheck.value) incompleteRunRecord("runId");
  if (!plainBoundedString(value.branch, 200)) incompleteRunRecord("branch");
  if (!plainBoundedString(value.commit, 200)) incompleteRunRecord("commit");
  if (typeof value.lab !== "string" || !Object.hasOwn(STAGE_INDEX, value.lab)) {
    incompleteRunRecord("lab");
  }
  if (!plainBoundedString(value.variant, 80)) incompleteRunRecord("variant");
  if (!plainBoundedString(value.target, 200)) incompleteRunRecord("target");

  for (const [field, statuses] of [
    ["build", GET_RUN_RESULT_BUILD_STATUSES],
    ["qemu", GET_RUN_RESULT_QEMU_STATUSES]
  ]) {
    const phase = value[field];
    if (!phase || typeof phase !== "object" || Array.isArray(phase)) {
      incompleteRunRecord(field);
    }
    if (!statuses.has(phase.status)) incompleteRunRecord(`${field}.status`);
    if (phase.exitCode !== null && !Number.isInteger(phase.exitCode)) {
      incompleteRunRecord(`${field}.exitCode`);
    }
  }

  if (!GET_RUN_RESULT_STORED_FINAL_RESULTS.has(value.finalResult)) {
    incompleteRunRecord("finalResult");
  }
  if (!Number.isFinite(value.startedAt)) incompleteRunRecord("startedAt");
  if (!Number.isFinite(value.endedAt) || value.endedAt < value.startedAt) {
    incompleteRunRecord("endedAt");
  }
  if (!Number.isFinite(value.durationMs)
    || value.durationMs < 0
    || value.durationMs !== value.endedAt - value.startedAt) {
    incompleteRunRecord("durationMs");
  }
  if (typeof value.timedOut !== "boolean") incompleteRunRecord("timedOut");
  if (typeof value.manuallyStopped !== "boolean") incompleteRunRecord("manuallyStopped");
  if (!Number.isSafeInteger(value.eventCount) || value.eventCount < 0) {
    incompleteRunRecord("eventCount");
  }
  if (!Array.isArray(value.events) || value.events.length > value.eventCount) {
    incompleteRunRecord("events");
  }
  if (!Array.isArray(value.stableOutput)) incompleteRunRecord("stableOutput");
  if (value.error !== null
    && (!value.error || typeof value.error !== "object" || Array.isArray(value.error))) {
    incompleteRunRecord("error");
  }

  if (value.eventCount === 0) {
    if (value.events.length !== 0 || value.lastEventSequence !== null) {
      incompleteRunRecord("lastEventSequence");
    }
  } else {
    const lastNumberedEvent = [...value.events].reverse()
      .find((event) => Number.isSafeInteger(event?.sequence) && event.sequence >= 0);
    if (!lastNumberedEvent || value.lastEventSequence !== lastNumberedEvent.sequence) {
      incompleteRunRecord("lastEventSequence");
    }
  }

  return cloneToolSnapshot(value);
}

function lifecycleRunResult(run) {
  if (run.timedOut || run.finalResult === "timeout") return "timeout";
  if (run.manuallyStopped || run.finalResult === "stopped") return "stopped";
  if (run.qemu.status === "finished") return "finished";
  if (run.qemu.status === "failure") return "failure";
  return null;
}

function resolvedFinalResult(run) {
  const record = createRunRecord({
    id: run.runId,
    context: {
      branch: run.branch,
      commit: run.commit,
      lab: run.lab,
      variant: run.variant
    },
    events: cloneToolSnapshot(run.events),
    stableOutput: cloneToolSnapshot(run.stableOutput),
    lifecycle: {
      buildResult: ["success", "failure"].includes(run.build.status)
        ? run.build.status
        : null,
      runResult: lifecycleRunResult(run),
      completed: true
    },
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.qemu.exitCode,
    stopped: run.manuallyStopped,
    error: run.error?.message || ""
  });
  return record.result;
}

function currentRunSequences(run) {
  const seen = new Set();
  return run.events.flatMap((event) => {
    if (!event || event.runId !== run.runId
      || !Number.isSafeInteger(event.sequence) || event.sequence < 0
      || seen.has(event.sequence)) return [];
    seen.add(event.sequence);
    return [event.sequence];
  });
}

function safeFailureCode(value, fallback) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value)
    ? value
    : fallback;
}

function safeFailurePhase(value, fallback) {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(value)
    ? value
    : fallback;
}

function failurePhase(run) {
  if (run.error?.stage === "build" || run.build.status === "failure"
    || run.build.status === "timeout" || run.build.status === "stopped") return "build";
  if (run.error?.stage === "qemu" || run.qemu.status === "failure"
    || run.qemu.status === "timeout" || run.qemu.status === "stopped") return "qemu";
  return "run";
}

function selectedEvidenceSequences(run, preferred = []) {
  const current = currentRunSequences(run);
  const allowed = new Set(current);
  const selected = [];
  const append = (sequence) => {
    if (allowed.has(sequence) && !selected.includes(sequence)
      && selected.length < GET_RUN_RESULT_MAX_EVIDENCE_SEQUENCES) {
      selected.push(sequence);
    }
  };
  if (Array.isArray(preferred)) preferred.forEach(append);
  if (selected.length === 0) {
    run.events.filter((event) => (
      event?.runId === run.runId
      && (event.status === "fail" || event.step === "panic")
    )).forEach((event) => append(event.sequence));
  }
  if (selected.length === 0) current.slice(-2).forEach(append);
  return selected;
}

function failureSummaryFor(run, finalResult) {
  if (!["fail", "timeout", "stopped"].includes(finalResult)) return null;

  const stored = run.failureSummary && typeof run.failureSummary === "object"
    && !Array.isArray(run.failureSummary)
    ? run.failureSummary
    : null;
  const phase = safeFailurePhase(stored?.phase, failurePhase(run));
  const codePhase = phase.replace(/-/g, "_");
  const fallbackCode = finalResult === "timeout"
    ? `${codePhase}_timeout`
    : finalResult === "stopped" ? "run_stopped" : `${codePhase}_failure`;
  const code = safeFailureCode(stored?.code || run.error?.code, fallbackCode);

  let fallbackMessage = "The target lab reported a failure.";
  if (finalResult === "timeout") fallbackMessage = `${phase} timeout ended the run.`;
  if (finalResult === "stopped") fallbackMessage = "The run was stopped manually.";
  const failureEvent = run.events.find((event) => (
    event?.runId === run.runId && (event.status === "fail" || event.step === "panic")
  ));
  const message = redactStoredEventText(
    stored?.message || run.error?.message || failureEvent?.detail || fallbackMessage
  ).slice(0, GET_QEMU_EVENTS_MAX_TEXT);

  return {
    code,
    phase,
    message: message || fallbackMessage,
    evidenceSequences: selectedEvidenceSequences(run, stored?.evidenceSequences)
  };
}

function safeDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = typeof value.id === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id)
    ? value.id
    : null;
  const severity = ["info", "warning", "error"].includes(value.severity)
    ? value.severity
    : null;
  const title = redactStoredEventText(value.title).slice(0, 200);
  return id && severity && title ? { id, severity, title } : null;
}

function validateRunTestInput(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new SafeToolError("invalid_tool_input", "run_test input must be an object.");
  }

  const fields = Object.keys(args);
  const executionField = fields.find((field) => RUN_TEST_EXECUTION_FIELDS.has(field));
  if (executionField) {
    throw new SafeToolError(
      "execution_field_forbidden",
      "run_test cannot accept process, repository, or execution parameters.",
      false,
      { field: executionField }
    );
  }
  const unknownField = fields.find((field) => !RUN_TEST_INPUT_FIELDS.has(field));
  if (unknownField) {
    throw new SafeToolError(
      "invalid_tool_input",
      "run_test input contains an unknown field.",
      false,
      { field: unknownField }
    );
  }
  if (typeof args.testId !== "string" || !RUN_TEST_ID_PATTERN.test(args.testId)) {
    throw new SafeToolError(
      "invalid_test_id",
      "testId must be a safe approved-test identifier."
    );
  }
  if (typeof args.lab !== "string" || !RUN_TEST_LAB_PATTERN.test(args.lab)) {
    throw new SafeToolError("invalid_lab", "lab must be one of lab1 through lab7.");
  }
  return { testId: args.testId, lab: args.lab };
}

function readRunTestContext(readWorkspaceContext) {
  let raw;
  try {
    raw = readWorkspaceContext();
  } catch (_) {
    throw new SafeToolError(
      "context_unavailable",
      "The workspace branch and commit are unavailable.",
      true
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || !plainBoundedString(raw.branch, 200)
    || !plainBoundedString(raw.commit, 200)) {
    throw new SafeToolError(
      "context_unavailable",
      "The workspace branch and commit are unavailable.",
      true
    );
  }
  return {
    ...resolveTeachingContext(raw.branch),
    commit: raw.commit
  };
}

function safeMissingPreflightComponents(preflight) {
  if (!preflight || !Array.isArray(preflight.checks)) return [];
  return preflight.checks
    .filter((check) => check && check.ok === false
      && typeof check.name === "string"
      && SAFE_PREFLIGHT_COMPONENT_PATTERN.test(check.name))
    .map((check) => check.name)
    .slice(0, 8);
}

function createRunTestTool(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (typeof options.readPreflight !== "function") {
    throw new TypeError("readPreflight is required.");
  }
  if (typeof options.startApprovedRun !== "function") {
    throw new TypeError("startApprovedRun is required.");
  }

  const registry = options.registry === undefined ? TEST_REGISTRY : options.registry;
  const makeRequestId = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;

  return function runTest(args = {}, invocationContext = {}) {
    const tool = "run_test";
    let actual = { branch: "unknown", commit: "unknown" };
    let requestId = makeRequestId();
    const meta = () => ({
      requestId,
      branch: actual.branch,
      commit: actual.commit,
      generatedAt: new Date(now()).toISOString()
    });

    try {
      actual = readRunTestContext(options.readWorkspaceContext);

      const requestIdCheck = validateRequestId(invocationContext?.requestId);
      if (requestIdCheck.ok && requestIdCheck.value) requestId = requestIdCheck.value;
      if (!requestIdCheck.ok) {
        return createToolFailure(tool, requestIdPolicyError(requestIdCheck.error), meta());
      }

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) {
        return createToolFailure(
          tool,
          invocationContextPolicyError(invocationCheck.error),
          meta()
        );
      }

      const input = validateRunTestInput(args);
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

      const approvedTest = registry && typeof registry === "object"
        && Object.hasOwn(registry, input.testId)
        ? registry[input.testId]
        : null;
      if (!approvedTest) {
        throw new SafeToolError(
          "unknown_test",
          "The requested test is not in the approved test registry."
        );
      }
      if (input.lab !== approvedTest.lab) {
        throw new SafeToolError(
          "lab_mismatch",
          "The requested lab does not match the approved test.",
          false,
          { requestedLab: input.lab, testLab: approvedTest.lab }
        );
      }
      if (actual.expectedBranch !== true) {
        throw new SafeToolError(
          "branch_not_allowed",
          "The current branch is not approved for run_test."
        );
      }
      if (actual.lab !== approvedTest.lab) {
        throw new SafeToolError(
          "lab_mismatch",
          "The current teaching context belongs to a different lab.",
          false,
          { requestedLab: approvedTest.lab, currentLab: actual.lab }
        );
      }
      if (actual.variant !== approvedTest.variant
        || approvedTest.branchPolicy?.type !== "exact"
        || actual.branch !== approvedTest.branchPolicy.branch) {
        throw new SafeToolError(
          "branch_not_allowed",
          "The current branch is not approved for the requested test."
        );
      }

      let preflight;
      try {
        preflight = options.readPreflight();
      } catch (_) {
        throw new SafeToolError(
          "preflight_failed",
          "The approved test environment is unavailable.",
          true,
          { missing: [] }
        );
      }
      if (!preflight || preflight.ok !== true) {
        throw new SafeToolError(
          "preflight_failed",
          "The approved test environment is unavailable.",
          true,
          { missing: safeMissingPreflightComponents(preflight) }
        );
      }

      const confirmed = readRunTestContext(options.readWorkspaceContext);
      if (confirmed.branch !== actual.branch || confirmed.commit !== actual.commit) {
        throw new SafeToolError(
          "context_changed",
          "The workspace branch or commit changed before the test started.",
          true,
          {
            expectedBranch: actual.branch,
            expectedCommit: actual.commit,
            actualBranch: confirmed.branch,
            actualCommit: confirmed.commit
          }
        );
      }
      actual = confirmed;

      const started = options.startApprovedRun({
        approvedTest,
        context: cloneToolSnapshot(actual)
      });
      if (started && started.started === false) {
        const activeKind = typeof started.activeTask?.kind === "string"
          && /^[a-z][a-z0-9-]{0,39}$/.test(started.activeTask.kind)
          ? started.activeTask.kind
          : null;
        throw new SafeToolError(
          "run_busy",
          "Another approved build or QEMU run is already active.",
          true,
          { activeKind }
        );
      }
      if (!started || started.started !== true
        || typeof started.runId !== "string"
        || !RUN_TEST_ID_PATTERN.test(started.runId)
        || !Number.isFinite(started.startedAt)) {
        throw new SafeToolError(
          "run_start_failed",
          "The approved test could not be started.",
          true
        );
      }

      return createToolSuccess(tool, {
        runId: started.runId,
        testId: approvedTest.testId,
        lab: approvedTest.lab,
        status: "started",
        startedAt: started.startedAt
      }, meta());
    } catch (error) {
      const safe = error && trustedSafeToolErrors.has(error)
        ? error
        : new SafeToolError(
          "run_start_failed",
          "The approved test could not be started.",
          true
        );
      return createToolFailure(tool, safe, meta());
    }
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
      if (!requestIdCheck.ok) {
        return createToolFailure(tool, requestIdPolicyError(requestIdCheck.error), meta());
      }

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) {
        return createToolFailure(
          tool,
          invocationContextPolicyError(invocationCheck.error),
          meta()
        );
      }

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
      if (!requestIdCheck.ok) {
        return createToolFailure(tool, requestIdPolicyError(requestIdCheck.error), meta());
      }

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) {
        return createToolFailure(
          tool,
          invocationContextPolicyError(invocationCheck.error),
          meta()
        );
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

function createGetQemuEventsTool(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (!options.runStore
    || typeof options.runStore.getActiveRun !== "function"
    || typeof options.runStore.getLastCompletedRun !== "function") {
    throw new TypeError("runStore with active and completed run accessors is required.");
  }

  const makeRequestId = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;

  return function getQemuEvents(args = {}, invocationContext = {}) {
    const tool = "get_qemu_events";
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
      if (!requestIdCheck.ok) {
        return createToolFailure(tool, requestIdPolicyError(requestIdCheck.error), meta());
      }

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) {
        return createToolFailure(
          tool,
          invocationContextPolicyError(invocationCheck.error),
          meta()
        );
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

      const input = validateGetQemuEventsInput(args);
      const activeRun = options.runStore.getActiveRun();
      const lastCompletedRun = options.runStore.getLastCompletedRun();
      let selectedRun = null;
      let active = false;
      let source = null;

      if (input.runId) {
        if (activeRun && activeRun.runId === input.runId) {
          selectedRun = activeRun;
          active = true;
          source = "activeRun";
        } else if (lastCompletedRun && lastCompletedRun.runId === input.runId) {
          selectedRun = lastCompletedRun;
          source = "lastCompletedRun";
        } else {
          throw new SafeToolError(
            "run_not_found",
            "The requested run is not the active or last completed run.",
            false,
            { runId: input.runId }
          );
        }
      } else if (activeRun) {
        selectedRun = activeRun;
        active = true;
        source = "activeRun";
      } else if (lastCompletedRun) {
        selectedRun = lastCompletedRun;
        source = "lastCompletedRun";
      } else {
        throw new SafeToolError(
          "no_run_available",
          "There is no active or completed run available."
        );
      }

      if (selectedRun.branch !== actual.branch || selectedRun.commit !== actual.commit) {
        throw new SafeToolError(
          "run_context_mismatch",
          "The selected run belongs to a different branch or commit.",
          false,
          {
            runBranch: selectedRun.branch || null,
            runCommit: selectedRun.commit || null,
            actualBranch: actual.branch,
            actualCommit: actual.commit
          }
        );
      }

      const storedEvents = Array.isArray(selectedRun.events) ? selectedRun.events : [];
      const matchedEvents = storedEvents
        .map((event) => safeStoredQemuEvent(event, selectedRun.runId, input.includeRaw))
        .filter(Boolean)
        .filter((event) => input.lab === null || event.lab === input.lab)
        .filter((event) => input.status === null || event.status === input.status)
        .filter((event) => input.sequenceStart === null
          || event.sequence >= input.sequenceStart)
        .filter((event) => input.sequenceEnd === null || event.sequence <= input.sequenceEnd);
      const events = matchedEvents.slice(0, input.limit);

      return createToolSuccess(tool, {
        runId: selectedRun.runId,
        branch: selectedRun.branch,
        commit: selectedRun.commit,
        lab: selectedRun.lab,
        variant: selectedRun.variant,
        source,
        active,
        eventProtocol: EVENT_PROTOCOL,
        totalMatched: matchedEvents.length,
        returnedCount: events.length,
        sequenceStart: input.sequenceStart,
        sequenceEnd: input.sequenceEnd,
        limit: input.limit,
        includeRaw: input.includeRaw,
        truncated: matchedEvents.length > events.length,
        events
      }, meta());
    } catch (error) {
      return createToolFailure(tool, error, meta());
    }
  };
}

function createGetRunResultTool(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (!options.runStore
    || typeof options.runStore.getActiveRun !== "function"
    || typeof options.runStore.getLastCompletedRun !== "function") {
    throw new TypeError("runStore with active and completed run accessors is required.");
  }

  const diagnoseRun = options.diagnose || diagnose;
  if (typeof diagnoseRun !== "function") throw new TypeError("diagnose must be a function.");
  const makeRequestId = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;

  return function getRunResult(args = {}, invocationContext = {}) {
    const tool = "get_run_result";
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
      if (!requestIdCheck.ok) {
        return createToolFailure(tool, requestIdPolicyError(requestIdCheck.error), meta());
      }

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) {
        return createToolFailure(
          tool,
          invocationContextPolicyError(invocationCheck.error),
          meta()
        );
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

      const input = validateGetRunResultInput(args);
      const activeRun = options.runStore.getActiveRun();
      const lastCompletedRun = options.runStore.getLastCompletedRun();
      let selectedRun = null;

      if (input.runId) {
        if (lastCompletedRun && lastCompletedRun.runId === input.runId) {
          selectedRun = lastCompletedRun;
        } else if (activeRun && activeRun.runId === input.runId) {
          throw new SafeToolError(
            "run_in_progress",
            "The requested run is still in progress.",
            false,
            { runId: input.runId }
          );
        } else {
          throw new SafeToolError(
            "run_not_found",
            "The requested run is not the active or last completed run.",
            false,
            { runId: input.runId }
          );
        }
      } else if (lastCompletedRun) {
        selectedRun = lastCompletedRun;
      } else if (activeRun) {
        throw new SafeToolError(
          "run_in_progress",
          "A run is in progress and no completed result is available.",
          false,
          { runId: activeRun.runId || null }
        );
      } else {
        throw new SafeToolError(
          "no_completed_run",
          "There is no completed run result available."
        );
      }

      const run = validateCompletedRunRecord(selectedRun);
      if (run.branch !== actual.branch || run.commit !== actual.commit) {
        throw new SafeToolError(
          "run_context_mismatch",
          "The selected run belongs to a different branch or commit.",
          false,
          {
            runBranch: run.branch,
            runCommit: run.commit,
            actualBranch: actual.branch,
            actualCommit: actual.commit
          }
        );
      }

      if (input.lab !== null && input.lab !== run.lab) {
        throw new SafeToolError(
          "lab_mismatch",
          "The selected completed run belongs to a different lab.",
          false,
          { requestedLab: input.lab, runLab: run.lab }
        );
      }

      const finalResult = resolvedFinalResult(run);
      let diagnostics = [];
      if (input.includeDiagnostics) {
        let rawDiagnostics;
        try {
          rawDiagnostics = diagnoseRun(cloneToolSnapshot({
            lab: run.lab,
            role: run.variant,
            buildResult: run.build.status,
            finalStatus: finalResult,
            events: run.events,
            serialOutput: run.stableOutput
          }));
        } catch (_) {
          throw new SafeToolError(
            "diagnostics_failed",
            "Deterministic diagnostics could not be generated."
          );
        }
        if (!Array.isArray(rawDiagnostics)) {
          throw new SafeToolError(
            "diagnostics_failed",
            "Deterministic diagnostics returned an invalid result."
          );
        }
        diagnostics = rawDiagnostics
          .map(safeDiagnostic)
          .filter(Boolean)
          .slice(0, GET_RUN_RESULT_MAX_DIAGNOSTICS);
      }

      return createToolSuccess(tool, {
        schemaVersion: GET_RUN_RESULT_SCHEMA_VERSION,
        eventProtocol: EVENT_PROTOCOL,
        runId: run.runId,
        branch: run.branch,
        commit: run.commit,
        lab: run.lab,
        variant: run.variant,
        target: run.target,
        build: cloneToolSnapshot(run.build),
        qemu: cloneToolSnapshot(run.qemu),
        finalResult,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        durationMs: run.durationMs,
        timedOut: run.timedOut,
        manuallyStopped: run.manuallyStopped,
        eventCount: run.eventCount,
        lastEventSequence: run.lastEventSequence,
        failureSummary: failureSummaryFor(run, finalResult),
        diagnostics
      }, meta());
    } catch (error) {
      return createToolFailure(tool, error, meta());
    }
  };
}

function createGetCodeDiffTool(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (!options.codeDiffEngine
    && (typeof options.repoDir !== "string" || !options.repoDir)) {
    throw new TypeError("repoDir is required.");
  }

  const usesLocalCodeDiffEngine = !options.codeDiffEngine;
  const inspectCodeDiff = options.codeDiffEngine || createCodeDiffEngine({
    repoDir: options.repoDir,
    spawnSync: options.spawnSync,
    processEnv: options.processEnv
  });
  if (typeof inspectCodeDiff !== "function") {
    throw new TypeError("codeDiffEngine must be a function.");
  }
  const makeRequestId = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;

  return function getCodeDiff(args = {}, invocationContext = {}) {
    const tool = "get_code_diff";
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
      if (!requestIdCheck.ok) {
        return createToolFailure(tool, requestIdPolicyError(requestIdCheck.error), meta());
      }

      const invocationCheck = validateInvocationContext(invocationContext);
      if (!invocationCheck.ok) {
        return createToolFailure(
          tool,
          invocationContextPolicyError(invocationCheck.error),
          meta()
        );
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

      const data = inspectCodeDiff(args, actual);
      const finalContext = options.readWorkspaceContext();
      const finalBranch = typeof finalContext?.branch === "string" && finalContext.branch
        ? finalContext.branch
        : "unknown";
      const finalCommit = typeof finalContext?.commit === "string" && finalContext.commit
        ? finalContext.commit
        : "unknown";
      if (finalBranch !== actual.branch || finalCommit !== actual.commit) {
        throw new SafeToolError(
          "context_changed",
          "The workspace branch or commit changed while the tool executed.",
          true,
          {
            expectedBranch: actual.branch,
            expectedCommit: actual.commit,
            actualBranch: finalBranch,
            actualCommit: finalCommit
          }
        );
      }

      return createToolSuccess(tool, data, meta());
    } catch (error) {
      return createToolFailure(
        tool,
        localCodeDiffError(error, usesLocalCodeDiffEngine) || error,
        meta()
      );
    }
  };
}

module.exports = {
  GET_RUN_RESULT_MAX_DIAGNOSTICS,
  GET_RUN_RESULT_MAX_EVIDENCE_SEQUENCES,
  GET_RUN_RESULT_SCHEMA_VERSION,
  GET_QEMU_EVENTS_DEFAULT_LIMIT,
  GET_QEMU_EVENTS_MAX_LIMIT,
  READ_CODE_DEFAULT_BYTES,
  READ_CODE_DEFAULT_LINES,
  READ_CODE_MAX_BYTES,
  READ_CODE_MAX_FILE_BYTES,
  READ_CODE_MAX_LINES,
  SafeToolError,
  createGetCodeDiffTool,
  createGetContextTool,
  createGetQemuEventsTool,
  createGetRunResultTool,
  createReadCodeTool,
  createRunTestTool,
  createToolFailure,
  createToolResult,
  createToolSuccess,
  normalizeTaskSnapshot,
  normalizeWorkspaceSnapshot,
  parsePorcelainStatus,
  readGitWorkspaceStatus
};
