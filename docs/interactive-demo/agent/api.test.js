"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const {
  AGENT_CONTRACT_VERSION,
  AGENT_FORBIDDEN_FIELDS,
  AgentApiError,
  MAX_AGENT_ANSWER_LENGTH,
  MAX_AGENT_BODY_BYTES,
  MAX_AGENT_MESSAGE_LENGTH,
  createAgentApi
} = require("./api");

const EXPECTED_ORIGIN = "http://127.0.0.1:8888";
const NOW = Date.parse("2026-08-12T08:30:00.000Z");

function streamFrom(value, chunks) {
  const source = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  if (!chunks) return Readable.from([source]);
  const parts = [];
  for (let offset = 0; offset < source.length; offset += chunks) {
    parts.push(source.subarray(offset, offset + chunks));
  }
  return Readable.from(parts);
}

function deferredStream(events) {
  const stream = new EventEmitter();
  stream.resume = () => {};
  queueMicrotask(() => {
    for (const [name, value] of events) stream.emit(name, value);
  });
  return stream;
}

function harness(options = {}) {
  let contextReads = 0;
  let handlerCalls = 0;
  const received = [];
  const contexts = options.contexts || [
    { branch: "lab4-starter", commit: "abc1234" },
    { branch: "lab4-starter", commit: "abc1234" }
  ];
  const handleAgentRequest = options.useDefaultHandler
    ? undefined
    : async (input) => {
      handlerCalls += 1;
      received.push(input);
      if (typeof options.handler === "function") return options.handler(input);
      return { answer: "A safe fake answer." };
    };
  const api = createAgentApi({
    expectedOrigin: EXPECTED_ORIGIN,
    readWorkspaceContext() {
      const value = contexts[Math.min(contextReads, contexts.length - 1)];
      contextReads += 1;
      if (value instanceof Error) throw value;
      return value;
    },
    ...(handleAgentRequest ? { handleAgentRequest } : {}),
    requestIdFactory: options.requestIdFactory || (() => "agent-request-1"),
    now: () => NOW
  });

  async function requestRaw(rawBody, requestOptions = {}) {
    const headers = {
      origin: EXPECTED_ORIGIN,
      "content-type": "application/json",
      ...requestOptions.headers
    };
    for (const name of requestOptions.omitHeaders || []) delete headers[name];
    return api.handleHttpRequest({
      method: requestOptions.method || "POST",
      headers,
      body: requestOptions.stream || streamFrom(rawBody, requestOptions.chunkSize)
    });
  }

  return {
    api,
    contextReads: () => contextReads,
    handlerCalls: () => handlerCalls,
    received,
    requestRaw,
    requestJson: (body, requestOptions) => requestRaw(JSON.stringify(body), requestOptions)
  };
}

function assertError(result, statusCode, code) {
  assert.equal(result.statusCode, statusCode);
  assert.equal(result.body.contractVersion, AGENT_CONTRACT_VERSION);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.data, null);
  assert.equal(result.body.error.code, code);
  assert.equal(result.body.error.message.length > 0, true);
  assert.equal(result.body.meta.requestId, "agent-request-1");
}

test("valid input returns the stable Agent contract and trims the message", async () => {
  const instance = harness({
    handler({ message }) {
      assert.equal(message, "为什么 Lab4 失败？");
      return { answer: "  fake answer  " };
    }
  });
  const result = await instance.requestJson({ message: " \t为什么 Lab4 失败？\r\n" });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    contractVersion: AGENT_CONTRACT_VERSION,
    ok: true,
    data: { answer: "fake answer" },
    error: null,
    meta: {
      requestId: "agent-request-1",
      branch: "lab4-starter",
      commit: "abc1234",
      lab: "lab4",
      variant: "starter",
      generatedAt: "2026-08-12T08:30:00.000Z"
    }
  });
});

test("missing, empty, and whitespace-only messages return message_required", async () => {
  for (const body of [{}, { message: "" }, { message: " \t\r\n " }]) {
    const instance = harness();
    assertError(await instance.requestJson(body), 400, "message_required");
    assert.equal(instance.handlerCalls(), 0);
  }
});

test("non-string messages return invalid_agent_input", async () => {
  for (const message of [null, false, 0, {}, []]) {
    const instance = harness();
    assertError(await instance.requestJson({ message }), 400, "invalid_agent_input");
    assert.equal(instance.handlerCalls(), 0);
  }
});

