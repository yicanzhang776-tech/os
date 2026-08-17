"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TOOL_SCHEMA_NAMES } = require("./tool-schemas");
const { createAgentRuntime, normalizeApiKey } = require("./runtime");

const CONTEXT = Object.freeze({
  requestId: "agent-runtime-1",
  branch: "lab1-starter",
  commit: "abc1234",
  lab: "lab1",
  variant: "starter"
});

function dispatch() {
  return Object.fromEntries(TOOL_SCHEMA_NAMES.map((name) => [name, () => ({
    contractVersion: "os-tutor.tool/v1",
    tool: name,
    ok: true,
    data: { observed: true },
    error: null,
    meta: { requestId: CONTEXT.requestId, branch: CONTEXT.branch, commit: CONTEXT.commit }
  })]));
}

function modelResponse(text) {
  return new Response(JSON.stringify({
    id: "resp-runtime",
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }]
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function runtime(options = {}) {
  return createAgentRuntime({
    fetchImpl: options.fetchImpl || (async () => modelResponse("ok")),
    environmentApiKey: options.environmentApiKey,
    toolDispatch: dispatch(),
    readContext: () => ({ branch: CONTEXT.branch, commit: CONTEXT.commit })
  });
}

test("runtime accepts only bounded whitespace-free process credentials", () => {
  assert.equal(normalizeApiKey("  ark-test-key  "), "ark-test-key");
  for (const value of [null, "", "bad key", "bad\nkey", "x".repeat(4097)]) {
    assert.equal(normalizeApiKey(value), null);
  }
});

test("a session key overrides environment configuration and clearing restores it", () => {
  const value = runtime({ environmentApiKey: "environment-key" });
  assert.equal(value.getCapabilities().credentialSource, "environment");
  assert.equal(value.configureSessionApiKey("session-key").credentialSource, "session");
  assert.equal(value.clearSessionApiKey().credentialSource, "environment");
});

test("a page-provided key is snapshotted for one agent request without being exposed", async () => {
  let authorization;
  const value = runtime({
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return modelResponse("已观察当前实验。");
    }
  });
  assert.equal(value.getCapabilities().configured, false);
  const capabilities = value.configureSessionApiKey("session-secret-key");
  assert.deepEqual(Object.keys(capabilities).sort(), [
    "configured", "contractVersion", "credentialSource", "model", "provider", "remoteStore"
  ]);
  assert.doesNotMatch(JSON.stringify(capabilities), /session-secret-key/);
  const result = await value.handleAgentRequest({
    message: "当前是什么实验？",
    invocationContext: CONTEXT
  });
  assert.deepEqual(result, { answer: "已观察当前实验。" });
  assert.equal(authorization, "Bearer session-secret-key");
  assert.equal(value.clearSessionApiKey().configured, false);
});

test("invalid page credentials never replace a working session key", () => {
  const value = runtime();
  assert.equal(value.configureSessionApiKey("valid-key").configured, true);
  assert.equal(value.configureSessionApiKey("bad key"), null);
  assert.equal(value.getCapabilities().credentialSource, "session");
});
