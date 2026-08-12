"use strict";

const path = require("node:path");
const { parseBranchContext } = require("../protocol");

const TOOL_CONTRACT_VERSION = "os-tutor.tool/v1";
const PROTECTED_CONTEXT_FIELDS = Object.freeze([
  "branch",
  "commit",
  "expectedBranch",
  "expectedCommit"
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const READ_CODE_ALLOWED_EXTENSIONS = Object.freeze(new Set([
  ".rs",
  ".s",
  ".ld",
  ".toml",
  ".md"
]));
const READ_CODE_EXACT_FILES = Object.freeze(new Set([
  "Cargo.toml",
  "kernel/Cargo.toml"
]));
const SOLUTION_PATH_WORDS = Object.freeze(new Set([
  "answer",
  "answers",
  "instructor",
  "instructors",
  "solution",
  "solutions",
  "teacher",
  "teachers"
]));

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

function policyFailure(code, message, details = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: false,
      details
    }
  };
}

function isSolutionContentPath(relativePath) {
  if (!relativePath.startsWith("docs/labs/")) return false;

  return relativePath.slice("docs/labs/".length).split("/").some((segment) => {
    const stem = segment.replace(/\.[^.]*$/, "").toLowerCase();
    const words = stem.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((word) => SOLUTION_PATH_WORDS.has(word))) return true;

    const compact = words.join("");
    return compact === "modelanswer"
      || compact === "referenceanswer"
      || compact === "referenceimplementation"
      || compact === "standardimplementation"
      || compact === "teacherguide";
  });
}

function validateReadCodePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000) {
    return policyFailure(
      "invalid_path",
      "path must be a non-empty repository-relative POSIX path."
    );
  }
  if (/\u0000|[\u0001-\u001f\u007f]/.test(value)) {
    return policyFailure("invalid_path", "path contains forbidden control characters.");
  }
  if (path.posix.isAbsolute(value)) {
    return policyFailure("absolute_path_forbidden", "Absolute paths are not allowed.");
  }
  if (/^[A-Za-z]:/.test(value)) {
    return policyFailure("absolute_path_forbidden", "Windows drive paths are not allowed.");
  }
  if (value.includes("\\")) {
    return policyFailure(
      "path_traversal",
      "Backslashes are not allowed in repository-relative POSIX paths."
    );
  }

  const segments = value.split("/");
  if (segments.some((segment) => /^[A-Za-z]:/.test(segment))) {
    return policyFailure("absolute_path_forbidden", "Windows drive paths are not allowed.");
  }
  if (segments.includes("..")) {
    return policyFailure("path_traversal", "Parent-directory traversal is not allowed.");
  }
  if (segments.some((segment) => segment === "" || segment === ".")) {
    return policyFailure("invalid_path", "path must be a normalized POSIX path.");
  }

  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")) {
    return policyFailure("path_traversal", "Path traversal is not allowed.");
  }

  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const basename = lowerSegments.at(-1);
  if (lowerSegments.includes(".git")
    || lowerSegments.includes("target")
    || lowerSegments.some((segment) => segment === ".env" || segment.startsWith(".env."))
    || /\.(?:pem|key|token)$/.test(basename)
    || basename.startsWith("secrets.")) {
    return policyFailure("forbidden_path", "The requested path is protected.");
  }
  if (isSolutionContentPath(normalized)) {
    return policyFailure(
      "solution_content_forbidden",
      "Solution and teacher-only content cannot be read by this tool."
    );
  }

  const inAllowedDirectory = normalized.startsWith("kernel/src/")
    || normalized.startsWith("docs/labs/");
  if (!inAllowedDirectory && !READ_CODE_EXACT_FILES.has(normalized)) {
    return policyFailure("forbidden_path", "The requested path is outside the read_code whitelist.");
  }

  const extension = path.posix.extname(normalized).toLowerCase();
  if (!READ_CODE_ALLOWED_EXTENSIONS.has(extension)) {
    return policyFailure("forbidden_extension", "The requested file extension is not allowed.");
  }

  return { ok: true, value: normalized };
}

module.exports = {
  PROTECTED_CONTEXT_FIELDS,
  TOOL_CONTRACT_VERSION,
  isExpectedTeachingContext,
  isSolutionContentPath,
  protectedContextOverride,
  resolveTeachingContext,
  validateInvocationContext,
  validateReadCodePath,
  validateRequestId
};
