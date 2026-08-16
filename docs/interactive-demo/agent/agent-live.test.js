"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAgentLoop } = require("./agent-loop");
const { createArkModelClient, isTrustedModelClientError } = require("./model-client");
const { TOOL_SCHEMAS } = require("./tool-schemas");

const liveEnabled = process.env.ARK_LIVE_TEST === "1";
const debugAgent = process.env.OS_TUTOR_DEBUG_AGENT === "1";
const SAFE_SUMMARY_TOKEN = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const SAFE_RESPONSE_STATUSES = new Set([
  "completed", "failed", "incomplete", "in_progress", "queued"
]);

function safeSummaryToken(value) {
  return typeof value === "string" && SAFE_SUMMARY_TOKEN.test(value)
    ? value
    : "invalid";
}

function valueLength(value) {
  return typeof value === "string" ? Buffer.byteLength(value, "utf8") : null;
}

function summarizeOutputItem(item, index) {
  const summary = { index, type: safeSummaryToken(item?.type) };
  if (item?.type === "function_call") {
    return {
      ...summary,
      name: safeSummaryToken(item.name),
      callIdPresent: typeof item.call_id === "string" && item.call_id.length > 0,
      argumentsType: Array.isArray(item.arguments) ? "array" : typeof item.arguments,
      argumentsLength: valueLength(item.arguments)
    };
  }
  if (item?.type === "function_call_output") {
    return {
      ...summary,
      callIdPresent: typeof item.call_id === "string" && item.call_id.length > 0,
      outputType: Array.isArray(item.output) ? "array" : typeof item.output,
      outputLength: valueLength(item.output)
    };
  }
  if (item?.type === "message") {
    return {
      ...summary,
      role: safeSummaryToken(item.role),
      contentIsArray: Array.isArray(item.content),
      contentTypes: Array.isArray(item.content)
        ? item.content.map((content) => safeSummaryToken(content?.type))
        : []
    };
  }
  return summary;
}

function summarizeArkResponse(modelTurn, httpStatus, value) {
  const outputIsArray = Array.isArray(value?.output);
  return {
    modelTurn,
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null,
    responseIdPresent: typeof value?.id === "string" && value.id.length > 0,
    responseStatus: SAFE_RESPONSE_STATUSES.has(value?.status) ? value.status : null,
    outputIsArray,
    outputLength: outputIsArray ? value.output.length : null,
    outputItems: outputIsArray
      ? value.output.map((item, index) => summarizeOutputItem(item, index))
      : []
  };
}

function classifyParserFailure(summary) {
  if (!summary || !summary.outputIsArray) return "response_output_not_array";
  if (summary.outputItems.some((item) => item.type === "invalid")) {
    return "output_item_type_invalid";
  }
  const functionCalls = summary.outputItems.filter((item) => item.type === "function_call");
  if (functionCalls.length > 1) return "multiple_function_calls";
  if (summary.outputItems.some((item) => ![
    "reasoning", "message", "function_call", "function_call_output"
  ].includes(item.type))) {
    return "unsupported_output_item_type";
  }
  return "parser_validation_failed";
}

function createLiveDiagnostics(options = {}) {
  const enabled = options.enabled ?? debugAgent;
  const emit = options.emit || ((line) => console.error(line));
  let modelTurn = 0;
  const summaries = new Map();
  const write = (value) => {
    if (enabled) emit(`OS_TUTOR_DEBUG_AGENT ${JSON.stringify(value)}`);
  };

  return Object.freeze({
    beginTurn() {
      modelTurn += 1;
      return modelTurn;
    },
    wrapFetch(fetchImpl) {
      if (!enabled) return fetchImpl;
      return async (...args) => {
        const response = await fetchImpl(...args);
        let value = null;
        try {
          value = await response.clone().json();
        } catch (_) {
          // The parser reports malformed or non-JSON bodies through its fixed error path.
        }
        const summary = summarizeArkResponse(modelTurn, response?.status, value);
        summaries.set(modelTurn, summary);
        write(summary);
        return response;
      };
    },
    parserResult(turn, result) {
      write({
        modelTurn: turn,
        parserResult: result?.kind === "tool_call" ? "tool_call" : "final",
        parserFailure: null
      });
    },
    parserFailure(turn) {
      write({
        modelTurn: turn,
        parserResult: "failure",
        parserFailure: classifyParserFailure(summaries.get(turn))
      });
    }
  });
}

function createDiagnosticModel(client, tools, diagnostics) {
  return Object.freeze({
    async step(input) {
      const turn = diagnostics.beginTurn();
      try {
        const result = await client.step({ ...input, tools });
        diagnostics.parserResult(turn, result);
        return result;
      } catch (error) {
        diagnostics.parserFailure(turn);
        throw error;
      }
    }
  });
}

test("Ark live diagnostics expose structure only and classify multiple function calls", async () => {
  const secret = "SECRET_SENTINEL_MUST_NOT_APPEAR";
  const lines = [];
  const diagnostics = createLiveDiagnostics({ enabled: true, emit: (line) => lines.push(line) });
  const turn = diagnostics.beginTurn();
  const diagnosticFetch = diagnostics.wrapFetch(async () => new Response(JSON.stringify({
    id: `resp-${secret}`,
    status: "completed",
    output: [
      { type: "reasoning", summary: [{ text: secret }] },
      { type: "function_call_output", call_id: secret, output: `{"secret":"${secret}"}` },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: secret }]
      },
      { type: "function_call", name: "get_context", call_id: secret, arguments: `{"secret":"${secret}"}` },
      { type: "function_call", name: "read_code", call_id: secret, arguments: `{"path":"${secret}"}` }
    ]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  }));
  await diagnosticFetch("https://provider.invalid", {
    headers: { Authorization: `Bearer ${secret}` }
  });
  diagnostics.parserFailure(turn);

  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines.join("\n"), /SECRET_SENTINEL|Authorization|Bearer|provider\.invalid/);
  const responseSummary = JSON.parse(lines[0].replace("OS_TUTOR_DEBUG_AGENT ", ""));
  assert.deepEqual(responseSummary.outputItems.map((item) => item.type), [
    "reasoning", "function_call_output", "message", "function_call", "function_call"
  ]);
  assert.equal(responseSummary.outputItems[1].outputType, "string");
  assert.equal(responseSummary.outputItems[2].contentTypes[0], "output_text");
  assert.equal(responseSummary.outputItems[3].argumentsType, "string");
  const failureSummary = JSON.parse(lines[1].replace("OS_TUTOR_DEBUG_AGENT ", ""));
  assert.equal(failureSummary.parserFailure, "multiple_function_calls");
});

