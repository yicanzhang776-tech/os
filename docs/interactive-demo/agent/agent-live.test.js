"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAgentLoop } = require("./agent-loop");
const { createArkModelClient, isTrustedModelClientError } = require("./model-client");
const { TOOL_SCHEMAS } = require("./tool-schemas");

const liveEnabled = process.env.ARK_LIVE_TEST === "1";

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

  const client = createArkModelClient({
    fetchImpl: globalThis.fetch,
    apiKeyProvider: () => process.env.ARK_API_KEY,
    baseUrl: process.env.ARK_BASE_URL,
    model: process.env.ARK_MODEL
  });
  const loop = createAgentLoop({
    model: {
      step(input) {
        return client.step({ ...input, tools: [getContextSchema] });
      }
    },
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
