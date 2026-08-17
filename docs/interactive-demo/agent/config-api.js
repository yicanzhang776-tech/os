"use strict";

const { TextDecoder } = require("node:util");
const { MAX_API_KEY_LENGTH, normalizeApiKey } = require("./runtime");

const AGENT_CONFIG_CONTRACT_VERSION = "os-tutor.agent-config/v1";
const MAX_CONFIG_BODY_BYTES = 8 * 1024;
const trustedConfigErrors = new WeakSet();

const ERRORS = Object.freeze({
  method_not_allowed: Object.freeze({
    statusCode: 405,
    message: "Only GET, POST, and DELETE are allowed."
  }),
  origin_not_allowed: Object.freeze({
    statusCode: 403,
    message: "The request origin is not allowed."
  }),
  authorization_not_allowed: Object.freeze({
    statusCode: 403,
    message: "Client authorization is not accepted by this endpoint."
  }),
  unsupported_media_type: Object.freeze({
    statusCode: 415,
    message: "Content-Type must be application/json with optional UTF-8 charset."
  }),
  invalid_json: Object.freeze({
    statusCode: 400,
    message: "The request body must contain valid JSON."
  }),
  request_too_large: Object.freeze({
    statusCode: 413,
    message: "The request body exceeds the 8 KiB limit."
  }),
  invalid_api_key: Object.freeze({
    statusCode: 400,
    message: "The API key is invalid."
  }),
  config_internal_error: Object.freeze({
    statusCode: 500,
    message: "The model configuration could not be updated."
  })
});

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

function hasAcceptedContentType(headers) {
  const value = headerValue(headers, "content-type");
  if (typeof value !== "string") return false;
  const parts = value.split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "application/json") return false;
  return parts.length === 0
    || (parts.length === 1 && /^charset\s*=\s*utf-8$/i.test(parts[0]));
}

function configError(code) {
  const error = new Error(ERRORS[code]?.message || ERRORS.config_internal_error.message);
  error.code = Object.hasOwn(ERRORS, code) ? code : "config_internal_error";
  trustedConfigErrors.add(error);
  return error;
}

function readBody(stream) {
  if (!stream || typeof stream.on !== "function") {
    return Promise.reject(configError("invalid_json"));
  }
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    stream.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      total += buffer.length;
      if (total > MAX_CONFIG_BODY_BYTES) {
        stream.resume?.();
        finish(configError("request_too_large"));
        return;
      }
      chunks.push(buffer);
    });
    stream.once("end", () => {
      if (settled) return;
      try {
        const text = new TextDecoder("utf-8", { fatal: true })
          .decode(Buffer.concat(chunks, total));
        if (!text.trim()) throw new Error();
        finish(null, JSON.parse(text));
      } catch (_) {
        finish(configError("invalid_json"));
      }
    });
    stream.once("aborted", () => finish(configError("invalid_json")));
    stream.once("error", () => finish(configError("invalid_json")));
  });
}

function safeCapabilities(value) {
  if (!value || typeof value !== "object") throw new Error("invalid capabilities");
  const source = ["none", "environment", "session"].includes(value.credentialSource)
    ? value.credentialSource
    : "none";
  return {
    configured: value.configured === true,
    credentialSource: value.configured === true ? source : "none",
    provider: typeof value.provider === "string" ? value.provider : "unknown",
    model: typeof value.model === "string" ? value.model : "unknown"
  };
}

function success(data) {
  return {
    statusCode: 200,
    headers: {},
    body: {
      contractVersion: AGENT_CONFIG_CONTRACT_VERSION,
      ok: true,
      data: safeCapabilities(data),
      error: null
    }
  };
}

function failure(code) {
  const safeCode = Object.hasOwn(ERRORS, code) ? code : "config_internal_error";
  const definition = ERRORS[safeCode];
  return {
    statusCode: definition.statusCode,
    headers: safeCode === "method_not_allowed" ? { Allow: "GET, POST, DELETE" } : {},
    body: {
      contractVersion: AGENT_CONFIG_CONTRACT_VERSION,
      ok: false,
      data: null,
      error: { code: safeCode, message: definition.message }
    }
  };
}

function validateConfigBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, "apiKey")) return null;
  return normalizeApiKey(value.apiKey);
}

function createAgentConfigApi(options = {}) {
  if (typeof options.expectedOrigin !== "string" || !options.expectedOrigin) {
    throw new TypeError("expectedOrigin is required.");
  }
  for (const name of ["getCapabilities", "configureSessionApiKey", "clearSessionApiKey"]) {
    if (typeof options[name] !== "function") throw new TypeError(`${name} is required.`);
  }

  return Object.freeze({
    async handleHttpRequest(input = {}) {
      try {
        if (!["GET", "POST", "DELETE"].includes(input.method)) {
          return failure("method_not_allowed");
        }
        if (headerValue(input.headers, "authorization") !== undefined) {
          return failure("authorization_not_allowed");
        }
        if (input.method === "GET") return success(options.getCapabilities());
        if (headerValue(input.headers, "origin") !== options.expectedOrigin) {
          return failure("origin_not_allowed");
        }
        if (input.method === "DELETE") return success(options.clearSessionApiKey());
        if (!hasAcceptedContentType(input.headers)) return failure("unsupported_media_type");
        const declaredLength = Number(headerValue(input.headers, "content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_CONFIG_BODY_BYTES) {
          input.body?.resume?.();
          return failure("request_too_large");
        }
        const parsed = await readBody(input.body);
        const key = validateConfigBody(parsed);
        if (!key || key.length > MAX_API_KEY_LENGTH) return failure("invalid_api_key");
        const capabilities = options.configureSessionApiKey(key);
        return capabilities ? success(capabilities) : failure("invalid_api_key");
      } catch (error) {
        return failure(trustedConfigErrors.has(error) ? error.code : "config_internal_error");
      }
    }
  });
}

module.exports = {
  AGENT_CONFIG_CONTRACT_VERSION,
  MAX_CONFIG_BODY_BYTES,
  createAgentConfigApi,
  validateConfigBody
};