test("null, arrays, and primitive JSON roots return invalid_agent_input", async () => {
  for (const value of [null, [], "message", 42, true]) {
    assertError(await harness().requestJson(value), 400, "invalid_agent_input");
  }
});

test("malformed JSON and an empty body return fixed invalid_json", async () => {
  for (const raw of ["", " ", "{", "{bad json}"]) {
    const result = await harness().requestRaw(raw);
    assertError(result, 400, "invalid_json");
    assert.doesNotMatch(JSON.stringify(result), /Unexpected|position|token/);
  }
});

test("invalid UTF-8 is rejected as invalid_json", async () => {
  const result = await harness().requestRaw(Buffer.from([0xc3, 0x28]));
  assertError(result, 400, "invalid_json");
});

test("the exact 16 KiB body boundary is read before message validation", async () => {
  const wrapperBytes = Buffer.byteLength('{"message":""}');
  const raw = `{"message":"${"x".repeat(MAX_AGENT_BODY_BYTES - wrapperBytes)}"}`;
  assert.equal(Buffer.byteLength(raw), MAX_AGENT_BODY_BYTES);
  assertError(await harness().requestRaw(raw), 400, "message_too_long");
});

test("a declared Content-Length over 16 KiB is rejected before reading", async () => {
  const instance = harness();
  const result = await instance.requestJson({ message: "hello" }, {
    headers: { "content-length": String(MAX_AGENT_BODY_BYTES + 1) }
  });
  assertError(result, 413, "request_too_large");
  assert.equal(instance.handlerCalls(), 0);
});

test("actual chunked bytes over 16 KiB are rejected", async () => {
  const raw = `{"message":"${"x".repeat(MAX_AGENT_BODY_BYTES)}"}`;
  const result = await harness().requestRaw(raw, { chunkSize: 257 });
  assertError(result, 413, "request_too_large");
});

test("a lying small Content-Length cannot bypass actual byte accounting", async () => {
  const raw = `{"message":"${"x".repeat(MAX_AGENT_BODY_BYTES)}"}`;
  const result = await harness().requestRaw(raw, {
    headers: { "content-length": "1" },
    chunkSize: 701
  });
  assertError(result, 413, "request_too_large");
});

test("only application/json with optional UTF-8 charset is accepted", async () => {
  for (const accepted of ["application/json", "Application/JSON", "application/json; charset=utf-8",
    "application/json; CHARSET = UTF-8"]) {
    const result = await harness().requestJson({ message: "hello" }, {
      headers: { "content-type": accepted }
    });
    assert.equal(result.statusCode, 200, accepted);
  }
  for (const rejected of [undefined, "text/plain", "application/json; charset=latin1",
    "application/json; charset=utf-8; extra=yes"]) {
    const instance = harness();
    const options = rejected === undefined
      ? { omitHeaders: ["content-type"] }
      : { headers: { "content-type": rejected } };
    assertError(await instance.requestJson({ message: "hello" }, options), 415,
      "unsupported_media_type");
    assert.equal(instance.handlerCalls(), 0);
  }
});

test("NUL, other C0 controls, and DEL are rejected", async () => {
  for (const message of ["a\u0000b", "a\u0001b", "a\u000bb", "a\u007fb"]) {
    assertError(await harness().requestJson({ message }), 400, "invalid_agent_input");
  }
});

test("newlines, carriage returns, and tabs remain allowed inside a message", async () => {
  const message = "line one\nline two\r\n\tindented";
  const instance = harness({ handler: ({ message: actual }) => ({ answer: actual }) });
  const result = await instance.requestJson({ message });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.answer, message);
});

test("message length accepts 4000 and rejects 4001 after trim", async () => {
  assert.equal((await harness().requestJson({ message: "x".repeat(MAX_AGENT_MESSAGE_LENGTH) })).statusCode,
    200);
  assertError(
    await harness().requestJson({ message: "x".repeat(MAX_AGENT_MESSAGE_LENGTH + 1) }),
    400,
    "message_too_long"
  );
});

test("ordinary unknown fields are rejected rather than ignored", async () => {
  const result = await harness().requestJson({ message: "hello", extra: true });
  assertError(result, 400, "invalid_agent_input");
  assert.deepEqual(result.body.error.details, { field: "extra" });
});

