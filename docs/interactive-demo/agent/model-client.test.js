"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
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
} = require("./model-client");

const FAKE_KEY = "fake-test-key-123";
const REQUEST = Object.freeze({ message: "Why did the page fault repeat?", requestId: "agent-test-1" });

function jsonResponse(value, options = {}) {
  const body = options.raw === true ? value : JSON.stringify(value);
  return new Response(body, {
    status: options.status || 200,
    headers: { "content-type": options.contentType || "application/json; charset=utf-8" }
  });
}

function modelOutput(...parts) {
  return {
    output: [{
      type: "message",
      role: "assistant",
      content: parts.map((text) => ({ type: "output_text", text }))
    }]
  };
}

function clientWith(fetchImpl, options = {}) {
  return createArkModelClient({
    fetchImpl,
    apiKeyProvider: options.apiKeyProvider || (() => FAKE_KEY),
    ...(Object.hasOwn(options, "baseUrl") ? { baseUrl: options.baseUrl } : {}),
    ...(Object.hasOwn(options, "model") ? { model: options.model } : {}),
    ...(Object.hasOwn(options, "timeoutMs") ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.setTimer ? { setTimer: options.setTimer } : {}),
    ...(options.clearTimer ? { clearTimer: options.clearTimer } : {})
  });
}

async function expectModelError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(isTrustedModelClientError(error), true);
    assert.equal(error.code, code);
    assert.deepEqual(error.details, {});
    return true;
  });
}

test("the fixed request uses Agent Plan Responses with server-owned text-only input", async () => {
  let captured;
  const client = clientWith(async (...args) => {
    captured = args;
    return jsonResponse(modelOutput("  teaching answer  "));
  });
  assert.equal(await client.respond(REQUEST), "teaching answer");
  assert.equal(captured[0], ARK_RESPONSES_URL);
  assert.equal(captured[1].method, "POST");
  assert.equal(captured[1].headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(captured[1].headers["Content-Type"], "application/json");
  assert.equal(captured[1].signal instanceof AbortSignal, true);

  const body = JSON.parse(captured[1].body);
  assert.deepEqual(Object.keys(body).sort(), ["input", "instructions", "model", "stream"]);
  assert.equal(body.model, DEFAULT_ARK_MODEL);
  assert.equal(body.instructions, SERVER_INSTRUCTIONS);
  assert.equal(body.input, REQUEST.message);
  assert.equal(body.stream, false);
  assert.equal(body.instructions.includes(REQUEST.message), false);
  assert.equal(JSON.stringify(body).includes(FAKE_KEY), false);
  assert.equal(Object.hasOwn(body, "tools"), false);
  assert.equal(Object.hasOwn(body, "tool_choice"), false);
  assert.doesNotMatch(JSON.stringify(body), /run_test|read_code|get_context|get_code_diff|get_qemu_events|get_run_result/);
});

test("the API key provider is read exactly once during client initialization", async () => {
  let providerCalls = 0;
  let fetchCalls = 0;
  const client = clientWith(async () => {
    fetchCalls += 1;
    return jsonResponse(modelOutput("ok"));
  }, {
    apiKeyProvider() {
      providerCalls += 1;
      return `  ${FAKE_KEY}  `;
    }
  });
  assert.equal(providerCalls, 1);
  assert.deepEqual(Object.keys(client), ["respond"]);
  assert.equal(await client.respond(REQUEST), "ok");
  assert.equal(await client.respond(REQUEST), "ok");
  assert.equal(providerCalls, 1);
  assert.equal(fetchCalls, 2);
});

test("missing and invalid API keys fail closed without fetch", async (t) => {
  const invalidValues = [
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["internal whitespace", "bad key"],
    ["control character", "bad\nkey"],
    ["too long", "x".repeat(4097)]
  ];
  for (const [name, value] of invalidValues) {
    await t.test(name, async () => {
      let fetchCalls = 0;
      const client = clientWith(async () => {
        fetchCalls += 1;
        return jsonResponse(modelOutput("unexpected"));
      }, { apiKeyProvider: () => value });
      await expectModelError(client.respond(REQUEST), "model_not_configured");
      assert.equal(fetchCalls, 0);
    });
  }
});

test("base URL, model, and timeout overrides are exact fail-closed settings", async (t) => {
  const cases = [
    ["empty base", { baseUrl: "" }],
    ["generic v3", { baseUrl: "https://ark.cn-beijing.volces.com/api/v3" }],
    ["coding v3", { baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" }],
    ["http", { baseUrl: "http://ark.cn-beijing.volces.com/api/plan/v3" }],
    ["localhost", { baseUrl: "http://localhost:8888" }],
    ["wrong model", { model: "another-model" }],
    ["changed timeout", { timeoutMs: MODEL_TIMEOUT_MS - 1 }]
  ];
  for (const [name, options] of cases) {
    await t.test(name, async () => {
      let fetchCalls = 0;
      const client = clientWith(async () => {
        fetchCalls += 1;
        return jsonResponse(modelOutput("unexpected"));
      }, options);
      await expectModelError(client.respond(REQUEST), "model_not_configured");
      assert.equal(fetchCalls, 0);
    });
  }

  const exact = clientWith(
    async () => jsonResponse(modelOutput("ok")),
    { baseUrl: ` ${DEFAULT_ARK_BASE_URL} `, model: ` ${DEFAULT_ARK_MODEL} `, timeoutMs: MODEL_TIMEOUT_MS }
  );
  assert.equal(await exact.respond(REQUEST), "ok");
});

test("assistant output_text is joined in order while reasoning stays hidden", async () => {
  const client = clientWith(async () => jsonResponse({
    output: [
      { type: "reasoning", summary: [{ type: "summary_text", text: "hidden chain" }] },
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "first\n" },
          { type: "output_text", text: "second" }
        ]
      }
    ]
  }));
  const answer = await client.respond(REQUEST);
  assert.equal(answer, "first\nsecond");
  assert.doesNotMatch(answer, /hidden chain/);
});