test("explicit Ark Agent Plan get_context tool-calling smoke test", {
  skip: !liveEnabled,
  timeout: 100_000
}, async () => {
  const context = Object.freeze({
    requestId: "agent-live-tool-smoke",
    branch: "lab1-starter",
    commit: "live-smoke-commit",
    lab: "lab1",
    variant: "starter"
  });
  const getContextSchema = TOOL_SCHEMAS.find((schema) => schema.name === "get_context");
  let toolCalls = 0;
  const dispatch = {
    get_context(_args, invocationContext) {
      toolCalls += 1;
      return {
        contractVersion: "os-tutor.tool/v1",
        tool: "get_context",
        ok: true,
        data: {
          branch: context.branch,
          commit: context.commit,
          lab: context.lab,
          variant: context.variant,
          workspace: { clean: true },
          task: { running: false }
        },
        error: null,
        meta: {
          requestId: invocationContext.requestId,
          branch: context.branch,
          commit: context.commit
        }
      };
    }
  };
  for (const name of [
    "read_code", "get_qemu_events", "get_run_result", "get_code_diff", "run_test"
  ]) {
    dispatch[name] = () => {
      throw new Error("The live smoke test must call only get_context.");
    };
  }

  const diagnostics = createLiveDiagnostics();
  const client = createArkModelClient({
    fetchImpl: diagnostics.wrapFetch(globalThis.fetch),
    apiKeyProvider: () => process.env.ARK_API_KEY,
    baseUrl: process.env.ARK_BASE_URL,
    model: process.env.ARK_MODEL
  });
  const loop = createAgentLoop({
    model: createDiagnosticModel(client, [getContextSchema], diagnostics),
    toolDispatch: dispatch,
    readContext: () => context,
    isTrustedModelError: isTrustedModelClientError
  });
  const result = await loop.run({
    message: "Use get_context exactly once, then briefly state the current Lab and branch.",
    invocationContext: context
  });
  assert.equal(toolCalls, 1);
  assert.equal(typeof result.answer, "string");
  assert.ok(result.answer.length > 0);
});

test("explicit Ark Agent Plan chained get_context and read_code smoke test", {
  skip: !liveEnabled,
  timeout: 100_000
}, async () => {
  const context = Object.freeze({
    requestId: "agent-live-chained-tool-smoke",
    branch: "lab1-starter",
    commit: "live-smoke-commit",
    lab: "lab1",
    variant: "starter"
  });
  const toolCalls = [];
  const dispatch = {
    get_context(_args, invocationContext) {
      toolCalls.push("get_context");
      return {
        contractVersion: "os-tutor.tool/v1",
        tool: "get_context",
        ok: true,
        data: {
          branch: context.branch,
          commit: context.commit,
          lab: context.lab,
          variant: context.variant,
          workspace: { clean: true },
          task: { running: false }
        },
        error: null,
        meta: {
          requestId: invocationContext.requestId,
          branch: context.branch,
          commit: context.commit
        }
      };
    },
    read_code(args, invocationContext) {
      toolCalls.push("read_code");
      return {
        contractVersion: "os-tutor.tool/v1",
        tool: "read_code",
        ok: true,
        data: {
          path: args.path,
          startLine: 1,
          endLine: 1,
          content: "pub fn live_smoke_example() {}",
          truncated: false
        },
        error: null,
        meta: {
          requestId: invocationContext.requestId,
          branch: context.branch,
          commit: context.commit
        }
      };
    }
  };
  for (const name of [
    "get_qemu_events", "get_run_result", "get_code_diff", "run_test"
  ]) {
    dispatch[name] = () => {
      throw new Error("The chained live smoke test must call only get_context and read_code.");
    };
  }

  const diagnostics = createLiveDiagnostics();
  const client = createArkModelClient({
    fetchImpl: diagnostics.wrapFetch(globalThis.fetch),
    apiKeyProvider: () => process.env.ARK_API_KEY,
    baseUrl: process.env.ARK_BASE_URL,
    model: process.env.ARK_MODEL
  });
  const allowedSchemas = TOOL_SCHEMAS.filter((schema) => [
    "get_context", "read_code"
  ].includes(schema.name));
  const loop = createAgentLoop({
    model: createDiagnosticModel(client, allowedSchemas, diagnostics),
    toolDispatch: dispatch,
    readContext: () => context,
    isTrustedModelError: isTrustedModelClientError
  });
  const result = await loop.run({
    message: [
      "Call get_context exactly once first.",
      "Then call read_code exactly once for kernel/src/lib.rs.",
      "Only after both tool results, give a one-sentence teaching answer."
    ].join(" "),
    invocationContext: context
  });
  assert.deepEqual(toolCalls, ["get_context", "read_code"]);
  assert.equal(typeof result.answer, "string");
  assert.ok(result.answer.length > 0);
});
