"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  FEEDBACK_SUBMIT_PROTOCOL,
  normalizeFeedbackRecord,
  sanitizeText,
  validateFeedbackRecord
} = require("../docs/interactive-demo/feedback.js");
const {
  MAX_SUBMISSION_BYTES,
  RUN_SUBMIT_PROTOCOL,
  sanitizeRunRecordForSubmission
} = require("../docs/interactive-demo/run-submission.js");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8890;
const DEFAULT_DATA_DIR = "feedback-data";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RUN_BODY_BYTES = Math.min(512 * 1024, MAX_SUBMISSION_BYTES);
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://127.0.0.1:8888",
  "http://localhost:8888"
]);

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
}

function parseInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch (_) {
    throw new Error(`Invalid allowed origin: ${value}`);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password
    || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    throw new Error(`Invalid allowed origin: ${value}`);
  }
  return url.origin;
}

function parseArgs(argv = []) {
  const result = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    dataDir: path.resolve(DEFAULT_DATA_DIR),
    inviteCode: "",
    allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS]
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--host", "--port", "--data", "--invite-code", "--allow-origin"].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    index += 1;
    if (flag === "--host") result.host = value;
    if (flag === "--port") result.port = parseInteger(value, "--port", 1, 65535);
    if (flag === "--data") result.dataDir = path.resolve(value);
    if (flag === "--invite-code") result.inviteCode = sanitizeText(value, 128);
    if (flag === "--allow-origin") result.allowedOrigins.push(normalizeOrigin(value));
  }
  if (!isLoopbackHost(result.host)) {
    throw new Error("The feedback service must listen on a loopback host and be exposed only through an HTTPS tunnel.");
  }
  result.allowedOrigins = [...new Set(result.allowedOrigins.map(normalizeOrigin))];
  return result;
}