test("malformed, empty, oversized, and control-character answers are rejected", async (t) => {
  const cases = [
    ["missing output", {}],
    ["empty output", { output: [] }],
    ["empty text", modelOutput("   ")],
    ["wrong root", []],
    ["wrong role", { output: [{ type: "message", role: "user", content: [] }] }],
    ["wrong content", { output: [{ type: "message", role: "assistant", content: [{ type: "input_text", text: "x" }] }] }],
    ["too long", modelOutput("x".repeat(MAX_MODEL_ANSWER_LENGTH + 1))],
    ["control", modelOutput("bad\u0000answer")]
  ];
  for (const [name, body] of cases) {
    await t.test(name, () => expectModelError(
      clientWith(async () => jsonResponse(body)).respond(REQUEST),
      "model_invalid_response"
    ));
  }
});

test("tool, function, computer, or action output invalidates the complete response", async (t) => {
  const actionItems = [
    { type: "function_call", name: "read_code" },
    { type: "tool_call", name: "run_test" },
    { type: "computer_action", action: "click" },
    { type: "action", name: "shell" }
  ];
  for (const action of actionItems) {
    await t.test(action.type, async () => {
      const body = { output: [
        ...modelOutput("must be discarded").output,
        action
      ] };
      await expectModelError(
        clientWith(async () => jsonResponse(body)).respond(REQUEST),
        "model_invalid_response"
      );
    });
  }
});

test("success requires bounded UTF-8 JSON and a JSON Content-Type", async (t) => {
  const cases = [
    ["malformed JSON", jsonResponse("{", { raw: true })],
    ["HTML type", jsonResponse(modelOutput("no"), { contentType: "text/html" })],
    ["invalid UTF-8", new Response(Buffer.from([0xff]), { headers: { "content-type": "application/json" } })],
    ["oversized", new Response(Buffer.alloc(MAX_MODEL_RESPONSE_BYTES + 1, 0x20), { headers: { "content-type": "application/json" } })]
  ];
  for (const [name, response] of cases) {
    await t.test(name, () => expectModelError(
      clientWith(async () => response).respond(REQUEST),
      "model_invalid_response"
    ));
  }
});

test("HTTP statuses map to fixed safe errors with one fetch and no retry", async (t) => {
  const cases = [
    [400, "model_request_failed"],
    [401, "model_auth_failed"],
    [403, "model_auth_failed"],
    [429, "model_rate_limited"],
    [500, "model_upstream_error"]
  ];
  for (const [status, code] of cases) {
    await t.test(String(status), async () => {
      let calls = 0;
      const client = clientWith(async () => {
        calls += 1;
        return jsonResponse({ secret: FAKE_KEY }, { status });
      });
      await expectModelError(client.respond(REQUEST), code);
      assert.equal(calls, 1);
    });
  }
});

test("network rejection is sanitized as model_unavailable without retry", async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    throw new Error(`Authorization: Bearer ${FAKE_KEY} C:\\private\\response`);
  });
  let caught;
  try {
    await client.respond(REQUEST);
  } catch (error) {
    caught = error;
  }
  assert.equal(caught.code, "model_unavailable");
  assert.equal(calls, 1);
  assert.doesNotMatch(`${JSON.stringify(caught)}\n${caught.stack}`, /fake-test-key|Authorization|private|response/);
});

