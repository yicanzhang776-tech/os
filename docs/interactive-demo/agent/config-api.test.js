"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");
const { createAgentConfigApi } = require("./config-api");

const ORIGIN = "http://127.0.0.1:8888";

function capabilities(configured = false, source = "none") {
  return {
    configured,
    credentialSource: source,
    provider: "volcengine-ark-agent-plan",
    model: "ark-code-latest"
  };
}

function harness() {
  let configuredKey = null;
  const api = createAgentConfigApi({
    expectedOrigin: ORIGIN,
    getCapabilities: () => capabilities(Boolean(configuredKey), configuredKey ? "session" : "none"),
    configureSessionApiKey: (key) => {
      configuredKey = key;
      return capabilities(true, "session");
    },
    clearSessionApiKey: () => {
      configuredKey = null;
      return capabilities();
    }
  });
  return { api, key: () => configuredKey };
}

function request(method, body, headers = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}),
      ...(method === "DELETE" ? { origin: ORIGIN } : {}),
      ...headers
    },
    body: Readable.from([text])
  };
}

test("GET reports only safe model capability metadata", async () => {
  const h = harness();
  const result = await h.api.handleHttpRequest(request("GET"));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.contractVersion, "os-tutor.agent-config/v1");
  assert.deepEqual(result.body.data, capabilities());
});

test("POST stores a session key without returning it and DELETE clears it", async () => {
  const h = harness();
  const secret = "ark-session-secret";
  const configured = await h.api.handleHttpRequest(request("POST", { apiKey: secret }));
  assert.equal(configured.statusCode, 200);
  assert.equal(configured.body.data.credentialSource, "session");
  assert.equal(h.key(), secret);
  assert.doesNotMatch(JSON.stringify(configured), new RegExp(secret));

  const cleared = await h.api.handleHttpRequest(request("DELETE"));
  assert.equal(cleared.statusCode, 200);
  assert.equal(cleared.body.data.configured, false);
  assert.equal(h.key(), null);
});

test("configuration mutation requires exact local Origin and rejects Authorization", async () => {
  const h = harness();
  for (const input of [
    request("POST", { apiKey: "valid" }, { origin: "http://evil.example" }),
    request("DELETE", undefined, { origin: "http://evil.example" })
  ]) {
    const result = await h.api.handleHttpRequest(input);
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.error.code, "origin_not_allowed");
  }
  const authorization = await h.api.handleHttpRequest(request("GET", undefined, {
    authorization: "Bearer must-not-be-accepted"
  }));
  assert.equal(authorization.statusCode, 403);
  assert.equal(authorization.body.error.code, "authorization_not_allowed");
});

test("configuration input is exact, bounded JSON", async () => {
  const h = harness();
  for (const body of [null, {}, { apiKey: "" }, { apiKey: "bad key" }, {
    apiKey: "valid", extra: true
  }]) {
    const result = await h.api.handleHttpRequest(request("POST", body));
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.error.code, "invalid_api_key");
  }
  const wrongType = await h.api.handleHttpRequest(request("POST", { apiKey: "valid" }, {
    "content-type": "text/plain"
  }));
  assert.equal(wrongType.statusCode, 415);
});
