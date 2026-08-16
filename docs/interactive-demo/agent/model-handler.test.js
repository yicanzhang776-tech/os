"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { AgentApiError } = require("./api");
const { AgentLoopError, createAgentLoop } = require("./agent-loop");
const { ModelClientError, isTrustedModelClientError } = require("./model-client");
const { createProductionAgentHandler } = require("./model-handler");
const { TOOL_SCHEMA_NAMES } = require("./tool-schemas");

const INVOCATION_CONTEXT = Object.freeze({
  requestId: "agent-handler-1",
  branch: "lab4-starter",
  commit: "abc1234",
  lab: "lab4",
  variant: "starter"
});

function toolResult(tool, options = {}) {
  const ok = options.ok ?? true;
  return {
    contractVersion: "os-tutor.tool/v1",
    tool,
    ok,
    data: ok ? (options.data || { observed: true }) : null,
    error: ok ? null : {
      code: options.code || "invalid_tool_input",
      message: "The tool input is invalid.",
      retryable: false,
      details: {}
    },
    meta: {
      requestId: INVOCATION_CONTEXT.requestId,
      branch: INVOCATION_CONTEXT.branch,
      commit: INVOCATION_CONTEXT.commit
    }
  };
}

function createHarness(steps, overrides = {}) {
  const modelCalls = [];
  const toolCalls = [];
  const model = {
    async step(input) {
      modelCalls.push(input);
      const next = steps.shift();
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next(input) : next;
    }
  };
  const toolDispatch = {};
  for (const name of TOOL_SCHEMA_NAMES) {
    toolDispatch[name] = async (args, context) => {
      toolCalls.push({ name, args, context });
      const override = overrides[name];
      return typeof override === "function"
        ? override(args, context)
        : Object.hasOwn(overrides, name) ? override : toolResult(name);
    };
  }
  const agentLoop = createAgentLoop({
    model,
    toolDispatch,
    readContext: async () => ({
      branch: INVOCATION_CONTEXT.branch,
      commit: INVOCATION_CONTEXT.commit
    }),
    now: () => 1_000,
    isTrustedModelError: isTrustedModelClientError
  });
  return {
    handler: createProductionAgentHandler({ agentLoop }),
    modelCalls,
    toolCalls
  };
}

function invoke(handler) {
  return handler({ message: "hello", invocationContext: INVOCATION_CONTEXT });
}

test("the production handler returns a final answer through the Agent Loop", async () => {
  const h = createHarness([{ kind: "final", answer: "safe answer", continuationState: null }]);
  assert.deepEqual(await invoke(h.handler), { answer: "safe answer" });
  assert.equal(h.modelCalls.length, 1);
  assert.equal(h.modelCalls[0].requestId, INVOCATION_CONTEXT.requestId);
  assert.equal(h.modelCalls[0].message, "hello");
  assert.equal(h.modelCalls[0].tools.length, 6);
  assert.equal(h.toolCalls.length, 0);
});

test("one fake tool call is dispatched and followed by a final answer", async () => {
  const continuationState = Object.freeze({ opaque: "provider-owned" });
  const h = createHarness([
    {
      kind: "tool_call",
      callId: "call-1",
      toolName: "get_context",
      arguments: {},
      continuationState
    },
    (input) => {
      assert.equal(input.continuationState, continuationState);
      assert.equal(JSON.parse(input.toolOutput.output).tool, "get_context");
      return { kind: "final", answer: "Observed answer.", continuationState: null };
    }
  ]);
  assert.deepEqual(await invoke(h.handler), { answer: "Observed answer." });
  assert.deepEqual(h.toolCalls.map((call) => call.name), ["get_context"]);
  assert.deepEqual(h.toolCalls[0].context, {
    requestId: INVOCATION_CONTEXT.requestId,
    expectedBranch: INVOCATION_CONTEXT.branch,
    expectedCommit: INVOCATION_CONTEXT.commit
  });
});

test("a safe tool failure reaches the model and can produce a final answer", async () => {
  const h = createHarness([
    {
      kind: "tool_call",
      callId: "call-1",
      toolName: "read_code",
      arguments: { path: "forbidden" },
      continuationState: Object.freeze({ opaque: true })
    },
    (input) => {
      assert.equal(JSON.parse(input.toolOutput.output).error.code, "invalid_tool_input");
      return { kind: "final", answer: "The requested path is unavailable." };
    }
  ], {
    read_code: toolResult("read_code", { ok: false })
  });
  assert.match((await invoke(h.handler)).answer, /unavailable/);
});

test("every trusted model error maps to the same fixed Agent API code", async (t) => {
  const codes = [
    "model_not_configured",
    "model_auth_failed",
    "model_rate_limited",
    "model_timeout",
    "model_request_failed",
    "model_upstream_error",
    "model_unavailable",
    "model_invalid_response",
    "model_internal_error"
  ];
  for (const code of codes) {
    await t.test(code, async () => {
      const h = createHarness([new ModelClientError(code)]);
      await assert.rejects(invoke(h.handler), (error) => {
        assert.equal(error instanceof AgentApiError, true);
        assert.equal(error.code, code);
        assert.deepEqual(error.details, {});
        return true;
      });
    });
  }
});

test("unknown tools and model protocol failures keep a safe diagnostic code", async () => {
  const h = createHarness([{
    kind: "tool_call",
    callId: "call-1",
    toolName: "shell",
    arguments: {},
    continuationState: null
  }]);
  await assert.rejects(invoke(h.handler), (error) => {
    assert.equal(error.code, "agent_protocol_error");
    assert.deepEqual(error.details, {});
    return true;
  });
  assert.equal(h.toolCalls.length, 0);
});

test("trusted orchestration limits keep their fixed public codes", async () => {
  for (const code of [
    "agent_deadline_exceeded",
    "agent_loop_limit",
    "agent_protocol_error",
    "agent_tool_output_too_large"
  ]) {
    const branded = new AgentLoopError(code);
    const handler = createProductionAgentHandler({ agentLoop: { run: async () => { throw branded; } } });
    await assert.rejects(invoke(handler), (error) => error.code === code);
  }
});

test("lookalike, prototype-spoofed, and unknown errors become fixed internal errors", async (t) => {
  const unsafe = new Error("C:\\private\\repo Authorization: Bearer secret");
  unsafe.stack = "STACK secret";
  const fake = { code: "model_auth_failed", message: "trust me", details: { token: "secret" } };
  const spoof = Object.create(ModelClientError.prototype);
  spoof.code = "model_timeout";

  for (const thrown of [unsafe, fake, spoof]) {
    await t.test(thrown.code || thrown.name, async () => {
      const agentLoop = { run: async () => { throw thrown; } };
      const handler = createProductionAgentHandler({ agentLoop });
      await assert.rejects(invoke(handler), (error) => {
        assert.equal(error.code, "agent_internal_error");
        assert.equal(error.message, "The agent request could not be completed.");
        assert.deepEqual(error.details, {});
        assert.doesNotMatch(`${JSON.stringify(error)}\n${error.stack}`,
          /private|Authorization|secret|trust me|token|STACK/);
        return true;
      });
    });
  }
});

test("the production handler requires only a narrow Agent Loop", () => {
  assert.throws(() => createProductionAgentHandler(), /agentLoop\.run is required/);
  assert.throws(() => createProductionAgentHandler({ agentLoop: {} }),
    /agentLoop\.run is required/);
});