test("the local timer aborts once, wins against a late response, and is cleared", async () => {
  let fireTimer;
  let cleared;
  let capturedSignal;
  let resolveFetch;
  let fetchCalls = 0;
  const lateFetch = new Promise((resolve) => { resolveFetch = resolve; });
  const client = clientWith((_, options) => {
    fetchCalls += 1;
    capturedSignal = options.signal;
    return lateFetch;
  }, {
    setTimer(callback, delay) {
      assert.equal(delay, MODEL_TIMEOUT_MS);
      fireTimer = callback;
      return "timer-token";
    },
    clearTimer(token) {
      cleared = token;
    }
  });

  const pending = client.respond(REQUEST);
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
  fireTimer();
  await expectModelError(pending, "model_timeout");
  assert.equal(capturedSignal.aborted, true);
  assert.equal(cleared, "timer-token");
  resolveFetch(jsonResponse(modelOutput("late answer")));
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
});

test("the local timeout also bounds a response body that never completes", async () => {
  let fireTimer;
  let cleared = false;
  let capturedSignal;
  const response = new Response(new ReadableStream({ start() {} }), {
    headers: { "content-type": "application/json" }
  });
  const client = clientWith(async (_, options) => {
    capturedSignal = options.signal;
    return response;
  }, {
    setTimer(callback) {
      fireTimer = callback;
      return "body-timer";
    },
    clearTimer(token) {
      assert.equal(token, "body-timer");
      cleared = true;
    }
  });
  const pending = client.respond(REQUEST);
  await Promise.resolve();
  await Promise.resolve();
  fireTimer();
  await expectModelError(pending, "model_timeout");
  assert.equal(capturedSignal.aborted, true);
  assert.equal(cleared, true);
});

test("an AbortError without the local timer is model_unavailable, not a timeout", async () => {
  const error = new Error("not a local timeout");
  error.name = "AbortError";
  await expectModelError(
    clientWith(async () => { throw error; }).respond(REQUEST),
    "model_unavailable"
  );
});

test("ModelClientError trust uses a private brand, not shape or prototype", () => {
  const real = new ModelClientError("model_timeout");
  const fake = { code: real.code, message: real.message, details: {} };
  const prototypeSpoof = Object.create(ModelClientError.prototype);
  prototypeSpoof.code = "model_timeout";
  assert.equal(isTrustedModelClientError(real), true);
  assert.equal(isTrustedModelClientError(fake), false);
  assert.equal(isTrustedModelClientError(prototypeSpoof), false);
  assert.equal(isTrustedModelClientError(Object.create(real)), false);
});

test("key, prompt, answer, headers, and upstream data are never logged or stored in errors", async () => {
  const original = { log: console.log, error: console.error, warn: console.warn };
  const logs = [];
  console.log = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);
  console.warn = (...args) => logs.push(args);
  try {
    const answer = await clientWith(async () => jsonResponse(modelOutput("private answer"))).respond(REQUEST);
    assert.equal(answer, "private answer");
    let caught;
    try {
      await clientWith(async () => jsonResponse({ privateBody: "provider-body-secret" }, { status: 500 })).respond(REQUEST);
    } catch (error) {
      caught = error;
    }
    const serialized = `${JSON.stringify(caught)}\n${caught.stack}`;
    assert.doesNotMatch(serialized, /fake-test-key|Authorization|provider-body-secret|private answer|page fault/);
    assert.deepEqual(logs, []);
  } finally {
    console.log = original.log;
    console.error = original.error;
    console.warn = original.warn;
  }
});

test("an upstream answer containing the configured key is rejected", async () => {
  await expectModelError(
    clientWith(async () => jsonResponse(modelOutput(`unsafe ${FAKE_KEY}`))).respond(REQUEST),
    "model_invalid_response"
  );
});

test("the production client has no execution, Git, logging, environment, or tool-calling path", () => {
  const source = fs.readFileSync(path.join(__dirname, "model-client.js"), "utf8");
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /\b(?:spawn|exec|execFile)(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /git\s+(?:checkout|switch|fetch|pull|reset|merge|commit|push)/i);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /["']tools["']\s*:/);
  assert.doesNotMatch(source, /["']tool_choice["']\s*:/);
  assert.doesNotMatch(source, /get_context|read_code|get_code_diff|get_qemu_events|get_run_result|run_test/);
  assert.doesNotMatch(source, /\/api\/coding|\/api\/v3/);
});