test("every protected field is explicitly rejected even for falsey values", async () => {
  const values = [null, "", false, 0];
  let index = 0;
  for (const field of AGENT_FORBIDDEN_FIELDS) {
    const instance = harness();
    const result = await instance.requestJson({
      message: "hello",
      [field]: values[index % values.length]
    });
    index += 1;
    assertError(result, 400, "agent_field_forbidden");
    assert.deepEqual(result.body.error.details, { field });
    assert.equal(instance.handlerCalls(), 0, field);
  }
});

test("method, Origin, and inbound Authorization policies are strict", async () => {
  const method = await harness().requestJson({ message: "hello" }, { method: "GET" });
  assertError(method, 405, "method_not_allowed");
  assert.deepEqual(method.headers, { Allow: "POST" });

  const missingOrigin = await harness().requestJson({ message: "hello" }, {
    omitHeaders: ["origin"]
  });
  assertError(missingOrigin, 403, "origin_not_allowed");

  const wrongOrigin = await harness().requestJson({ message: "hello" }, {
    headers: { origin: "http://localhost:8888" }
  });
  assertError(wrongOrigin, 403, "origin_not_allowed");

  const authorization = await harness().requestJson({ message: "hello" }, {
    headers: { authorization: "Bearer do-not-read-this" }
  });
  assertError(authorization, 403, "authorization_not_allowed");
  assert.doesNotMatch(JSON.stringify(authorization), /Bearer|do-not-read-this/);

  const authorizationWithoutOrigin = await harness().requestJson({ message: "hello" }, {
    headers: { authorization: "Bearer still-do-not-read" },
    omitHeaders: ["origin"]
  });
  assertError(authorizationWithoutOrigin, 403, "authorization_not_allowed");
  assert.doesNotMatch(JSON.stringify(authorizationWithoutOrigin), /Bearer|still-do-not-read/);
});

test("requestId and teaching context are server-owned and frozen", async () => {
  const instance = harness({
    requestIdFactory: () => "agent-server-owned",
    handler(input) {
      assert.deepEqual(Object.keys(input).sort(), ["invocationContext", "message"]);
      assert.deepEqual(Object.keys(input.invocationContext), [
        "requestId", "branch", "commit", "lab", "variant"
      ]);
      assert.equal(Object.isFrozen(input.invocationContext), true);
      assert.deepEqual(input.invocationContext, {
        requestId: "agent-server-owned",
        branch: "lab4-starter",
        commit: "abc1234",
        lab: "lab4",
        variant: "starter"
      });
      return { answer: "safe" };
    }
  });
  const result = await instance.requestJson({ message: "hello" });
  assert.equal(result.body.meta.requestId, "agent-server-owned");
  assert.equal(instance.contextReads(), 2);
  assert.deepEqual(Object.keys(instance.received[0]).sort(), ["invocationContext", "message"]);
});

test("custom branches remain server-owned contexts without inventing a lab", async () => {
  const instance = harness({
    contexts: [
      { branch: "agent-mvp", commit: "abc1234" },
      { branch: "agent-mvp", commit: "abc1234" }
    ]
  });
  const result = await instance.requestJson({ message: "hello" });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.meta.branch, "agent-mvp");
  assert.equal(result.body.meta.lab, null);
  assert.equal(result.body.meta.variant, "custom");
});

test("the production default handler honestly returns agent_not_configured", async () => {
  const instance = harness({ useDefaultHandler: true });
  const result = await instance.requestJson({ message: "hello" });
  assertError(result, 503, "agent_not_configured");
  assert.equal(result.body.error.message, "The agent is not configured.");
  assert.equal(instance.contextReads(), 1);
});

test("handler success accepts only one bounded answer string", async () => {
  const accepted = await harness({ handler: () => ({ answer: "x".repeat(MAX_AGENT_ANSWER_LENGTH) }) })
    .requestJson({ message: "hello" });
  assert.equal(accepted.statusCode, 200);
  assert.deepEqual(Object.keys(accepted.body.data), ["answer"]);

  for (const value of [
    null,
    {},
    { answer: 1 },
    { answer: "" },
    { answer: "safe", command: "bad" },
    { answer: "x".repeat(MAX_AGENT_ANSWER_LENGTH + 1) },
    { answer: "unsafe\u0000text" }
  ]) {
    const result = await harness({ handler: () => value }).requestJson({ message: "hello" });
    assertError(result, 500, "agent_internal_error");
    assert.doesNotMatch(JSON.stringify(result), /command|unsafe/);
  }
});

