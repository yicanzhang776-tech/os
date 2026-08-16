"use strict";

const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const { parseBranchContext } = require("../protocol");

const AGENT_CONTRACT_VERSION = "os-tutor.agent/v1";
const MAX_AGENT_BODY_BYTES = 16 * 1024;
const MAX_AGENT_MESSAGE_LENGTH = 4000;
const MAX_AGENT_ANSWER_LENGTH = 12_000;
const REQUEST_ID_PATTERN = /^agent-[A-Za-z0-9._:-]{1,80}$/;
const SAFE_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,79}$/;
const FORBIDDEN_MESSAGE_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const AGENT_INPUT_FIELDS = new Set(["message"]);
const AGENT_FORBIDDEN_FIELDS = new Set([
  "command",
  "args",
  "cwd",
  "env",
  "shell",
  "timeout",
  "tool",
  "toolName",
  "toolCall",
  "toolCalls",
  "toolArgs",
  "toolChoice",
  "toolResult",
  "toolResults",
  "branch",
  "commit",
  "ref",
  "lab",
  "variant",
  "context",
  "expectedBranch",
  "expectedCommit",
  "model",
  "baseUrl",
  "endpoint",
  "apiKey",
  "authorization",
  "systemPrompt",
  "system",
  "developerPrompt",
  "messages",
  "temperature",
  "maxTokens",
  "requestId",
  "conversationId"
]);

const ERROR_DEFINITIONS = Object.freeze({
  method_not_allowed: Object.freeze({
    statusCode: 405,
    message: "Only POST is allowed for this endpoint.",
    retryable: false
  }),
  origin_not_allowed: Object.freeze({
    statusCode: 403,
    message: "The request origin is not allowed.",
    retryable: false
  }),
  authorization_not_allowed: Object.freeze({
    statusCode: 403,
    message: "Client authorization is not accepted by this endpoint.",
    retryable: false
  }),
  unsupported_media_type: Object.freeze({
    statusCode: 415,
    message: "Content-Type must be application/json with optional UTF-8 charset.",
    retryable: false
  }),
  invalid_json: Object.freeze({
    statusCode: 400,
    message: "The request body must contain valid JSON.",
    retryable: false
  }),
  request_too_large: Object.freeze({
    statusCode: 413,
    message: "The request body exceeds the 16 KiB limit.",
    retryable: false
  }),
  invalid_agent_input: Object.freeze({
    statusCode: 400,
    message: "The agent request input is invalid.",
    retryable: false
  }),
  message_required: Object.freeze({
    statusCode: 400,
    message: "A non-empty message is required.",
    retryable: false
  }),
  message_too_long: Object.freeze({
    statusCode: 400,
    message: "The message exceeds the 4000 character limit.",
    retryable: false
  }),
  agent_field_forbidden: Object.freeze({
    statusCode: 400,
    message: "The agent request contains a protected field.",
    retryable: false
  }),
  context_unavailable: Object.freeze({
    statusCode: 503,
    message: "The workspace context is unavailable.",
    retryable: true
  }),
  context_changed: Object.freeze({
    statusCode: 409,
    message: "The workspace branch or commit changed during the request.",
    retryable: true
  }),
  agent_not_configured: Object.freeze({
    statusCode: 503,
    message: "The agent is not configured.",
    retryable: false
  }),
  model_not_configured: Object.freeze({
    statusCode: 503,
    message: "The model is not configured.",
    retryable: false
  }),
  model_auth_failed: Object.freeze({
    statusCode: 502,
    message: "Model authentication failed.",
    retryable: false
  }),
  model_rate_limited: Object.freeze({
    statusCode: 429,
    message: "The model request was rate limited.",
    retryable: true
  }),
  model_timeout: Object.freeze({
    statusCode: 504,
    message: "The model request timed out.",
    retryable: true
  }),
  model_request_failed: Object.freeze({
    statusCode: 502,
    message: "The model request was rejected.",
    retryable: false
  }),
  model_upstream_error: Object.freeze({
    statusCode: 502,
    message: "The model service returned an error.",
    retryable: true
  }),
  model_unavailable: Object.freeze({
    statusCode: 503,
    message: "The model service is unavailable.",
    retryable: true
  }),
  model_invalid_response: Object.freeze({
    statusCode: 502,
    message: "The model service returned an invalid response.",
    retryable: false
  }),
  model_internal_error: Object.freeze({
    statusCode: 500,
    message: "The model request could not be completed.",
    retryable: false
  }),
  agent_busy: Object.freeze({
    statusCode: 429,
    message: "The agent is currently busy.",
    retryable: true
  }),
  agent_protocol_error: Object.freeze({
    statusCode: 502,
    message: "The model did not follow the teaching tool protocol.",
    retryable: false
  }),
  agent_loop_limit: Object.freeze({
    statusCode: 422,
    message: "The teaching tool request reached its safe limit.",
    retryable: false
  }),
  agent_deadline_exceeded: Object.freeze({
    statusCode: 504,
    message: "The teaching tool request exceeded its time limit.",
    retryable: true
  }),
  agent_tool_output_too_large: Object.freeze({
    statusCode: 422,
    message: "The teaching evidence exceeded its safe size limit.",
    retryable: false
  }),
  mixed_action_batch_unsupported: Object.freeze({
    statusCode: 422,
    message: "An action tool cannot be combined with other teaching tools.",
    retryable: false
  }),
  agent_internal_error: Object.freeze({
    statusCode: 500,
    message: "The agent request could not be completed.",
    retryable: false
  })
});

