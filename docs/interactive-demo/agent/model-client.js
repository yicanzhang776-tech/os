"use strict";

const { TextDecoder } = require("node:util");

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
const DEFAULT_ARK_MODEL = "ark-code-latest";
const ARK_RESPONSES_URL = `${DEFAULT_ARK_BASE_URL}/responses`;
const MODEL_TIMEOUT_MS = 45_000;
const MAX_MODEL_RESPONSE_BYTES = 1024 * 1024;
const MAX_MODEL_ANSWER_LENGTH = 12_000;
const MAX_API_KEY_LENGTH = 4096;
const REQUEST_ID_PATTERN = /^agent-[A-Za-z0-9._:-]{1,80}$/;
const FORBIDDEN_TEXT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SERVER_INSTRUCTIONS = [
  "You are an operating-systems teaching assistant.",
  "Answer only from the user's current input and general knowledge.",
  "You have not read the student's project code or inspected its Git branch.",
  "You have not run tests, inspected QEMU, or executed any command or external action.",
  "Never claim that you performed those actions.",
  "When project-specific evidence is required, state that it cannot currently be confirmed."
].join(" ");

const MODEL_ERROR_DEFINITIONS = Object.freeze({
  model_not_configured: "The model is not configured.",
  model_auth_failed: "Model authentication failed.",
  model_rate_limited: "The model request was rate limited.",
  model_timeout: "The model request timed out.",
  model_request_failed: "The model request was rejected.",
  model_upstream_error: "The model service returned an error.",
  model_unavailable: "The model service is unavailable.",
  model_invalid_response: "The model service returned an invalid response.",
  model_internal_error: "The model request could not be completed."
});

const trustedModelClientErrors = new WeakSet();

class ModelClientError extends Error {
  constructor(code) {
    const trustedCode = Object.hasOwn(MODEL_ERROR_DEFINITIONS, code)
      ? code
      : "model_internal_error";
    super(MODEL_ERROR_DEFINITIONS[trustedCode]);
    this.name = "ModelClientError";
    this.code = trustedCode;
    this.details = Object.freeze({});
    trustedModelClientErrors.add(this);
    Object.freeze(this);
  }
}

function isTrustedModelClientError(error) {
  return Boolean(error && trustedModelClientErrors.has(error));
}

function modelError(code) {
  return new ModelClientError(code);
}

function resolveExactSetting(value, expected) {
  if (value === undefined) return expected;
  if (typeof value !== "string" || value.trim() !== expected) return null;
  return expected;
}

function readApiKeyOnce(provider) {
  if (typeof provider !== "function") return null;
  let value;
  try {
    value = provider();
  } catch (_) {
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_API_KEY_LENGTH) return null;
  if (/\s|[\u0000-\u001f\u007f]/u.test(trimmed)) return null;
  return trimmed;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateRespondInput(value) {
  if (!isPlainObject(value)
    || Object.keys(value).some((field) => !["message", "requestId"].includes(field))
    || typeof value.message !== "string"
    || value.message.trim().length === 0
    || value.message.length > 4000
    || FORBIDDEN_TEXT_CHARACTERS.test(value.message)
    || typeof value.requestId !== "string"
    || !REQUEST_ID_PATTERN.test(value.requestId)) {
    throw modelError("model_internal_error");
  }
  return value.message.trim();
}

function hasJsonContentType(response) {
  let value;
  try {
    value = response?.headers?.get?.("content-type");
  } catch (_) {
    return false;
  }
  if (typeof value !== "string") return false;
  return /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(value);
}

async function readBoundedJson(response) {
  if (!response?.body || typeof response.body.getReader !== "function") {
    throw modelError("model_invalid_response");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (!item || item.done) break;
      if (!(item.value instanceof Uint8Array)) {
        throw modelError("model_invalid_response");
      }
      totalBytes += item.value.byteLength;
      if (totalBytes > MAX_MODEL_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch (_) {
          // The response is already rejected; cancellation is best-effort only.
        }
        throw modelError("model_invalid_response");
      }
      chunks.push(Buffer.from(item.value));
    }
  } catch (error) {
    if (isTrustedModelClientError(error)) throw error;
    throw modelError("model_unavailable");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, totalBytes));
  } catch (_) {
    throw modelError("model_invalid_response");
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throw modelError("model_invalid_response");
  }
}

function containsActionItem(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (typeof value.type === "string") {
    const type = value.type.toLowerCase();
    if (type.includes("call")
      || type.includes("computer")
      || type.includes("action")
      || type.includes("shell")) {
      return true;
    }
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => containsActionItem(child, seen));
}

