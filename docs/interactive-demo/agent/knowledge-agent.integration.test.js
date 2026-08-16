"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAgentLoop } = require("./agent-loop");
const { retrieveKnowledge } = require("./knowledge-retriever");
const {
  FINALIZATION_INSTRUCTIONS,
  SERVER_INSTRUCTIONS,
  createArkModelClient,
  isTrustedModelClientError
} = require("./model-client");
const { TOOL_SCHEMA_NAMES } = require("./tool-schemas");

const CONTEXT = Object.freeze({
  requestId: "agent-lab1-knowledge-integration",
  branch: "lab1-starter",
  commit: "abc1234",
  lab: "lab1",
  variant: "starter"
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function functionCall(id, callId, name, args = {}) {
  return {
    id,
    output: [{
      type: "function_call",
      name,
      call_id: callId,
      arguments: JSON.stringify(args)
    }]
  };
}

function answerResponse(text) {
  return {
    id: "resp-final",
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }]
    }]
  };
}

function toolResult(tool, data) {
  return {
    contractVersion: "os-tutor.tool/v1",
    tool,
    ok: true,
    data,
    error: null,
    meta: {
      requestId: CONTEXT.requestId,
      branch: CONTEXT.branch,
      commit: CONTEXT.commit
    }
  };
}

test("Lab1 OpenSBI-only diagnosis combines course knowledge with bounded runtime evidence", async () => {
  const finalAnswer = [
    "已确认的当前事实是：本次构建成功，QEMU 最终状态为超时。超时不等于 QEMU 没有启动。",
    "当前结构化事件为空，所以事件证据不足；不能据此断定发生了 panic，也没有证据支持某个异常地址或最后执行位置。",
    "正常的 Lab1 路径是 QEMU → OpenSBI → S-mode → _start → 启动栈 → kernel_main → console → marker → SBI shutdown。",
    "你描述的现象说明下一步应找最早缺失的证据：先核对链接入口与 _start，再检查进入 Rust 前是否设置启动栈、kernel_main 的早期输出是否可达，最后区分早期输出和 console 路径。",
    "先预测成功进入 kernel_main 时应出现哪一条 Stage 1 marker，再运行对应 Stage 验证；这样能把入口问题与 console 问题分开。"
  ].join("\n");
  const bodies = [];
  const responses = [
    functionCall("resp-result", "call-result", "get_run_result", {}),
    functionCall("resp-events", "call-events", "get_qemu_events", {}),
    answerResponse(finalAnswer)
  ];
  const model = createArkModelClient({
    apiKeyProvider: () => "fake-integration-key",
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return jsonResponse(responses.shift());
    }
  });

  const toolCalls = [];
  const dispatch = Object.fromEntries(TOOL_SCHEMA_NAMES.map((name) => [name, async () => {
    toolCalls.push(name);
    if (name === "get_run_result") {
      return toolResult(name, {
        runId: "run-lab1-1",
        status: "completed",
        build: { status: "success" },
        qemu: { status: "timeout" },
        finalResult: "timeout"
      });
    }
    if (name === "get_qemu_events") {
      return toolResult(name, { events: [], returnedCount: 0, totalMatched: 0 });
    }
    throw new Error("The model requested an unnecessary tool.");
  }]));

  const loop = createAgentLoop({
    model,
    toolDispatch: dispatch,
    readContext: async () => ({ branch: CONTEXT.branch, commit: CONTEXT.commit }),
    retrieveKnowledge,
    isTrustedModelError: isTrustedModelClientError
  });
  const result = await loop.run({
    message: "我的Lab1为什么只停在OpenSBI？",
    invocationContext: CONTEXT
  });

  assert.deepEqual(toolCalls, ["get_run_result", "get_qemu_events"]);
  assert.equal(TOOL_SCHEMA_NAMES.length, 6);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0].instructions, SERVER_INSTRUCTIONS);
  assert.match(bodies[0].input, /\[COURSE KNOWLEDGE\]/);
  assert.match(bodies[0].input, /lab1-debug-opensbi-only/);
  assert.match(bodies[0].input, /lab1-boot-flow/);
  assert.match(bodies[0].input, /事件列表为空.*不能编造 panic/);
  assert.doesNotMatch(bodies[0].input, /lab1[-_]solution|SOLUTION\.md|```/i);

  assert.equal(bodies[1].previous_response_id, "resp-result");
  assert.match(bodies[1].input[0].output, /^\[RUNTIME EVIDENCE\]\n/);
  assert.match(bodies[1].input[0].output, /"build":\{"status":"success"\}/);
  assert.match(bodies[1].input[0].output, /"qemu":\{"status":"timeout"\}/);
  assert.equal(bodies[2].previous_response_id, "resp-events");
  assert.equal(bodies[2].instructions, FINALIZATION_INSTRUCTIONS);
  assert.match(bodies[2].input[0].output, /^\[RUNTIME EVIDENCE\]\n/);
  assert.match(bodies[2].input[0].output, /"events":\[\]/);
  assert.match(bodies[2].input[0].output, /"returnedCount":0/);
  assert.match(bodies[2].input[0].output, /"totalMatched":0/);

  assert.deepEqual(result, { answer: finalAnswer });
  assert.match(result.answer, /构建成功/);
  assert.match(result.answer, /QEMU 最终状态为超时/);
  assert.match(result.answer, /超时不等于 QEMU 没有启动/);
  assert.match(result.answer, /事件证据不足/);
  assert.match(result.answer, /不能据此断定发生了 panic/);
  assert.match(result.answer, /_start.*启动栈.*kernel_main.*console/);
  assert.match(result.answer, /先预测.*再运行对应 Stage 验证/);
  assert.doesNotMatch(result.answer, /lab1[-_]solution|完整实现|```/i);
  assert.doesNotMatch(result.answer, /\[RUNTIME EVIDENCE\]|\[COURSE KNOWLEDGE\]/);
});
