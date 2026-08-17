"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AGENT_CONSENT_KEY,
  AGENT_CONFIG_CONTRACT_VERSION,
  MAX_AGENT_MESSAGE_LENGTH,
  agentErrorMessage,
  clearAgentKey,
  configureAgentKey,
  getAgentConfig,
  hasAgentConsent,
  requestAgent,
  saveAgentConsent,
  validateAgentMessage
} = require("./agent-client");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key) ?? null
  };
}

test("consent uses only the fixed session storage key", () => {
  const storage = memoryStorage();
  assert.equal(hasAgentConsent(storage), false);
  assert.equal(saveAgentConsent(storage), true);
  assert.equal(storage.value(AGENT_CONSENT_KEY), "accepted");
  assert.equal(hasAgentConsent(storage), true);
});

test("message validation accepts 4000 and rejects 4001 characters", () => {
  assert.equal(MAX_AGENT_MESSAGE_LENGTH, 4000);
  assert.equal(validateAgentMessage("x".repeat(4000)).length, 4000);
  assert.throws(() => validateAgentMessage("x".repeat(4001)), (error) => error.code === "message_too_long");
  assert.throws(() => validateAgentMessage("   "), (error) => error.code === "message_required");
});

test("agent request sends exactly one message and validates the response contract", async () => {
  let captured;
  const result = await requestAgent("为什么没有出现任务切换？", {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        contractVersion: "os-tutor.agent/v1",
        ok: true,
        data: { answer: "先检查结构化事件。" },
        error: null,
        meta: { branch: "lab5-starter", lab: "lab5", variant: "starter" }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(captured.url, "/api/agent");
  assert.deepEqual(JSON.parse(captured.options.body), { message: "为什么没有出现任务切换？" });
  assert.equal(result.answer, "先检查结构化事件。");
});

test("dangerous HTML remains ordinary answer text", async () => {
  const result = await requestAgent("解释事件", {
    fetchImpl: async () => new Response(JSON.stringify({
      contractVersion: "os-tutor.agent/v1",
      ok: true,
      data: { answer: "<img src=x onerror=alert(1)>" },
      error: null,
      meta: {}
    }), { status: 200, headers: { "content-type": "application/json" } })
  });
  assert.equal(result.answer, "<img src=x onerror=alert(1)>");
});

function configResponse(configured, credentialSource) {
  return new Response(JSON.stringify({
    contractVersion: AGENT_CONFIG_CONTRACT_VERSION,
    ok: true,
    data: {
      configured,
      credentialSource,
      provider: "volcengine-ark-agent-plan",
      model: "ark-code-latest"
    },
    error: null
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("model configuration uses only the process-memory endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return configResponse(true, "session");
    return configResponse(false, "none");
  };
  assert.equal((await getAgentConfig({ fetchImpl })).configured, false);
  assert.equal((await configureAgentKey("ark-browser-test", { fetchImpl })).credentialSource, "session");
  assert.equal((await clearAgentKey({ fetchImpl })).configured, false);
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "POST", "DELETE"]);
  assert.deepEqual(JSON.parse(calls[1].options.body), { apiKey: "ark-browser-test" });
  assert.equal(calls[0].options.cache, "no-store");
});

test("configuration failures never echo provider bodies", async () => {
  await assert.rejects(configureAgentKey("bad", {
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      error: { code: "invalid_api_key", message: "provider secret detail" }
    }), { status: 400, headers: { "content-type": "application/json" } })
  }), (error) => {
    assert.equal(error.code, "invalid_api_key");
    assert.doesNotMatch(error.message, /provider|secret/);
    return true;
  });
});

test("all public failures map to fixed Chinese explanations", () => {
  for (const code of [
    "model_not_configured", "model_auth_failed", "model_rate_limited",
    "model_timeout", "run_busy", "context_changed", "model_unavailable",
    "agent_protocol_error", "agent_loop_limit", "agent_deadline_exceeded",
    "agent_tool_output_too_large", "invalid_api_key", "config_unavailable"
  ]) {
    assert.match(agentErrorMessage(code), /[\u4e00-\u9fff]/u);
  }
  assert.doesNotMatch(agentErrorMessage("unknown", "C:\\Users\\secret TOKEN=abc"), /Users|TOKEN|abc/);
});
