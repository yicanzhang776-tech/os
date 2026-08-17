"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");
const {
  AGENT_HANDOFF_CONTRACT_VERSION,
  HANDOFF_TTL_MS,
  MAX_HANDOFF_ENTRIES,
  createAgentHandoffApi,
  createAgentHandoffStore
} = require("./handoff-api");

function bodyStream(value) {
  return Readable.from([Buffer.isBuffer(value) ? value : Buffer.from(value)]);
}

function request(api, operation, value, overrides = {}) {
  return api.handleHttpRequest({
    method: "POST",
    operation,
    headers: {
      origin: "http://127.0.0.1:8888",
      "content-type": "application/json; charset=utf-8",
      ...overrides.headers
    },
    body: overrides.body || bodyStream(JSON.stringify(value))
  });
}

test("handoff store creates 128-bit one-time tokens and consumes once", () => {
  let marker = 0;
  const store = createAgentHandoffStore({
    now: () => 1000,
    randomBytes: () => Buffer.alloc(16, marker++)
  });
  const created = store.create("为什么要刷新 TLB？");
  assert.match(created.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(created.expiresAt, 1000 + HANDOFF_TTL_MS);
  assert.equal(store.consume(created.token), "为什么要刷新 TLB？");
  assert.equal(store.consume(created.token), null);
});

test("handoff store purges expired prompts and enforces the eight item cap", () => {
  let now = 5000;
  let marker = 1;
  const store = createAgentHandoffStore({
    now: () => now,
    randomBytes: () => Buffer.alloc(16, marker++)
  });
  for (let index = 0; index < MAX_HANDOFF_ENTRIES; index += 1) {
    assert.ok(store.create(`question-${index}`));
  }
  assert.equal(store.create("overflow"), null);
  now += HANDOFF_TTL_MS + 1;
  assert.equal(store.size(), 0);
  assert.ok(store.create("after-expiry"));
});

test("handoff API accepts bounded Chinese and never echoes it during creation", async () => {
  const store = createAgentHandoffStore({ randomBytes: () => Buffer.alloc(16, 7) });
  const api = createAgentHandoffApi({ expectedOrigin: "http://127.0.0.1:8888", store });
  const prompt = "页".repeat(4000);
  const created = await request(api, "create", { message: prompt });
  assert.equal(created.statusCode, 200);
  assert.equal(created.body.contractVersion, AGENT_HANDOFF_CONTRACT_VERSION);
  assert.equal(created.body.ok, true);
  assert.match(created.body.data.token, /^[A-Za-z0-9_-]{22}$/);
  assert.doesNotMatch(JSON.stringify(created.body), /页/u);

  const consumed = await request(api, "consume", { token: created.body.data.token });
  assert.equal(consumed.statusCode, 200);
  assert.equal(consumed.body.data.message, prompt);
  const repeated = await request(api, "consume", { token: created.body.data.token });
  assert.equal(repeated.statusCode, 404);
  assert.equal(repeated.body.error.code, "handoff_unavailable");
});

test("handoff API rejects origins, authorization, malformed UTF-8 and oversized prompts", async () => {
  const api = createAgentHandoffApi({
    expectedOrigin: "http://127.0.0.1:8888",
    store: createAgentHandoffStore()
  });
  const wrongOrigin = await request(api, "create", { message: "hello" }, {
    headers: { origin: "http://localhost:8888" }
  });
  assert.equal(wrongOrigin.statusCode, 403);
  assert.equal(wrongOrigin.body.error.code, "origin_not_allowed");

  const authorized = await request(api, "create", { message: "hello" }, {
    headers: { authorization: "Bearer browser-secret" }
  });
  assert.equal(authorized.statusCode, 403);
  assert.doesNotMatch(JSON.stringify(authorized.body), /Bearer|browser-secret/);

  const invalidUtf8 = await request(api, "create", {}, { body: bodyStream(Buffer.from([0xc3, 0x28])) });
  assert.equal(invalidUtf8.statusCode, 400);
  assert.equal(invalidUtf8.body.error.code, "invalid_json");

  const tooLong = await request(api, "create", { message: "x".repeat(4001) });
  assert.equal(tooLong.statusCode, 400);
  assert.equal(tooLong.body.error.code, "invalid_handoff");
});

test("handoff API rejects unknown fields and unsupported operations", async () => {
  const api = createAgentHandoffApi({
    expectedOrigin: "http://127.0.0.1:8888",
    store: createAgentHandoffStore()
  });
  const extra = await request(api, "create", { message: "hello", key: "secret" });
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.body.error.code, "invalid_handoff");
  assert.doesNotMatch(JSON.stringify(extra.body), /secret/);

  const unknown = await request(api, "unknown", {});
  assert.equal(unknown.statusCode, 400);
  assert.equal(unknown.body.error.code, "invalid_handoff");
});