test("a branded AgentApiError is trusted but a lookalike object is not", async () => {
  const safe = await harness({
    handler: () => { throw new AgentApiError("agent_busy"); }
  }).requestJson({ message: "hello" });
  assertError(safe, 429, "agent_busy");
  assert.equal(safe.body.error.retryable, true);

  const fake = await harness({
    handler: () => { throw { code: "agent_busy", message: "trust me", details: { token: "secret" } }; }
  }).requestJson({ message: "hello" });
  assertError(fake, 500, "agent_internal_error");
  assert.doesNotMatch(JSON.stringify(fake), /trust me|token|secret/);
});

test("unknown handler exceptions are converted to one fixed path-free error", async () => {
  const unsafe = new Error("C:\\private\\repo token=secret outbound response body");
  unsafe.stack = "STACK C:\\private\\repo";
  unsafe.details = { env: { TOKEN: "secret" } };
  const result = await harness({ handler: () => { throw unsafe; } }).requestJson({ message: "hello" });
  assertError(result, 500, "agent_internal_error");
  assert.equal(result.body.error.message, "The agent request could not be completed.");
  assert.deepEqual(result.body.error.details, {});
  assert.doesNotMatch(JSON.stringify(result), /private|token|secret|STACK|outbound|TOKEN/);
});

test("unavailable or malformed real context returns context_unavailable", async () => {
  const unsafe = new Error("C:\\private\\repo API_KEY=secret");
  for (const contexts of [
    [unsafe],
    [null],
    [{ branch: "unknown", commit: "abc" }],
    [{ branch: "lab4-starter", commit: "unknown" }],
    [{ branch: "lab4-starter", commit: "bad\u0000commit" }]
  ]) {
    const result = await harness({ contexts }).requestJson({ message: "hello" });
    assertError(result, 503, "context_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /private|API_KEY|secret/);
  }
});

test("a branch or commit change after the handler discards its answer", async () => {
  for (const contexts of [
    [
      { branch: "lab4-starter", commit: "abc1234" },
      { branch: "lab4-solution", commit: "abc1234" }
    ],
    [
      { branch: "lab4-starter", commit: "abc1234" },
      { branch: "lab4-starter", commit: "def5678" }
    ]
  ]) {
    const result = await harness({ contexts, handler: () => ({ answer: "must be discarded" }) })
      .requestJson({ message: "hello" });
    assertError(result, 409, "context_changed");
    assert.equal(result.body.data, null);
    assert.doesNotMatch(JSON.stringify(result), /must be discarded/);
  }
});

test("aborted and errored bodies settle once with a fixed invalid_json failure", async () => {
  for (const events of [
    [["aborted"], ["error", new Error("C:\\secret")]],
    [["error", new Error("TOKEN=secret")], ["end"]]
  ]) {
    const instance = harness();
    const result = await instance.requestRaw("", { stream: deferredStream(events) });
    assertError(result, 400, "invalid_json");
    assert.equal(instance.handlerCalls(), 0);
    assert.doesNotMatch(JSON.stringify(result), /secret|TOKEN/);
  }
});

test("oversize followed by abort, error, and end still settles only once", async () => {
  const instance = harness();
  const stream = deferredStream([
    ["data", Buffer.alloc(MAX_AGENT_BODY_BYTES + 1, 0x78)],
    ["aborted"],
    ["error", new Error("late unsafe error")],
    ["end"]
  ]);
  const result = await instance.requestRaw("", { stream });
  assertError(result, 413, "request_too_large");
  assert.equal(instance.handlerCalls(), 0);
});

test("the Agent API module has no model, execution, Git mutation, or file-write path", () => {
  const source = fs.readFileSync(path.join(__dirname, "api.js"), "utf8");
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /\b(?:spawn|exec|execFile)(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|createWriteStream)(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /git\s+(?:checkout|switch|fetch|pull|reset|merge|commit|push)/i);
  assert.doesNotMatch(source, /ARK_API_KEY|ark-code-latest|volces|OpenAI|Anthropic|\/api\/plan/i);
  assert.doesNotMatch(source, /tool[ -]?calling[ -]?loop/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /SharedTaskLock|RunLifecycleManager|agentToolDispatch/);
});
