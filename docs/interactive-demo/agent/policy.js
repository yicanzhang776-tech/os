"use strict";

const { parseBranchContext } = require("../protocol");

const TOOL_CONTRACT_VERSION = "os-tutor.tool/v1";
const PROTECTED_CONTEXT_FIELDS = Object.freeze([
  "branch",
  "commit",
  "expectedBranch",
  "expectedCommit"
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

function resolveTeachingContext(branch) {
  return parseBranchContext(branch);
}

function isExpectedTeachingContext(context) {
  return Boolean(context && context.expectedBranch === true);
}

function validateRequestId(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    return {
      ok: false,
      error: {
        code: "invalid_request_id",
        message: "requestId must contain only safe identifier characters and be at most 80 characters.",
        retryable: false,
        details: {}
      }
    };
  }
  return { ok: true, value };
}

function validateInvocationContext(value) {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: {
        code: "invalid_invocation_context",
        message: "invocationContext must be an object.",
        retryable: false,
        details: {}
      }
    };
  }

  for (const field of ["expectedBranch", "expectedCommit"]) {
    if (!Object.hasOwn(value, field)) continue;
    if (typeof value[field] !== "string"
      || value[field].length === 0
      || value[field].length > 200
      || /[\u0000-\u001f\u007f]/.test(value[field])) {
      return {
        ok: false,
        error: {
          code: "invalid_invocation_context",
          message: `${field} must be a non-empty plain string.`,
          retryable: false,
          details: { field }
        }
      };
    }
  }

  return { ok: true, value };
}

function protectedContextOverride(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  return PROTECTED_CONTEXT_FIELDS.find((field) => Object.hasOwn(args, field)) || null;
}

module.exports = {
  PROTECTED_CONTEXT_FIELDS,
  TOOL_CONTRACT_VERSION,
  isExpectedTeachingContext,
  protectedContextOverride,
  resolveTeachingContext,
  validateInvocationContext,
  validateRequestId
};