const trustedAgentErrors = new WeakSet();

function safeErrorDetails(code, value) {
  if (!["agent_field_forbidden", "invalid_agent_input"].includes(code)) return {};
  const field = value && typeof value.field === "string" && SAFE_FIELD_PATTERN.test(value.field)
    ? value.field
    : null;
  return field ? { field } : {};
}

class AgentApiError extends Error {
  constructor(code, details = {}) {
    const definition = ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.agent_internal_error;
    super(definition.message);
    this.name = "AgentApiError";
    this.code = Object.hasOwn(ERROR_DEFINITIONS, code) ? code : "agent_internal_error";
    this.details = Object.freeze(safeErrorDetails(this.code, details));
    trustedAgentErrors.add(this);
    Object.freeze(this);
  }
}

function defaultRequestId() {
  return `agent-${crypto.randomUUID()}`;
}

async function defaultAgentHandler() {
  throw new AgentApiError("agent_not_configured");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function headerEntry(headers, name) {
  if (!headers || typeof headers !== "object") return { present: false, value: undefined };
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined
    ? { present: false, value: undefined }
    : { present: true, value: headers[key] };
}

function hasHeader(headers, name) {
  return Boolean(headers && typeof headers === "object"
    && Object.keys(headers).some((candidate) => candidate.toLowerCase() === name));
}

function hasAcceptedContentType(headers) {
  const entry = headerEntry(headers, "content-type");
  if (!entry.present || typeof entry.value !== "string") return false;
  const parts = entry.value.split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "application/json") return false;
  if (parts.length === 0) return true;
  return parts.length === 1 && /^charset\s*=\s*utf-8$/i.test(parts[0]);
}

function declaredBodyLength(headers) {
  const entry = headerEntry(headers, "content-length");
  if (!entry.present || typeof entry.value !== "string" || !/^\d+$/.test(entry.value)) {
    return null;
  }
  const value = Number(entry.value);
  return Number.isSafeInteger(value) ? value : null;
}

function swallowLateStreamErrors(stream) {
  if (!stream || typeof stream.once !== "function") return;
  const ignore = () => {};
  stream.once("error", ignore);
  stream.once("close", () => stream.removeListener?.("error", ignore));
}

function drainStream(stream) {
  swallowLateStreamErrors(stream);
  if (stream && typeof stream.resume === "function") stream.resume();
}

