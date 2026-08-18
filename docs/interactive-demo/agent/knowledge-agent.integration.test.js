"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAgentLoop } = require("./agent-loop");
const { createKnowledgeRetriever } = require("./knowledge-retriever");
const { createArkModelClient, isTrustedModelClientError } = require("./model-client");
const { TOOL_SCHEMA_NAMES } = require("./tool-schemas");

const CONTEXT = Object.freeze({
  requestId: "agent-knowledge-integration",
  branch: "lab4-starter",
  commit: "abc1234",
  lab: "lab4",
  variant: "starter"
});

function response(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function dispatchRegistry() {
  return Object.freeze(Object.fromEntries(TOOL_SCHEMA_NAMES.map((name) => [
    name,
    async () => ({
      contractVersion: "os-tutor.tool/v1",
      tool: name,
      ok: true,
      data: name === "get_context"
        ? { branch: CONTEXT.branch, commit: CONTEXT.commit, lab: CONTEXT.lab }
        : { observed: true },
      error: null,
      meta: {
        requestId: CONTEXT.requestId,
        branch: CONTEXT.branch,
        commit: CONTEXT.commit
      }
    })
  ])));
}

test("real retrieval reaches the first Ark turn and current tool data reaches its continuation", async () => {
  const bodies = [];
  const upstream = [
    {
      id: "resp-knowledge-1",
      output: [{
        type: "function_call",
        name: "get_context",
        call_id: "call-context-1",
        arguments: "{}"
      }]
    },
    {
      id: "resp-knowledge-2",
      output: [{
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: "先核对 indexes 的返回契约，再按高层到低层检查实际页表遍历。"
        }]
      }]
    }
  ];
  const model = createArkModelClient({
    apiKeyProvider: () => "integration-test-key",
    async fetchImpl(_url, options) {
      bodies.push(JSON.parse(options.body));
      return response(upstream.shift());
    }
  });
  const retriever = createKnowledgeRetriever();
  const loop = createAgentLoop({
    model,
    toolDispatch: dispatchRegistry(),
    readContext: async () => ({ branch: CONTEXT.branch, commit: CONTEXT.commit }),
    retrieveKnowledge: retriever.retrieveKnowledge,
    isTrustedModelError: isTrustedModelClientError,
    now: () => 1_000
  });

  const result = await loop.run({
    message: "indexes 顺序和三级 walk 顺序一样吗？",
    invocationContext: CONTEXT
  });
  assert.match(result.answer, /indexes/);
  assert.equal(bodies.length, 2);
  assert.match(bodies[0].input, /^\[STUDENT QUESTION\]/);
  assert.match(bodies[0].input, /\[COURSE KNOWLEDGE\]/);
  assert.match(bodies[0].input, /lab4-vpn-index-order/);
  assert.equal(bodies[1].previous_response_id, "resp-knowledge-1");
  assert.match(bodies[1].input[0].output, /^\[RUNTIME EVIDENCE\]/);
  assert.match(bodies[1].input[0].output, /"tool":"get_context"/);
  assert.doesNotMatch(result.answer, /\[(?:COURSE KNOWLEDGE|RUNTIME EVIDENCE)\]/);
});