function safeEqual(left, right) {
  const first = Buffer.from(String(left || ""), "utf8");
  const second = Buffer.from(String(right || ""), "utf8");
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function canonicalHash(record) {
  return crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function createReceiptId(randomUUID = crypto.randomUUID) {
  return `RCPT-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function writeJson(response, statusCode, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": payload.length,
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(payload);
}

function corsHeaders(origin, allowedOrigins) {
  return origin && allowedOrigins.has(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : { Vary: "Origin" };
}

function requestSource(request) {
  const cloudflare = String(request.headers["cf-connecting-ip"] || "").trim();
  return cloudflare || request.socket.remoteAddress || "unknown";
}

function createRateLimiter(options = {}) {
  const maximum = options.maximum || 10;
  const windowMs = options.windowMs || 60_000;
  const entries = new Map();
  return function allow(source, now = Date.now()) {
    const recent = (entries.get(source) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= maximum) {
      entries.set(source, recent);
      return false;
    }
    recent.push(now);
    entries.set(source, recent);
    return true;
  };
}

function readRequestBody(request, maximumBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maximumBytes) {
        tooLarge = true;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error(`Request body exceeds ${Math.floor(maximumBytes / 1024)} KiB.`);
        error.code = "BODY_TOO_LARGE";
        reject(error);
      } else {
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
    request.on("aborted", () => reject(new Error("Request was aborted.")));
    request.on("error", reject);
  });
}

function parseStoredRunLine(line) {
  try {
    const stored = JSON.parse(line);
    if (stored?.storageVersion !== 1 || stored?.protocol !== RUN_SUBMIT_PROTOCOL
      || !stored.receiptId || Number.isNaN(Date.parse(stored.receivedAt))) return null;
    const run = sanitizeRunRecordForSubmission(stored.run);
    const feedbackId = sanitizeText(stored.feedbackId || "", 80) || null;
    return {
      storageVersion: 1,
      protocol: RUN_SUBMIT_PROTOCOL,
      receiptId: sanitizeText(stored.receiptId, 120),
      receivedAt: new Date(stored.receivedAt).toISOString(),
      contentHash: canonicalHash({ run, feedbackId }),
      feedbackId,
      run
    };
  } catch (_) {
    return null;
  }
}

function parseStoredLine(line) {
  try {
    const stored = JSON.parse(line);
    if (stored?.storageVersion !== 1 || stored?.protocol !== FEEDBACK_SUBMIT_PROTOCOL
      || !stored.receiptId || Number.isNaN(Date.parse(stored.receivedAt))) return null;
    const feedback = normalizeFeedbackRecord(stored.feedback);
    return {
      storageVersion: 1,
      protocol: FEEDBACK_SUBMIT_PROTOCOL,
      receiptId: sanitizeText(stored.receiptId, 120),
      receivedAt: new Date(stored.receivedAt).toISOString(),
      contentHash: canonicalHash(feedback),
      feedback
    };
  } catch (_) {
    return null;
  }
}

async function loadIndex(dataFile, fileApi = fs.promises) {
  const index = new Map();
  let content = "";
  try {
    content = await fileApi.readFile(dataFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const stored = parseStoredLine(line);
    if (stored && !index.has(stored.feedback.id)) index.set(stored.feedback.id, stored);
  }
  return index;
}

async function loadRunIndex(dataFile, fileApi = fs.promises) {
  const index = new Map();
  let content = "";
  try {
    content = await fileApi.readFile(dataFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const stored = parseStoredRunLine(line);
    if (stored && !index.has(stored.run.runId)) index.set(stored.run.runId, stored);
  }
  return index;
}

function createFeedbackService(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  if (!isLoopbackHost(host)) throw new Error("Feedback service host must be loopback.");
  if (port !== 0) parseInteger(port, "port", 1, 65535);
  const dataDir = path.resolve(options.dataDir || DEFAULT_DATA_DIR);
  const dataFile = path.join(dataDir, "feedback.jsonl");
  const runDataFile = path.join(dataDir, "runs.jsonl");
  const inviteCode = sanitizeText(options.inviteCode || "", 128);
  const allowedOrigins = new Set(
    (options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS).map(normalizeOrigin)
  );
  const fileApi = options.fileApi || fs.promises;
  const now = options.now || (() => new Date());
  const randomUUID = options.randomUUID || crypto.randomUUID;
  const rateLimit = createRateLimiter(options.rateLimit);
  let index = new Map();
  let runIndex = new Map();
  let writeQueue = Promise.resolve();

  const ready = (async () => {
    await fileApi.mkdir(dataDir, { recursive: true });
    index = await loadIndex(dataFile, fileApi);
    runIndex = await loadRunIndex(runDataFile, fileApi);
  })();

  async function storeFeedback(feedback) {
    const operation = writeQueue.then(async () => {
      const hash = canonicalHash(feedback);
      const existing = index.get(feedback.id);
      if (existing) {
        return existing.contentHash === hash
          ? { status: "duplicate", stored: existing }
          : { status: "conflict", stored: existing };
      }
      const stored = {
        storageVersion: 1,
        protocol: FEEDBACK_SUBMIT_PROTOCOL,
        receiptId: createReceiptId(randomUUID),
        receivedAt: now().toISOString(),
        contentHash: hash,
        feedback
      };
      await fileApi.appendFile(dataFile, `${JSON.stringify(stored)}\n`, "utf8");
      index.set(feedback.id, stored);
      return { status: "created", stored };
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function storeRunSubmission(run, feedbackId = null) {
    const operation = writeQueue.then(async () => {
      const hash = canonicalHash({ run, feedbackId });
      const existing = runIndex.get(run.runId);
      if (existing) {
        return existing.contentHash === hash
          ? { status: "duplicate", stored: existing }
          : { status: "conflict", stored: existing };
      }
      const stored = {
        storageVersion: 1,
        protocol: RUN_SUBMIT_PROTOCOL,
        receiptId: createReceiptId(randomUUID).replace("RCPT-", "RUN-RCPT-"),
        receivedAt: now().toISOString(),
        contentHash: hash,
        feedbackId,
        run
      };
      await fileApi.appendFile(runDataFile, `${JSON.stringify(stored)}\n`, "utf8");
      runIndex.set(run.runId, stored);
      return { status: "created", stored };
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  const server = http.createServer(async (request, response) => {
    await ready;
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const origin = String(request.headers.origin || "");
    const cors = corsHeaders(origin, allowedOrigins);

    if (requestUrl.pathname === "/health" && request.method === "GET") {
      writeJson(response, 200, { ok: true });
      return;
    }

    const submissionPath = ["/api/feedback", "/api/run-record"].includes(requestUrl.pathname);
    if (submissionPath && request.method === "OPTIONS") {
      if (!origin || !allowedOrigins.has(origin)) {
        writeJson(response, 403, { ok: false, error: "Origin is not allowed." }, cors);
        return;
      }
      response.writeHead(204, {
        ...cors,
        "Access-Control-Allow-Headers": "Content-Type, X-Feedback-Invite",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "600"
      });
      response.end();
      return;
    }

    if (!submissionPath || request.method !== "POST") {
      writeJson(response, 404, { ok: false, error: "Not found." });
      return;
    }
    if (origin && !allowedOrigins.has(origin)) {
      writeJson(response, 403, { ok: false, error: "Origin is not allowed." }, cors);
      return;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers["content-type"] || ""))) {
      writeJson(response, 415, { ok: false, error: "Content-Type must be application/json." }, cors);
      return;
    }
    if (inviteCode && !safeEqual(request.headers["x-feedback-invite"], inviteCode)) {
      writeJson(response, 403, { ok: false, error: "Invite code is invalid." }, cors);
      return;
    }
    if (!rateLimit(requestSource(request))) {
      writeJson(response, 429, { ok: false, error: "Too many submissions. Try again later." }, cors);
      return;
    }

    let body;
    try {
      body = await readRequestBody(
        request,
        requestUrl.pathname === "/api/run-record" ? MAX_RUN_BODY_BYTES : MAX_BODY_BYTES
      );
    } catch (error) {
      const status = error.code === "BODY_TOO_LARGE" ? 413 : 400;
      writeJson(response, status, { ok: false, error: error.message }, cors);
      return;
    }
    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch (_) {
      writeJson(response, 400, { ok: false, error: "Request body is not valid JSON." }, cors);
      return;
    }

    if (requestUrl.pathname === "/api/run-record") {
      if (envelope?.protocol !== RUN_SUBMIT_PROTOCOL) {
        writeJson(response, 400, { ok: false, code: "unsupported_submit_protocol", error: "Unsupported run submission protocol." }, cors);
        return;
      }
      let run;
      try {
        run = sanitizeRunRecordForSubmission(envelope.run);
      } catch (error) {
        writeJson(response, 422, {
          ok: false,
          code: error.code || "incompatible",
          error: sanitizeText(error.message, 500) || "Run record is incompatible."
        }, cors);
        return;
      }
      const feedbackId = sanitizeText(envelope.feedbackId || "", 80) || null;
      if (feedbackId && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(feedbackId)) {
        writeJson(response, 422, { ok: false, code: "invalid_feedback_id", error: "feedbackId is invalid." }, cors);
        return;
      }
      let result;
      try {
        result = await storeRunSubmission(run, feedbackId);
      } catch (_) {
        writeJson(response, 500, { ok: false, error: "Run record could not be saved." }, cors);
        return;
      }
      if (result.status === "conflict") {
        writeJson(response, 409, {
          ok: false,
          status: "conflict",
          runId: run.runId,
          error: "The same run id already has different content."
        }, cors);
        return;
      }
      writeJson(response, result.status === "created" ? 201 : 200, {
        ok: true,
        status: result.status,
        runId: run.runId,
        receiptId: result.stored.receiptId,
        receivedAt: result.stored.receivedAt
      }, cors);
      return;
    }

    if (envelope?.protocol !== FEEDBACK_SUBMIT_PROTOCOL) {
      writeJson(response, 400, { ok: false, error: "Unsupported feedback protocol." }, cors);
      return;
    }
    const validationErrors = validateFeedbackRecord(envelope.feedback);
    if (validationErrors.length) {
      writeJson(response, 422, { ok: false, error: validationErrors.join("；") }, cors);
      return;
    }

    let feedback;
    try {
      feedback = normalizeFeedbackRecord(envelope.feedback);
    } catch (error) {
      writeJson(response, 422, { ok: false, error: error.message }, cors);
      return;
    }
    let result;
    try {
      result = await storeFeedback(feedback);
    } catch (_) {
      writeJson(response, 500, { ok: false, error: "Feedback could not be saved." }, cors);
      return;
    }
    if (result.status === "conflict") {
      writeJson(response, 409, {
        ok: false,
        status: "conflict",
        feedbackId: feedback.id,
        error: "The same feedback id already has different content."
      }, cors);
      return;
    }
    writeJson(response, result.status === "created" ? 201 : 200, {
      ok: true,
      status: result.status,
      feedbackId: feedback.id,
      receiptId: result.stored.receiptId,
      receivedAt: result.stored.receivedAt
    }, cors);
  });

  async function listen() {
    await ready;
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve(server.address());
      });
    });
  }

  async function close() {
    if (!server.listening) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  return Object.freeze({ server, listen, close, ready, dataDir, dataFile, runDataFile });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const service = createFeedbackService(options);
  const address = await service.listen();
  console.log(`[feedback] Listening on http://${options.host}:${address.port}`);
  console.log(`[feedback] Writing JSONL records under ${options.dataDir}`);
  console.log("[feedback] Only /health, /api/feedback and /api/run-record are available on this port.");
  const shutdown = () => service.close().finally(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[feedback] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_HOST,
  DEFAULT_PORT,
  MAX_BODY_BYTES,
  MAX_RUN_BODY_BYTES,
  canonicalHash,
  createFeedbackService,
  createRateLimiter,
  loadIndex,
  loadRunIndex,
  normalizeOrigin,
  parseArgs,
  parseStoredLine,
  parseStoredRunLine,
  readRequestBody,
  safeEqual
});
