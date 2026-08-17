"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("explicit Ark Agent Plan get_context then read_code continuation", {
  skip: !liveEnabled,
  timeout: 100_000
}, async () => {
  const context = Object.freeze({
    requestId: "agent-live-two-tool-smoke",
    branch: "lab-atlas-ai-tutor",
    commit: "b52bc28",
    lab: null,
    variant: "custom"
  });
  const repoDir = path.resolve(__dirname, "..", "..", "..");
  const sourcePath = path.join(repoDir, "kernel", "src", "main.rs");
  const sourceLines = fs.readFileSync(sourcePath, "utf8").split(/(?<=\n)/u);
  const schemas = TOOL_SCHEMAS.filter((schema) => ["get_context", "read_code"].includes(schema.name));
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
      assert.equal(args.path, "kernel/src/main.rs");
      const endLine = Math.min(40, sourceLines.length);
      return {
        contractVersion: "os-tutor.tool/v1",
        tool: "read_code",
        ok: true,
        data: {
          path: args.path,
          startLine: 1,
          endLine,
          totalLines: sourceLines.length,
          content: sourceLines.slice(0, endLine).join(""),
          truncated: endLine < sourceLines.length
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
  for (const name of ["get_qemu_events", "get_run_result", "get_code_diff", "run_test"]) {
    dispatch[name] = () => {
      throw new Error("The live continuation test permits only get_context and read_code.");
    };
  }

  const client = createArkModelClient({
    fetchImpl: globalThis.fetch,
    apiKeyProvider: () => process.env.ARK_API_KEY,
    baseUrl: process.env.ARK_BASE_URL,
    model: process.env.ARK_MODEL,
    diagnosticSink: process.env.OS_TUTOR_DEBUG_AGENT === "1"
      ? (event) => process.stderr.write(`[agent-debug] ${JSON.stringify(event)}\n`)
      : null
  });
  const loop = createAgentLoop({
    model: {
      step(input) {
        return client.step({ ...input, tools: schemas });
      }
    },
    toolDispatch: dispatch,
    readContext: () => context,
    isTrustedModelError: isTrustedModelClientError
  });

  const result = await loop.run({
    message: "First call get_context. Then call read_code for kernel/src/main.rs lines 1 through 40. Only after both tool results, give a brief explanation.",
    invocationContext: context
  });
  assert.deepEqual(toolCalls, ["get_context", "read_code"]);
  assert.equal(typeof result.answer, "string");
  assert.ok(result.answer.length > 0);
});