function parseAssistantAnswer(value, apiKey) {
  if (!isPlainObject(value) || !Array.isArray(value.output) || containsActionItem(value.output)) {
    throw modelError("model_invalid_response");
  }
  const parts = [];
  for (const item of value.output) {
    if (!isPlainObject(item)) throw modelError("model_invalid_response");
    if (item.type === "reasoning") continue;
    if (item.type !== "message" || item.role !== "assistant" || !Array.isArray(item.content)) {
      throw modelError("model_invalid_response");
    }
    for (const content of item.content) {
      if (!isPlainObject(content)
        || content.type !== "output_text"
        || typeof content.text !== "string") {
        throw modelError("model_invalid_response");
      }
      parts.push(content.text);
    }
  }
  const answer = parts.join("").trim();
  if (answer.length === 0
    || answer.length > MAX_MODEL_ANSWER_LENGTH
    || answer.includes(apiKey)
    || FORBIDDEN_TEXT_CHARACTERS.test(answer)) {
    throw modelError("model_invalid_response");
  }
  return answer;
}

function classifyStatus(status) {
  if (status === 401 || status === 403) return "model_auth_failed";
  if (status === 429) return "model_rate_limited";
  if (status >= 400 && status < 500) return "model_request_failed";
  if (status >= 500 && status < 600) return "model_upstream_error";
  return "model_invalid_response";
}

function createArkModelClient(options = {}) {
  const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required.");
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  if (typeof setTimer !== "function" || typeof clearTimer !== "function") {
    throw new TypeError("Timer functions are required.");
  }

  const apiKey = readApiKeyOnce(options.apiKeyProvider);
  const baseUrl = resolveExactSetting(options.baseUrl, DEFAULT_ARK_BASE_URL);
  const model = resolveExactSetting(options.model, DEFAULT_ARK_MODEL);
  const configured = Boolean(apiKey && baseUrl && model && options.timeoutMs !== null
    && (options.timeoutMs === undefined || options.timeoutMs === MODEL_TIMEOUT_MS));

  return Object.freeze({
    async respond(input = {}) {
      if (!configured) throw modelError("model_not_configured");
      const message = validateRespondInput(input);
      const controller = new AbortController();
      let timedOut = false;
      let rejectTimeout;
      const timeoutPromise = new Promise((_, reject) => {
        rejectTimeout = reject;
      });
      let timer;
      try {
        timer = setTimer(() => {
          timedOut = true;
          controller.abort();
          rejectTimeout(modelError("model_timeout"));
        }, MODEL_TIMEOUT_MS);
      } catch (_) {
        throw modelError("model_internal_error");
      }

      try {
        let response;
        try {
          const fetchPromise = Promise.resolve().then(() => fetchImpl(ARK_RESPONSES_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: DEFAULT_ARK_MODEL,
              instructions: SERVER_INSTRUCTIONS,
              input: message,
              stream: false
            }),
            signal: controller.signal
          }));
          response = await Promise.race([fetchPromise, timeoutPromise]);
        } catch (_) {
          throw modelError(timedOut ? "model_timeout" : "model_unavailable");
        }
        if (timedOut) throw modelError("model_timeout");
        if (!response || !Number.isInteger(response.status)) {
          throw modelError("model_invalid_response");
        }
        if (response.status < 200 || response.status >= 300) {
          throw modelError(classifyStatus(response.status));
        }
        if (!hasJsonContentType(response)) throw modelError("model_invalid_response");
        const body = await Promise.race([readBoundedJson(response), timeoutPromise]);
        if (timedOut) throw modelError("model_timeout");
        return parseAssistantAnswer(body, apiKey);
      } catch (error) {
        if (timedOut) throw modelError("model_timeout");
        if (isTrustedModelClientError(error)) throw error;
        throw modelError("model_internal_error");
      } finally {
        try {
          clearTimer(timer);
        } catch (_) {
          throw modelError("model_internal_error");
        }
      }
    }
  });
}

module.exports = {
  ARK_RESPONSES_URL,
  DEFAULT_ARK_BASE_URL,
  DEFAULT_ARK_MODEL,
  MAX_MODEL_ANSWER_LENGTH,
  MAX_MODEL_RESPONSE_BYTES,
  MODEL_TIMEOUT_MS,
  ModelClientError,
  SERVER_INSTRUCTIONS,
  createArkModelClient,
  isTrustedModelClientError
};
