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
    "【当前已确认】本次构建成功，QEMU 最终状态为超时。超时不等于 QEMU 没有启动。",
    "【尚不能确认】当前结构化事件为空，所以事件证据不足；不能据此断定发生了 panic，也没有证据支持某个异常地址或最后执行位置。",
    "【问题范围】正常的 Lab1 路径是 QEMU → OpenSBI → S-mode → _start → 启动栈 → kernel_main → console → marker → SBI shutdown；当前只能优先缩小到最早缺失证据所在的启动阶段。",
    "【下一步最小检查】先核对链接入口、_start 与进入 Rust 前的启动栈；再预测成功进入 kernel_main 时应出现哪一条 Stage 1 marker，并运行对应 Stage 验证。"
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
  assert.match(result.answer, /预测.*运行对应 Stage 验证/);
  assert.doesNotMatch(result.answer, /lab1[-_]solution|完整实现|```/i);
  assert.doesNotMatch(result.answer, /\[RUNTIME EVIDENCE\]|\[COURSE KNOWLEDGE\]/);
});

test("OpenSBI handoff and timeout evidence stays below kernel-entry and panic claims", async () => {
  const finalAnswer = [
    "【当前已确认】QEMU 进程已启动；观察到了 OpenSBI 启动证据；OpenSBI 报告 Domain0 Next Mode 为 S-mode；本次运行达到超时条件。",
    "【尚不能确认】尚不能确认 CPU 是否执行了内核入口；当前事件列表中也没有 panic 事件。",
    "【问题范围】现有证据只能把范围缩小到 OpenSBI 报告之后的早期内核启动路径，入口执行情况仍是待验证假设。",
    "【下一步最小检查】先检查最早的内核入口标记或入口源码之一，不展开更多候选原因。"
  ].join("\n");
  const events = [
    ["qemu-started", "running", "QEMU process started", "lifecycle"],
    ["opensbi-started", "running", "OpenSBI startup evidence observed", "console"],
    ["s-mode-handoff-observed", "running", "Domain0 Next Mode is S-mode", "console"],
    ["qemu-timeout", "fail", "QEMU reached the run timeout", "lifecycle"]
  ].map(([step, status, detail, source], index) => ({
    protocol: "os-demo.event/v1",
    lab: "lab1",
    step,
    status,
    detail,
    source,
    runId: "run-boundary-1",
    sequence: index + 1,
    timestamp: 1_000 + index
  }));
  const bodies = [];
  const responses = [
    functionCall("resp-boundary-result", "call-boundary-result", "get_run_result", {}),
    functionCall("resp-boundary-events", "call-boundary-events", "get_qemu_events", {}),
    answerResponse(finalAnswer)
  ];
  const model = createArkModelClient({
    apiKeyProvider: () => "fake-boundary-key",
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
        runId: "run-boundary-1",
        status: "completed",
        build: { status: "success" },
        qemu: { status: "timeout" },
        finalResult: "timeout"
      });
    }
    if (name === "get_qemu_events") {
      return toolResult(name, {
        runId: "run-boundary-1",
        branch: CONTEXT.branch,
        commit: CONTEXT.commit,
        lab: CONTEXT.lab,
        variant: CONTEXT.variant,
        source: "lastCompletedRun",
        active: false,
        eventProtocol: "os-demo.event/v1",
        totalMatched: 4,
        returnedCount: 4,
        sequenceStart: null,
        sequenceEnd: null,
        limit: 20,
        includeRaw: false,
        truncated: false,
        events
      });
    }
    throw new Error("No code evidence is needed for this first-layer boundary answer.");
  }]));

  const loop = createAgentLoop({
    model,
    toolDispatch: dispatch,
    readContext: async () => ({ branch: CONTEXT.branch, commit: CONTEXT.commit }),
    retrieveKnowledge: async () => [],
    isTrustedModelError: isTrustedModelClientError
  });
  const result = await loop.run({
    message: "只看到 OpenSBI，后面没有内核输出，请先根据运行证据给第一层定位。",
    invocationContext: CONTEXT
  });

  assert.deepEqual(toolCalls, ["get_run_result", "get_qemu_events"]);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[2].instructions, SERVER_INSTRUCTIONS);
  assert.match(bodies[2].input[0].output, /s-mode-handoff-observed/);
  assert.match(bodies[2].input[0].output, /qemu-timeout/);
  assert.doesNotMatch(bodies[2].input[0].output, /"step":"panic"/);
  for (const heading of [
    "【当前已确认】", "【尚不能确认】", "【问题范围】", "【下一步最小检查】"
  ]) {
    assert.match(result.answer, new RegExp(heading));
  }
  assert.match(result.answer, /OpenSBI 报告 Domain0 Next Mode 为 S-mode/);
  assert.match(result.answer, /尚不能确认 CPU 是否执行了内核入口/);
  const confirmedSection = result.answer.split("【尚不能确认】")[0];
  assert.doesNotMatch(confirmedSection, /进入内核|_start|kernel_main|panic/);
  assert.doesNotMatch(
    result.answer,
    /已经成功进入内核|_start\s*已经执行|kernel_main\s*已经执行|内核并没有执行任何代码|已确认发生了?\s*panic|确认根本原因|根因就是/
  );
  assert.doesNotMatch(
    result.answer,
    /\[(?:REQUEST EVIDENCE STATE|RUNTIME EVIDENCE|COURSE KNOWLEDGE)\]|toolBudget|toolUsage|contractVersion/
  );
});

test("an unread boot module keeps a missing symbol claim scoped to main.rs", async () => {
  const mainSource = "#![no_std]\nmod boot;\nfn kernel_main() -> ! { loop {} }\n";
  const finalAnswer = [
    "【当前已确认】在当前读取的 main.rs 范围中没有观察到 `_start`，同时该文件声明了 `mod boot;`。",
    "【尚不能确认】boot 模块尚未读取，因此不能确认整个项目是否定义了 `_start`。",
    "【问题范围】入口实现可能位于尚未检查的 boot 模块；这只是优先检查方向，不是已确认根因。",
    "【下一步最小检查】只检查 boot 模块对应的一个源码文件是否定义 `_start`。"
  ].join("\n");
  const bodies = [];
  const responses = [
    functionCall("resp-main-only", "call-main-only", "read_code", {
      path: "kernel/src/main.rs"
    }),
    answerResponse(finalAnswer)
  ];
  const model = createArkModelClient({
    apiKeyProvider: () => "fake-main-scope-key",
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return jsonResponse(responses.shift());
    }
  });
  const toolCalls = [];
  const dispatch = Object.fromEntries(TOOL_SCHEMA_NAMES.map((name) => [name, async (args) => {
    if (name !== "read_code" || args.path !== "kernel/src/main.rs") {
      throw new Error("This scope test permits only main.rs to be read.");
    }
    toolCalls.push({ name, path: args.path });
    return toolResult(name, {
      path: args.path,
      startLine: 1,
      endLine: 3,
      content: mainSource,
      truncated: false
    });
  }]));

  const loop = createAgentLoop({
    model,
    toolDispatch: dispatch,
    readContext: async () => ({ branch: CONTEXT.branch, commit: CONTEXT.commit }),
    retrieveKnowledge: async () => [],
    isTrustedModelError: isTrustedModelClientError
  });
  const result = await loop.run({
    message: "先读取 main.rs 给第一层入口提示；若其他模块未读，请明确证据边界。",
    invocationContext: CONTEXT
  });

  assert.deepEqual(toolCalls, [{ name: "read_code", path: "kernel/src/main.rs" }]);
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].input[0].output, /mod boot;/);
  assert.doesNotMatch(bodies[1].input[0].output, /extern \\"C\\" fn _start/);
  assert.match(result.answer, /当前读取的 main\.rs 范围中没有观察到 `_start`/);
  assert.match(result.answer, /boot 模块尚未读取/);
  assert.match(result.answer, /不能确认整个项目是否定义了 `_start`/);
  assert.match(result.answer, /只是优先检查方向，不是已确认根因/);
  assert.doesNotMatch(result.answer, /项目缺少 `_start`|项目中不存在 `_start`|确认根本原因|根因就是/);
  for (const heading of [
    "【当前已确认】", "【尚不能确认】", "【问题范围】", "【下一步最小检查】"
  ]) {
    assert.match(result.answer, new RegExp(heading));
  }
});

test("a later boot source corrects an entry-missing hypothesis with direct code evidence", async () => {
  const mainSource = "#![no_std]\nmod boot;\nfn kernel_main() -> ! { loop {} }\n";
  const bootSource = [
    "#[no_mangle]",
    "pub unsafe extern \"C\" fn _start() -> ! {",
    "    loop {}",
    "}",
    "compile_error!(\"intentional boot failure\");"
  ].join("\n");
  const finalAnswer = [
    "【当前已确认】在已读取的 boot.rs 中直接观察到 `_start` 定义，因此入口符号缺失的候选假设已被代码证据否定；同一代码范围还明确包含无条件 `compile_error!`，当前源码存在编译阻断可以确认。",
    "【尚不能确认】尚不能确认链接入口配置、CPU 是否执行 `_start` 或 kernel_main 是否运行；当前没有对应运行证据。",
    "【问题范围】静态入口定义已经存在，但当前直接错误停在编译阶段，不能把诊断推进到 `_start` 之后的运行路径。",
    "【下一步最小检查】只核对最新构建诊断是否对应这条 `compile_error!`；在编译阻断解决前不推断运行阶段。"
  ].join("\n");
  const bodies = [];
  const responses = [
    functionCall("resp-main-read", "call-main-read", "read_code", {
      path: "kernel/src/main.rs"
    }),
    functionCall("resp-boot-read", "call-boot-read", "read_code", {
      path: "kernel/src/boot.rs"
    }),
    answerResponse(finalAnswer)
  ];
  const model = createArkModelClient({
    apiKeyProvider: () => "fake-code-boundary-key",
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return jsonResponse(responses.shift());
    }
  });
  const toolCalls = [];
  const dispatch = Object.fromEntries(TOOL_SCHEMA_NAMES.map((name) => [name, async (args) => {
    if (name !== "read_code") {
      throw new Error("This evidence-boundary test permits only the two focused reads.");
    }
    toolCalls.push({ name, path: args.path });
    if (args.path === "kernel/src/main.rs") {
      return toolResult(name, {
        path: args.path,
        startLine: 1,
        endLine: 3,
        content: mainSource,
        truncated: false
      });
    }
    if (args.path === "kernel/src/boot.rs") {
      return toolResult(name, {
        path: args.path,
        startLine: 1,
        endLine: 5,
        content: bootSource,
        truncated: false
      });
    }
    throw new Error("The model requested an unrelated source file.");
  }]));

  const loop = createAgentLoop({
    model,
    toolDispatch: dispatch,
    readContext: async () => ({ branch: CONTEXT.branch, commit: CONTEXT.commit }),
    retrieveKnowledge: async () => [],
    isTrustedModelError: isTrustedModelClientError
  });
  const result = await loop.run({
    message: "请最小化检查早期入口代码，并严格区分当前文件未观察到和项目不存在。",
    invocationContext: CONTEXT
  });

  assert.deepEqual(toolCalls, [
    { name: "read_code", path: "kernel/src/main.rs" },
    { name: "read_code", path: "kernel/src/boot.rs" }
  ]);
  assert.equal(bodies.length, 3);
  assert.match(bodies[1].input[0].output, /mod boot;/);
  assert.doesNotMatch(bodies[1].input[0].output, /extern \\"C\\" fn _start/);
  assert.match(bodies[2].input[0].output, /extern \\"C\\" fn _start/);
  assert.match(result.answer, /【当前已确认】/);
  assert.match(result.answer, /boot\.rs 中直接观察到 `_start` 定义/);
  assert.match(result.answer, /候选假设已被代码证据否定/);
  assert.match(result.answer, /明确包含无条件 `compile_error!`，当前源码存在编译阻断可以确认/);
  assert.match(result.answer, /【尚不能确认】.*尚不能确认链接入口配置/s);
  assert.match(result.answer, /【问题范围】/);
  assert.match(result.answer, /直接错误停在编译阶段/);
  assert.match(result.answer, /【下一步最小检查】/);
  assert.match(result.answer, /只核对最新构建诊断是否对应这条 `compile_error!`/);
  assert.doesNotMatch(result.answer, /确认根本原因|根因就是|项目缺少 `_start`|`_start` 不存在/);
  assert.doesNotMatch(
    result.answer,
    /\[(?:REQUEST EVIDENCE STATE|RUNTIME EVIDENCE|COURSE KNOWLEDGE)\]|toolBudget|toolUsage|contractVersion/
  );
});
