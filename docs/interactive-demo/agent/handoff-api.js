"use strict";

const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");

const AGENT_HANDOFF_CONTRACT_VERSION = "os-tutor.agent-handoff/v1";
const HANDOFF_TTL_MS = 120_000;
const MAX_HANDOFF_ENTRIES = 8;
const MAX_HANDOFF_BODY_BYTES = 16 * 1024;
const MAX_HANDOFF_MESSAGE_LENGTH = 4000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const FORBIDDEN_TEXT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

const ERRORS = Object.freeze({
  method_not_allowed: Object.freeze({ statusCode: 405, message: "Only POST is allowed." }),
  origin_not_allowed: Object.freeze({ statusCode: 403, message: "The request origin is not allowed." }),
  authorization_not_allowed: Object.freeze({ statusCode: 403, message: "Client authorization is not accepted by this endpoint." }),
  unsupported_media_type: Object.freeze({ statusCode: 415, message: "Content-Type must be application/json with optional UTF-8 charset." }),
  invalid_json: Object.freeze({ statusCode: 400, message: "The request body must contain valid JSON." }),
  request_too_large: Object.freeze({ statusCode: 413, message: "The request body exceeds the 16 KiB limit." }),
  invalid_handoff: Object.freeze({ statusCode: 400, message: "The handoff request is invalid." }),
  handoff_capacity: Object.freeze({ statusCode: 429, message: "Too many handoff prompts are pending." }),
  handoff_unavailable: Object.freeze({ statusCode: 404, message: "The handoff prompt is unavailable or expired." }),
  handoff_internal_error: Object.freeze({ statusCode: 500, message: "The handoff request could not be completed." })
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
  return parts.length === 0 || (parts.length === 1 && /^charset\s*=\s*utf-8$/i.test(parts[0]));
}

function readBody(stream) {
  return new Promise((resolve, reject) => {
    if (!stream || typeof stream.on !== "function") { reject(new Error("invalid_json")); return; }
    let total = 0;
    let settled = false;
    const chunks = [];
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
      if (total > MAX_HANDOFF_BODY_BYTES) {
        stream.resume?.();
        finish(new Error("request_too_large"));
        return;
      }
      chunks.push(buffer);
    });
    stream.once("end", () => {
      if (settled) return;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
        if (!text.trim()) throw new Error();
        finish(null, JSON.parse(text));
      } catch (_) { finish(new Error("invalid_json")); }
    });
    stream.once("aborted", () => finish(new Error("invalid_json")));
    stream.once("error", () => finish(new Error("invalid_json")));
  });
}

function validateMessage(value) {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message || message.length > MAX_HANDOFF_MESSAGE_LENGTH || FORBIDDEN_TEXT_CHARACTERS.test(message)) return null;
  return message;
}

function createAgentHandoffStore(options = {}) {
  const now = options.now || Date.now;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  if (typeof now !== "function" || typeof randomBytes !== "function") throw new TypeError("Handoff store dependencies are required.");
  const entries = new Map();

  function purge() {
    const timestamp = now();
    for (const [token, entry] of entries) if (entry.expiresAt <= timestamp) entries.delete(token);
  }

  function create(message) {
    purge();
    if (entries.size >= MAX_HANDOFF_ENTRIES) return null;
    let token;
    do { token = randomBytes(16).toString("base64url"); } while (entries.has(token));
    const expiresAt = now() + HANDOFF_TTL_MS;
    entries.set(token, Object.freeze({ message, expiresAt }));
    return Object.freeze({ token, expiresAt });
  }

  function consume(token) {
    purge();
    if (!TOKEN_PATTERN.test(token)) return null;
    const entry = entries.get(token);
    if (!entry) return null;
    entries.delete(token);
    return entry.message;
  }

  return Object.freeze({ create, consume, size: () => { purge(); return entries.size; } });
}

function response(ok, code, data = null) {
  const definition = ERRORS[code];
  return {
    statusCode: ok ? 200 : definition.statusCode,
    headers: !ok && code === "method_not_allowed" ? { Allow: "POST" } : {},
    body: {
      contractVersion: AGENT_HANDOFF_CONTRACT_VERSION,
      ok,
      data: ok ? data : null,
      error: ok ? null : { code, message: definition.message }
    }
  };
}

function createAgentHandoffApi(options = {}) {
  if (typeof options.expectedOrigin !== "string" || !options.expectedOrigin) throw new TypeError("expectedOrigin is required.");
  if (!options.store || typeof options.store.create !== "function" || typeof options.store.consume !== "function") {
    throw new TypeError("store is required.");
  }
  return Object.freeze({
    async handleHttpRequest(input = {}) {
      try {
        if (input.method !== "POST") return response(false, "method_not_allowed");
        if (headerValue(input.headers, "authorization") !== undefined) return response(false, "authorization_not_allowed");
        if (headerValue(input.headers, "origin") !== options.expectedOrigin) return response(false, "origin_not_allowed");
        if (!hasAcceptedContentType(input.headers)) return response(false, "unsupported_media_type");
        const declaredLength = Number(headerValue(input.headers, "content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_HANDOFF_BODY_BYTES) {
          input.body?.resume?.();
          return response(false, "request_too_large");
        }
        const parsed = await readBody(input.body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response(false, "invalid_handoff");
        if (input.operation === "create") {
          if (Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, "message")) return response(false, "invalid_handoff");
          const message = validateMessage(parsed.message);
          if (!message) return response(false, "invalid_handoff");
          const handoff = options.store.create(message);
          return handoff ? response(true, null, handoff) : response(false, "handoff_capacity");
        }
        if (input.operation === "consume") {
          if (Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, "token") || typeof parsed.token !== "string") {
            return response(false, "invalid_handoff");
          }
          const message = options.store.consume(parsed.token);
          return message ? response(true, null, { message }) : response(false, "handoff_unavailable");
        }
        return response(false, "invalid_handoff");
      } catch (error) {
        const code = Object.hasOwn(ERRORS, error?.message) ? error.message : "handoff_internal_error";
        return response(false, code);
      }
    }
  });
}

module.exports = {
  AGENT_HANDOFF_CONTRACT_VERSION,
  HANDOFF_TTL_MS,
  MAX_HANDOFF_BODY_BYTES,
  MAX_HANDOFF_ENTRIES,
  TOKEN_PATTERN,
  createAgentHandoffApi,
  createAgentHandoffStore,
  validateMessage
};