function decodeJsonBuffer(buffer) {
  if (buffer.length === 0) throw new AgentApiError("invalid_json");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_) {
    throw new AgentApiError("invalid_json");
  }
  if (text.trim().length === 0) throw new AgentApiError("invalid_json");
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new AgentApiError("invalid_json");
  }
}

function readJsonBody(stream, headers) {
  const declaredLength = declaredBodyLength(headers);
  if (declaredLength !== null && declaredLength > MAX_AGENT_BODY_BYTES) {
    drainStream(stream);
    return Promise.reject(new AgentApiError("request_too_large"));
  }
  if (!stream || typeof stream.on !== "function") {
    return Promise.reject(new AgentApiError("invalid_json"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const chunks = [];

    const cleanup = () => {
      stream.removeListener?.("data", onData);
      stream.removeListener?.("end", onEnd);
      stream.removeListener?.("aborted", onAborted);
      stream.removeListener?.("error", onError);
    };
    const finish = (error, value, shouldDrain = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (shouldDrain) drainStream(stream);
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalBytes += buffer.length;
      if (totalBytes > MAX_AGENT_BODY_BYTES) {
        finish(new AgentApiError("request_too_large"), undefined, true);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      try {
        finish(null, decodeJsonBuffer(Buffer.concat(chunks, totalBytes)));
      } catch (error) {
        finish(error);
      }
    };
    const onAborted = () => {
      finish(new AgentApiError("invalid_json"), undefined, true);
    };
    const onError = () => {
      finish(new AgentApiError("invalid_json"), undefined, true);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("aborted", onAborted);
    stream.once("error", onError);
  });
}

function validateAgentInput(value) {
  if (!isPlainObject(value)) throw new AgentApiError("invalid_agent_input");
  const fields = Object.keys(value);
  const forbidden = fields.find((field) => AGENT_FORBIDDEN_FIELDS.has(field));
  if (forbidden) throw new AgentApiError("agent_field_forbidden", { field: forbidden });
  const unknown = fields.find((field) => !AGENT_INPUT_FIELDS.has(field));
  if (unknown) throw new AgentApiError("invalid_agent_input", { field: unknown });
  if (!Object.hasOwn(value, "message")
    || typeof value.message !== "string"
    || value.message.trim().length === 0) {
    if (!Object.hasOwn(value, "message") || typeof value.message === "string") {
      throw new AgentApiError("message_required");
    }
    throw new AgentApiError("invalid_agent_input", { field: "message" });
  }

  const message = value.message.trim();
  if (message.length > MAX_AGENT_MESSAGE_LENGTH) {
    throw new AgentApiError("message_too_long");
  }
  if (FORBIDDEN_MESSAGE_CHARACTERS.test(message)) {
    throw new AgentApiError("invalid_agent_input", { field: "message" });
  }
  return message;
}

function validateHandlerResult(value) {
  if (!isPlainObject(value) || !Object.hasOwn(value, "answer")) return null;
  if (Object.keys(value).length !== 1 || typeof value.answer !== "string") return null;
  const answer = value.answer.trim();
  if (answer.length === 0
    || answer.length > MAX_AGENT_ANSWER_LENGTH
    || FORBIDDEN_MESSAGE_CHARACTERS.test(answer)) {
    return null;
  }
  return { answer };
}

function readRealContext(readWorkspaceContext) {
  let raw;
  try {
    raw = readWorkspaceContext();
  } catch (_) {
    throw new AgentApiError("context_unavailable");
  }
  const plainString = (value) => typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value);
  if (!isPlainObject(raw)
    || !plainString(raw.branch)
    || !plainString(raw.commit)
    || raw.branch === "unknown"
    || raw.commit === "unknown") {
    throw new AgentApiError("context_unavailable");
  }
  const teaching = parseBranchContext(raw.branch);
  return {
    branch: teaching.branch,
    commit: raw.commit,
    lab: teaching.lab,
    variant: teaching.variant
  };
}

function generatedAt(now) {
  const value = typeof now === "function" ? now() : Date.now();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function createMeta(requestId, context, now) {
  return {
    requestId,
    branch: context?.branch || null,
    commit: context?.commit || null,
    lab: context?.lab || null,
    variant: context?.variant || null,
    generatedAt: generatedAt(now)
  };
}

function createSuccess(data, meta) {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    ok: true,
    data,
    error: null,
    meta
  };
}

function normalizeAgentError(error) {
  if (error && trustedAgentErrors.has(error)) return error;
  return new AgentApiError("agent_internal_error");
}

function createFailure(error, meta) {
  const safe = normalizeAgentError(error);
  const definition = ERROR_DEFINITIONS[safe.code];
  return {
    statusCode: definition.statusCode,
    headers: safe.code === "method_not_allowed" ? { Allow: "POST" } : {},
    body: {
      contractVersion: AGENT_CONTRACT_VERSION,
      ok: false,
      data: null,
      error: {
        code: safe.code,
        message: definition.message,
        retryable: definition.retryable,
        details: { ...safe.details }
      },
      meta
    }
  };
}

function createAgentApi(options = {}) {
  if (typeof options.readWorkspaceContext !== "function") {
    throw new TypeError("readWorkspaceContext is required.");
  }
  if (typeof options.expectedOrigin !== "string" || !options.expectedOrigin) {
    throw new TypeError("expectedOrigin is required.");
  }
  const handleAgentRequest = options.handleAgentRequest || defaultAgentHandler;
  if (typeof handleAgentRequest !== "function") {
    throw new TypeError("handleAgentRequest must be a function.");
  }
  const requestIdFactory = options.requestIdFactory || defaultRequestId;
  const now = options.now || Date.now;

  return Object.freeze({
    async handleHttpRequest(input = {}) {
      let requestId = "agent-unavailable";
      let context = null;
      try {
        const candidateRequestId = requestIdFactory();
        if (typeof candidateRequestId !== "string" || !REQUEST_ID_PATTERN.test(candidateRequestId)) {
          throw new Error("Invalid server requestId.");
        }
        requestId = candidateRequestId;

        if (input.method !== "POST") throw new AgentApiError("method_not_allowed");
        if (hasHeader(input.headers, "authorization")) {
          throw new AgentApiError("authorization_not_allowed");
        }
        const origin = headerEntry(input.headers, "origin");
        if (!origin.present
          || typeof origin.value !== "string"
          || origin.value !== options.expectedOrigin) {
          throw new AgentApiError("origin_not_allowed");
        }
        if (!hasAcceptedContentType(input.headers)) {
          throw new AgentApiError("unsupported_media_type");
        }

        const parsed = await readJsonBody(input.body, input.headers);
        const message = validateAgentInput(parsed);
        const realContext = readRealContext(options.readWorkspaceContext);
        context = Object.freeze({ requestId, ...realContext });

        const handlerResult = await handleAgentRequest({ message, invocationContext: context });
        const data = validateHandlerResult(handlerResult);
        if (!data) throw new Error("Invalid Agent handler result.");

        const confirmed = readRealContext(options.readWorkspaceContext);
        if (confirmed.branch !== context.branch || confirmed.commit !== context.commit) {
          throw new AgentApiError("context_changed");
        }
        return {
          statusCode: 200,
          headers: {},
          body: createSuccess(data, createMeta(requestId, context, now))
        };
      } catch (error) {
        return createFailure(error, createMeta(requestId, context, now));
      }
    }
  });
}

module.exports = {
  AGENT_CONTRACT_VERSION,
  AGENT_FORBIDDEN_FIELDS,
  AgentApiError,
  MAX_AGENT_ANSWER_LENGTH,
  MAX_AGENT_BODY_BYTES,
  MAX_AGENT_MESSAGE_LENGTH,
  createAgentApi
};
