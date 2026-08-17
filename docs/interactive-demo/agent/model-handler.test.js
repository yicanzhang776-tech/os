"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { AgentApiError } = require("./api");
const { AgentLoopError, createAgentLoop } = require("./agent-loop");
const {
  ModelClientError,
  createArkModelClient,
  isTrustedModelClientError
} = require("./model-client");
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

function parseRuntimeEvidence(output) {
  assert.match(output, /^\[RUNTIME EVIDENCE\]\n/);
  const serialized = output
    .slice("[RUNTIME EVIDENCE]\n".length)
    .split("\n\n[REQUEST EVIDENCE STATE]\n", 1)[0];
  return JSON.parse(serialized);
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

function invoke(handler, message = "hello") {
  return handler({ message, invocationContext: INVOCATION_CONTEXT });
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
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
      kind: "tool_calls",
      calls: [{ callId: "call-1", toolName: "get_context", arguments: {} }],
      continuationState
    },
    (input) => {
      assert.equal(input.continuationState, continuationState);
      assert.equal(JSON.parse(input.toolOutputs[0].output).tool, "get_context");
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

test("real Ark batch fixture completes get_context and read_code through the handler", async () => {
  const requestBodies = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requestBodies.push(body);
    if (requestBodies.length === 1) {
      return jsonResponse({
        id: "resp-1",
        output: [
          {
            type: "function_call",
            name: "get_context",
            call_id: "call-1",
            arguments: "{}"
          },
          {
            type: "function_call",
            name: "read_code",
            call_id: "call-2",
            arguments: "{\"path\":\"kernel/src/main.rs\"}"
          }
        ]
      });
    }
    return jsonResponse({
      id: "resp-2",
      output: [{
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: "Use the observed function as the next investigation point."
        }]
      }]
    });
  };
  const model = createArkModelClient({
    fetchImpl,
    apiKeyProvider: () => "fake-handler-key-123"
  });
  const toolCalls = [];
  const toolDispatch = {};
  for (const name of TOOL_SCHEMA_NAMES) {
    toolDispatch[name] = async (args, context) => {
      toolCalls.push({ name, args, context });
      return toolResult(name, {
        data: name === "read_code"
          ? { path: args.path, content: "pub fn demo() {}" }
          : { branch: INVOCATION_CONTEXT.branch, commit: INVOCATION_CONTEXT.commit }
      });
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
  const handler = createProductionAgentHandler({ agentLoop });

  assert.deepEqual(await invoke(handler), {
    answer: "Use the observed function as the next investigation point."
  });
  assert.deepEqual(toolCalls.map((entry) => entry.name), ["get_context", "read_code"]);
  assert.equal(requestBodies.length, 2);
  assert.equal(Object.hasOwn(requestBodies[0], "previous_response_id"), false);
  assert.equal(requestBodies[1].previous_response_id, "resp-1");
  assert.equal(requestBodies[1].input[0].call_id, "call-1");
  assert.equal(parseRuntimeEvidence(requestBodies[1].input[0].output).tool, "get_context");
  assert.equal(requestBodies[1].input[1].call_id, "call-2");
  assert.equal(parseRuntimeEvidence(requestBodies[1].input[1].output).tool, "read_code");
});

test("a safe tool failure reaches the model and can produce a final answer", async () => {
  const h = createHarness([
    {
      kind: "tool_calls",
      calls: [{ callId: "call-1", toolName: "read_code", arguments: { path: "forbidden" } }],
      continuationState: Object.freeze({ opaque: true })
    },
    (input) => {
      assert.equal(JSON.parse(input.toolOutputs[0].output).error.code, "invalid_tool_input");
      return { kind: "final", answer: "The requested path is unavailable." };
    }
  ], {
    read_code: toolResult("read_code", { ok: false })
  });
  assert.match((await invoke(h.handler)).answer, /unavailable/);
});

test("natural-language student requests dispatch only the necessary model-selected tools", async (t) => {
  const routes = [
    {
      name: "CASE 1 current experiment",
      message: "我现在做到哪个实验了？",
      calls: [{ toolName: "get_context", arguments: {} }]
    },
    {
      name: "CASE 2 explain named source",
      message: "帮我看看 kernel/src/main.rs 是干什么的。",
      calls: [{ toolName: "read_code", arguments: { path: "kernel/src/main.rs" } }]
    },
    {
      name: "CASE 3 diagnose recent changes",
      message: "我刚改了代码，现在为什么跑不起来？",
      calls: [{ toolName: "get_code_diff", arguments: { lab: "lab4" } }]
    },
    {
      name: "CASE 4 run current experiment",
      message: "我改好了，帮我运行一下。",
      calls: [
        { toolName: "get_context", arguments: {} },
        {
          toolName: "run_test",
          arguments: { testId: "lab4-starter-qemu", lab: "lab4" }
        }
      ],
      overrides: {
        run_test: toolResult("run_test", { data: { status: "started", runId: "run-1" } })
      },
      finalizationOnly: true
    },
    {
      name: "CASE 5 explain latest failure",
      message: "刚才实验为什么失败？",
      calls: [{ toolName: "get_run_result", arguments: {} }]
    },
    {
      name: "CASE 6 locate last execution and panic",
      message: "程序最后运行到哪里了？有没有 panic？",
      calls: [{ toolName: "get_qemu_events", arguments: {} }]
    },
    {
      name: "CASE 8 teaching diagnosis",
      message: "我的 Lab1 为什么过不了？不要直接给我答案。",
      calls: [
        { toolName: "get_context", arguments: {} },
        { toolName: "get_code_diff", arguments: { lab: "lab1" } },
        { toolName: "get_run_result", arguments: { lab: "lab1" } }
      ]
    },
    {
      name: "CASE 9 explicit tool compatibility",
      message: "请只调用 get_context 检查当前实验环境。",
      calls: [{ toolName: "get_context", arguments: {} }],
      explicit: true
    }
  ];

  for (const route of routes) {
    await t.test(route.name, async () => {
      const steps = route.calls.map((call, index) => (input) => {
        assert.equal(input.message, index === 0 ? route.message : null);
        return {
          kind: "tool_calls",
          calls: [{
            callId: `route-${index + 1}`,
            toolName: call.toolName,
            arguments: call.arguments
          }],
          continuationState: Object.freeze({ route: route.name, index })
        };
      });
      steps.push((input) => {
        assert.equal(input.message, null);
        assert.equal(input.finalizationOnly, route.finalizationOnly === true);
        return {
          kind: "final",
          answer: "已根据最少必要的真实证据给出教学提示。",
          continuationState: null
        };
      });
      const h = createHarness(steps, route.overrides || {});
      const result = await invoke(h.handler, route.message);

      assert.deepEqual(h.toolCalls.map((call) => call.name),
        route.calls.map((call) => call.toolName));
      assert.equal(h.modelCalls.length, route.calls.length + 1);
      assert.equal(h.modelCalls[0].message, route.message);
      assert.equal(h.modelCalls[0].tools.length, 6);
      if (!route.explicit) {
        assert.equal(TOOL_SCHEMA_NAMES.some((name) => route.message.includes(name)), false);
      }
      assert.equal(TOOL_SCHEMA_NAMES.some((name) => result.answer.includes(name)), false);
    });
  }
});

test("CASE 7 accepts empty QEMU events and finalizes without retrying", async () => {
  const message = "程序最后运行到哪里了？有没有 panic？";
  const h = createHarness([
    (input) => {
      assert.equal(input.message, message);
      return {
        kind: "tool_calls",
        calls: [{ callId: "events-1", toolName: "get_qemu_events", arguments: {} }],
        continuationState: Object.freeze({ route: "empty-events" })
      };
    },
    (input) => {
      assert.equal(input.finalizationOnly, true);
      const output = JSON.parse(input.toolOutputs[0].output);
      assert.deepEqual(output.data.events, []);
      assert.equal(output.data.returnedCount, 0);
      assert.equal(output.data.totalMatched, 0);
      return {
        kind: "final",
        answer: "当前没有匹配到可用 QEMU 事件，因此这一部分证据不足。",
        continuationState: null
      };
    }
  ], {
    get_qemu_events: toolResult("get_qemu_events", {
      data: { events: [], returnedCount: 0, totalMatched: 0 }
    })
  });

  const result = await invoke(h.handler, message);
  assert.match(result.answer, /没有匹配到可用 QEMU 事件/);
  assert.deepEqual(h.toolCalls.map((call) => call.name), ["get_qemu_events"]);
  assert.equal(h.modelCalls.length, 2);
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
    kind: "tool_calls",
    calls: [{ callId: "call-1", toolName: "shell", arguments: {} }],
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
    "agent_tool_output_too_large",
    "mixed_action_batch_unsupported"
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
