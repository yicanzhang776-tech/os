"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { LAB1_KNOWLEDGE_PATH } = require("./knowledge-retriever");
const { TOOL_SCHEMA_NAMES } = require("./tool-schemas");
const { createAgentRuntime, normalizeApiKey } = require("./runtime");

const CONTEXT = Object.freeze({
  requestId: "agent-runtime-1",
  branch: "lab1-starter",
  commit: "abc1234",
  lab: "lab1",
  variant: "starter"
});

function dispatch() {
  return Object.fromEntries(TOOL_SCHEMA_NAMES.map((name) => [name, () => ({
    contractVersion: "os-tutor.tool/v1",
    tool: name,
    ok: true,
    data: { observed: true },
    error: null,
    meta: { requestId: CONTEXT.requestId, branch: CONTEXT.branch, commit: CONTEXT.commit }
  })]));
}

function modelResponse(text) {
  return new Response(JSON.stringify({
    id: "resp-runtime",
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }]
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function runtime(options = {}) {
  return createAgentRuntime({
    fetchImpl: options.fetchImpl ?? (async () => modelResponse("ok")),
    environmentApiKey: options.environmentApiKey,
    toolDispatch: dispatch(),
    readContext: options.readContext
      ?? (() => ({ branch: CONTEXT.branch, commit: CONTEXT.commit })),
    ...(Object.hasOwn(options, "knowledgeRetriever")
      ? { knowledgeRetriever: options.knowledgeRetriever }
      : {})
  });
}

function unavailableKnowledgeRead(originalReadFileSync, replacement) {
  return function readFileSync(filePath, ...args) {
    if (typeof filePath === "string"
      && path.resolve(filePath) === path.resolve(LAB1_KNOWLEDGE_PATH)) {
      if (replacement !== undefined) return replacement;
      const error = new Error("simulated knowledge file removal");
      error.code = "ENOENT";
      throw error;
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };
}

test("runtime accepts only bounded whitespace-free process credentials", () => {
  assert.equal(normalizeApiKey("  ark-test-key  "), "ark-test-key");
  for (const value of [null, "", "bad key", "bad\nkey", "x".repeat(4097)]) {
    assert.equal(normalizeApiKey(value), null);
  }
});

test("a session key overrides environment configuration and clearing restores it", () => {
  const value = runtime({ environmentApiKey: "environment-key" });
  assert.equal(value.getCapabilities().credentialSource, "environment");
  assert.equal(value.configureSessionApiKey("session-key").credentialSource, "session");
  assert.equal(value.clearSessionApiKey().credentialSource, "environment");
});

test("a page-provided key is snapshotted for one agent request without being exposed", async () => {
  let authorization;
  const value = runtime({
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return modelResponse("已观察当前实验。");
    }
  });
  assert.equal(value.getCapabilities().configured, false);
  const capabilities = value.configureSessionApiKey("session-secret-key");
  assert.deepEqual(Object.keys(capabilities).sort(), [
    "configured", "contractVersion", "credentialSource", "model", "provider", "remoteStore"
  ]);
  assert.doesNotMatch(JSON.stringify(capabilities), /session-secret-key/);
  const result = await value.handleAgentRequest({
    message: "当前是什么实验？",
    invocationContext: CONTEXT
  });
  assert.deepEqual(result, { answer: "已观察当前实验。" });
  assert.equal(authorization, "Bearer session-secret-key");
  assert.equal(value.clearSessionApiKey().configured, false);
});

test("invalid page credentials never replace a working session key", () => {
  const value = runtime();
  assert.equal(value.configureSessionApiKey("valid-key").configured, true);
  assert.equal(value.configureSessionApiKey("bad key"), null);
  assert.equal(value.getCapabilities().credentialSource, "session");
});

test("a startup knowledge snapshot survives a student workspace branch switch", async () => {
  let workspaceContext = {
    branch: "fix/chained-agent-tools",
    commit: "server-asset-commit"
  };
  const requestBodies = [];
  const value = runtime({
    environmentApiKey: "environment-key",
    readContext: () => workspaceContext,
    fetchImpl: async (_url, options) => {
      requestBodies.push(JSON.parse(options.body));
      return modelResponse("正常回复");
    }
  });

  workspaceContext = { branch: CONTEXT.branch, commit: CONTEXT.commit };
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = unavailableKnowledgeRead(originalReadFileSync);
  try {
    for (const message of [
      "你好，请简单回复一句话，不调用工具。",
      "OpenSBI是什么？",
      "我现在在哪个Lab？"
    ]) {
      assert.deepEqual(await value.handleAgentRequest({
        message,
        invocationContext: CONTEXT
      }), { answer: "正常回复" });
    }
  } finally {
    fs.readFileSync = originalReadFileSync;
  }

  assert.equal(requestBodies.length, 3);
  assert.equal(requestBodies[0].input, "你好，请简单回复一句话，不调用工具。");
  assert.match(requestBodies[1].input, /\[COURSE KNOWLEDGE\]/);
  assert.match(requestBodies[1].input, /lab1-concept-opensbi/);
  assert.equal(requestBodies[2].input, "我现在在哪个Lab？");
});

test("runtime startup fails closed when bundled knowledge is missing or invalid", () => {
  const originalReadFileSync = fs.readFileSync;
  try {
    fs.readFileSync = unavailableKnowledgeRead(originalReadFileSync);
    assert.throws(() => runtime(), /knowledge base could not be loaded/);

    fs.readFileSync = unavailableKnowledgeRead(originalReadFileSync, "{}");
    assert.throws(() => runtime(), /Invalid Lab1 knowledge base metadata/);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
});
