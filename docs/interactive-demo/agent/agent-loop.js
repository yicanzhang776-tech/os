"use strict";

const crypto = require("node:crypto");
const { TOOL_SCHEMAS, TOOL_SCHEMA_NAMES } = require("./tool-schemas");

const TOOL_CONTRACT_VERSION = "os-tutor.tool/v1";
const MAX_MODEL_TURNS = 9;
const MAX_TOOL_CALLS = 8;
const MAX_AGENT_DURATION_MS = 120_000;
const MAX_TOTAL_TOOL_OUTPUT_BYTES = 512 * 1024;
const MAX_AGENT_ANSWER_LENGTH = 12_000;
const MAX_CALL_ID_LENGTH = 128;
const FORBIDDEN_ANSWER_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FORBIDDEN_IDENTIFIER_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const DANGEROUS_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const TOOL_REPEAT_LIMITS = Object.freeze({
  get_context: 1,
  read_code: 4,
  get_code_diff: 1,
  run_test: 1,
  get_run_result: 1,
  get_qemu_events: 1
});

const TOOL_OUTPUT_BUDGET_BYTES = Object.freeze({
  get_context: 32 * 1024,
  read_code: 192 * 1024,
  get_qemu_events: 512 * 1024,
  get_run_result: 64 * 1024,
  get_code_diff: 192 * 1024,
  run_test: 32 * 1024
});

const ERROR_DEFINITIONS = Object.freeze({
  agent_protocol_error: Object.freeze({
    message: "The agent model response did not follow the required protocol.",
    retryable: false
  }),
  agent_loop_limit: Object.freeze({
    message: "The agent orchestration reached a safe execution limit.",
    retryable: false
  }),
  agent_deadline_exceeded: Object.freeze({
    message: "The agent orchestration exceeded its time limit.",
    retryable: true
  }),
  agent_tool_output_too_large: Object.freeze({
    message: "A tool result exceeded the safe output limit.",
    retryable: false
  }),
  mixed_action_batch_unsupported: Object.freeze({
    message: "An action tool cannot be combined with other tools in one model response.",
    retryable: false
  }),
  context_changed: Object.freeze({
    message: "The workspace branch or commit changed during the request.",
    retryable: true
  }),
  context_unavailable: Object.freeze({
    message: "The workspace context is unavailable.",
    retryable: true
  }),
  agent_internal_error: Object.freeze({
    message: "The agent orchestration could not be completed.",
    retryable: false
  })
});

const trustedAgentLoopErrors = new WeakSet();

class AgentLoopError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERROR_DEFINITIONS, code) ? code : "agent_internal_error";
    const definition = ERROR_DEFINITIONS[safeCode];
    super(definition.message);
    this.name = "AgentLoopError";
    this.code = safeCode;
    this.retryable = definition.retryable;
    this.details = Object.freeze({});
    trustedAgentLoopErrors.add(this);
    delete this.stack;
    Object.freeze(this);
  }
}

function isTrustedAgentLoopError(error) {
  return Boolean(error && trustedAgentLoopErrors.has(error));
}

function loopError(code) {
  return new AgentLoopError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataDescriptors(value) {
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) {
    throw loopError("agent_protocol_error");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!Object.hasOwn(descriptor, "value")) throw loopError("agent_protocol_error");
  }
  return descriptors;
}

function copySafeJson(value, state, depth = 0) {
  if (depth > 64 || state.nodes >= 100_000) throw loopError("agent_protocol_error");
  state.nodes += 1;

  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw loopError("agent_protocol_error");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw loopError("agent_protocol_error");
  if (state.seen.has(value)) throw loopError("agent_protocol_error");
  state.seen.add(value);

  let copy;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw loopError("agent_protocol_error");
    }
    const descriptors = ownDataDescriptors(value);
    const keys = Object.keys(descriptors).filter((key) => key !== "length");
    if (keys.length !== value.length
      || keys.some((key, index) => key !== String(index))) {
      throw loopError("agent_protocol_error");
    }
    copy = keys.map((key) => copySafeJson(descriptors[key].value, state, depth + 1));
  } else {
    if (!isPlainObject(value)) throw loopError("agent_protocol_error");
    const descriptors = ownDataDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    copy = Object.create(null);
    for (const key of keys) {
      if (!descriptors[key].enumerable || DANGEROUS_JSON_KEYS.has(key)) {
        throw loopError("agent_protocol_error");
      }
      copy[key] = copySafeJson(descriptors[key].value, state, depth + 1);
    }
  }

  state.seen.delete(value);
  return Object.freeze(copy);
}

function safeJsonCopy(value) {
  return copySafeJson(value, { seen: new WeakSet(), nodes: 0 });
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

function signatureHash(signature) {
  return crypto.createHash("sha256").update(signature, "utf8").digest("hex");
}

function validateInitialInput(input) {
  if (!isPlainObject(input)) throw loopError("agent_internal_error");
  let descriptors;
  try {
    descriptors = ownDataDescriptors(input);
  } catch (_) {
    throw loopError("agent_internal_error");
  }
  const inputKeys = Object.keys(descriptors).sort();
  if (inputKeys.length !== 2
    || inputKeys[0] !== "invocationContext"
    || inputKeys[1] !== "message"
    || typeof descriptors.message.value !== "string"
    || descriptors.message.value.trim().length === 0
    || !isPlainObject(descriptors.invocationContext.value)) {
    throw loopError("agent_internal_error");
  }
  const context = descriptors.invocationContext.value;
  let contextDescriptors;
  try {
    contextDescriptors = ownDataDescriptors(context);
  } catch (_) {
    throw loopError("context_unavailable");
  }
  const contextFields = new Set(["requestId", "branch", "commit", "lab", "variant"]);
  if (Object.keys(contextDescriptors).some((field) => !contextFields.has(field))) {
    throw loopError("context_unavailable");
  }
  const safeContextString = (value, maxLength) => typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !FORBIDDEN_IDENTIFIER_CHARACTERS.test(value);
  if (!SAFE_REQUEST_ID_PATTERN.test(context.requestId || "")
    || !safeContextString(context.branch, 200)
    || !safeContextString(context.commit, 200)
    || !(context.lab === null || context.lab === undefined
      || safeContextString(context.lab, 80))
    || !(context.variant === null || context.variant === undefined
      || safeContextString(context.variant, 80))) {
    throw loopError("context_unavailable");
  }
  return Object.freeze({
    message: descriptors.message.value,
    context: Object.freeze({
      requestId: context.requestId,
      branch: context.branch,
      commit: context.commit,
      lab: context.lab ?? null,
      variant: context.variant ?? null
    })
  });
}

function readToolCall(value) {
  if (!isPlainObject(value)) throw loopError("agent_protocol_error");
  const descriptors = ownDataDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== 3
    || keys[0] !== "arguments"
    || keys[1] !== "callId"
    || keys[2] !== "toolName") {
    throw loopError("agent_protocol_error");
  }
  const callId = descriptors.callId.value;
  const toolName = descriptors.toolName.value;
  if (typeof callId !== "string"
    || callId.trim().length === 0
    || callId.length > MAX_CALL_ID_LENGTH
    || FORBIDDEN_IDENTIFIER_CHARACTERS.test(callId)
    || typeof toolName !== "string"
    || !TOOL_SCHEMA_NAMES.includes(toolName)) {
    throw loopError("agent_protocol_error");
  }
  const args = safeJsonCopy(descriptors.arguments.value);
  if (!isPlainObject(args)) throw loopError("agent_protocol_error");
  return Object.freeze({ callId, toolName, arguments: args });
}

function readModelResult(value) {
  if (!isPlainObject(value)) throw loopError("agent_protocol_error");
  const descriptors = ownDataDescriptors(value);
  const kind = descriptors.kind?.value;

  if (kind === "final") {
    const keys = Object.keys(descriptors).sort();
    const validKeys = keys.length === 2 && keys[0] === "answer" && keys[1] === "kind";
    const validContinuationKeys = keys.length === 3
      && keys[0] === "answer"
      && keys[1] === "continuationState"
      && keys[2] === "kind";
    if (!validKeys && !validContinuationKeys) {
      throw loopError("agent_protocol_error");
    }
    if (typeof descriptors.answer.value !== "string") {
      throw loopError("agent_protocol_error");
    }
    const answer = descriptors.answer.value.trim();
    if (answer.length === 0
      || answer.length > MAX_AGENT_ANSWER_LENGTH
      || FORBIDDEN_ANSWER_CHARACTERS.test(answer)) {
      throw loopError("agent_protocol_error");
    }
    return Object.freeze({ kind, answer });
  }

  if (kind !== "tool_calls") throw loopError("agent_protocol_error");
  const keys = Object.keys(descriptors).sort();
  const validKeys = keys.length === 2 && keys[0] === "calls" && keys[1] === "kind";
  const validContinuationKeys = keys.length === 3
    && keys[0] === "calls"
    && keys[1] === "continuationState"
    && keys[2] === "kind";
  if ((!validKeys && !validContinuationKeys)
    || !Array.isArray(descriptors.calls.value)
    || Object.getPrototypeOf(descriptors.calls.value) !== Array.prototype
    || descriptors.calls.value.length < 1) {
    throw loopError("agent_protocol_error");
  }
  const rawCalls = descriptors.calls.value;
  const callDescriptors = ownDataDescriptors(rawCalls);
  const callKeys = Object.keys(callDescriptors).filter((key) => key !== "length");
  if (callKeys.length !== rawCalls.length
    || callKeys.some((key, index) => key !== String(index))) {
    throw loopError("agent_protocol_error");
  }
  return Object.freeze({
    kind,
    calls: Object.freeze(callKeys.map((key) => readToolCall(callDescriptors[key].value))),
    continuationState: descriptors.continuationState?.value ?? null
  });
}

function validateToolResult(value, expectedTool) {
  let result;
  try {
    result = safeJsonCopy(value);
  } catch (_) {
    throw loopError("agent_internal_error");
  }
  if (!isPlainObject(result)
    || result.contractVersion !== TOOL_CONTRACT_VERSION
    || result.tool !== expectedTool
    || typeof result.ok !== "boolean"
    || !Object.hasOwn(result, "data")
    || !Object.hasOwn(result, "error")
    || !isPlainObject(result.meta)) {
    throw loopError("agent_internal_error");
  }
  if (result.ok) {
    if (!isPlainObject(result.data) || result.error !== null) {
      throw loopError("agent_internal_error");
    }
  } else if (result.data !== null
    || !isPlainObject(result.error)
    || typeof result.error.code !== "string"
    || result.error.code.length === 0
    || typeof result.error.message !== "string"
    || typeof result.error.retryable !== "boolean"
    || !isPlainObject(result.error.details)) {
    throw loopError("agent_internal_error");
  }
  return result;
}

function requiresFinalAnswerAfterTool(toolName, toolResult) {
  if (toolName === "run_test") {
    return toolResult.ok && toolResult.data.status === "started";
  }
  return toolName === "get_qemu_events"
    && toolResult.ok
    && Array.isArray(toolResult.data.events)
    && toolResult.data.events.length === 0
    && toolResult.data.returnedCount === 0
    && toolResult.data.totalMatched === 0;
}

function buildDispatch(toolDispatch) {
  if (!isPlainObject(toolDispatch)) {
    throw new TypeError("toolDispatch must be a plain object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(toolDispatch);
  const names = Object.keys(descriptors).sort();
  const expected = [...TOOL_SCHEMA_NAMES].sort();
  if (names.length !== expected.length
    || names.some((name, index) => name !== expected[index])) {
    throw new TypeError("toolDispatch must match the production tool schemas exactly.");
  }
  const copy = Object.create(null);
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
      throw new TypeError("Every toolDispatch entry must be a function.");
    }
    copy[name] = descriptor.value;
  }
  return Object.freeze(copy);
}

function createAgentLoop(options = {}) {
  if (!options.model || typeof options.model.step !== "function") {
    throw new TypeError("model.step is required.");
  }
  if (typeof options.readContext !== "function") {
    throw new TypeError("readContext is required.");
  }
  const dispatch = buildDispatch(options.toolDispatch);
  const now = options.now || Date.now;
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  const isTrustedModelError = options.isTrustedModelError || (() => false);
  if (typeof isTrustedModelError !== "function") {
    throw new TypeError("isTrustedModelError must be a function.");
  }
  const retrieveKnowledge = options.retrieveKnowledge || (() => Object.freeze([]));
  if (typeof retrieveKnowledge !== "function") {
    throw new TypeError("retrieveKnowledge must be a function.");
  }
  const agentLimitLogger = options.agentLimitLogger === undefined
    ? ((line) => console.error(line))
    : options.agentLimitLogger;
  if (typeof agentLimitLogger !== "function") {
    throw new TypeError("agentLimitLogger must be a function.");
  }

  return Object.freeze({
    async run(input) {
      try {
        const initial = validateInitialInput(input);
        const startedAt = now();
        if (!Number.isFinite(startedAt)) throw loopError("agent_internal_error");
        const deadline = startedAt + MAX_AGENT_DURATION_MS;
        let courseKnowledge;
        try {
          courseKnowledge = safeJsonCopy(await retrieveKnowledge(Object.freeze({
            query: initial.message,
            lab: initial.context.lab,
            limit: 4,
            maxHintLevel: 3
          })));
        } catch (_) {
          throw loopError("agent_internal_error");
        }
        if (!Array.isArray(courseKnowledge) || courseKnowledge.length > 5) {
          throw loopError("agent_internal_error");
        }
        const toolInvocationContext = Object.freeze({
          requestId: initial.context.requestId,
          expectedBranch: initial.context.branch,
          expectedCommit: initial.context.commit
        });
        const callIds = new Set();
        const callSignatures = new Set();
        const toolCounts = Object.create(null);
        let toolCalls = 0;
        let totalOutputBytes = 0;
        let continuationState = null;
        let toolOutputs = null;
        let finalizationOnly = false;

        const raiseAgentLimit = (metadata) => {
          const fields = [
            `requestId=${initial.context.requestId}`,
            `reason=${metadata.reason}`,
            `modelTurn=${metadata.modelTurn}`,
            `toolCalls=${toolCalls}`,
            `maxToolCalls=${MAX_TOOL_CALLS}`
          ];
          if (metadata.toolName) fields.push(`toolName=${metadata.toolName}`);
          if (metadata.signatureHash) fields.push(`signatureHash=${metadata.signatureHash}`);
          if (Number.isInteger(metadata.toolCount)) {
            fields.push(`toolCount=${metadata.toolCount}`);
          }
          if (Number.isInteger(metadata.toolLimit)) {
            fields.push(`toolLimit=${metadata.toolLimit}`);
          }
          if (Number.isInteger(metadata.batchSize)) fields.push(`batchSize=${metadata.batchSize}`);
          if (Number.isInteger(metadata.remainingToolBudget)) {
            fields.push(`remainingToolBudget=${metadata.remainingToolBudget}`);
          }
          try {
            agentLimitLogger(`[agent-limit] ${fields.join(" ")}`);
          } catch (_) {
            // Observability must not change the existing safety failure path.
          }
          throw loopError("agent_loop_limit");
        };

        const checkDeadline = () => {
          const current = now();
          if (!Number.isFinite(current)) throw loopError("agent_internal_error");
          if (current >= deadline) throw loopError("agent_deadline_exceeded");
        };
        const checkContext = async () => {
          let current;
          try {
            current = await options.readContext();
          } catch (_) {
            throw loopError("context_unavailable");
          }
          if (!isPlainObject(current)
            || typeof current.branch !== "string"
            || typeof current.commit !== "string"
            || current.branch.length === 0
            || current.branch.length > 200
            || current.commit.length === 0
            || current.commit.length > 200
            || FORBIDDEN_IDENTIFIER_CHARACTERS.test(current.branch)
            || FORBIDDEN_IDENTIFIER_CHARACTERS.test(current.commit)) {
            throw loopError("context_unavailable");
          }
          if (current.branch !== initial.context.branch
            || current.commit !== initial.context.commit) {
            throw loopError("context_changed");
          }
        };

        for (let turn = 0; turn < MAX_MODEL_TURNS; turn += 1) {
          checkDeadline();
          await checkContext();
          const modelResult = await options.model.step(Object.freeze({
            requestId: initial.context.requestId,
            message: turn === 0 ? initial.message : null,
            tools: TOOL_SCHEMAS,
            continuationState,
            toolOutputs,
            finalizationOnly,
            courseKnowledge
          }));
          checkDeadline();
          await checkContext();

          const step = readModelResult(modelResult);
          if (step.kind === "final") return Object.freeze({ answer: step.answer });
          if (finalizationOnly) {
            if (toolCalls >= MAX_TOOL_CALLS) {
              raiseAgentLimit({
                reason: "max_tool_calls_after_finalization",
                modelTurn: turn + 1
              });
            }
            throw loopError("agent_protocol_error");
          }
          if (toolCalls + step.calls.length > MAX_TOOL_CALLS) {
            raiseAgentLimit({
              reason: "batch_would_exceed_max_tool_calls",
              modelTurn: turn + 1,
              batchSize: step.calls.length,
              remainingToolBudget: MAX_TOOL_CALLS - toolCalls
            });
          }
          if (step.calls.length > 1
            && step.calls.some((call) => call.toolName === "run_test")) {
            throw loopError("mixed_action_batch_unsupported");
          }

          const batchCallIds = new Set();
          const batchSignatures = new Set();
          const batchToolCounts = Object.create(null);
          for (const call of step.calls) {
            if (callIds.has(call.callId) || batchCallIds.has(call.callId)) {
              throw loopError("agent_protocol_error");
            }
            const signature = `${call.toolName}:${canonicalJson(call.arguments)}`;
            if (callSignatures.has(signature) || batchSignatures.has(signature)) {
              raiseAgentLimit({
                reason: "duplicate_signature",
                modelTurn: turn + 1,
                toolName: call.toolName,
                signatureHash: signatureHash(signature)
              });
            }
            const pendingCount = batchToolCounts[call.toolName] || 0;
            const toolCount = (toolCounts[call.toolName] || 0) + pendingCount;
            if (toolCount >= TOOL_REPEAT_LIMITS[call.toolName]) {
              raiseAgentLimit({
                reason: "tool_repeat_limit",
                modelTurn: turn + 1,
                toolName: call.toolName,
                toolCount,
                toolLimit: TOOL_REPEAT_LIMITS[call.toolName]
              });
            }
            batchCallIds.add(call.callId);
            batchSignatures.add(signature);
            batchToolCounts[call.toolName] = pendingCount + 1;
          }

          const batchOutputs = [];
          for (const call of step.calls) {
            checkDeadline();
            await checkContext();
            let rawResult;
            try {
              rawResult = await dispatch[call.toolName](call.arguments, toolInvocationContext);
            } catch (_) {
              throw loopError("agent_internal_error");
            }
            checkDeadline();
            await checkContext();

            const toolResult = validateToolResult(rawResult, call.toolName);
            if (!toolResult.ok
              && ["context_changed", "context_unavailable"].includes(toolResult.error.code)) {
              throw loopError(toolResult.error.code);
            }
            const serialized = JSON.stringify(toolResult);
            const outputBytes = Buffer.byteLength(serialized, "utf8");
            if (outputBytes > TOOL_OUTPUT_BUDGET_BYTES[call.toolName]
              || totalOutputBytes + outputBytes > MAX_TOTAL_TOOL_OUTPUT_BYTES) {
              throw loopError("agent_tool_output_too_large");
            }

            totalOutputBytes += outputBytes;
            toolCalls += 1;
            toolCounts[call.toolName] = (toolCounts[call.toolName] || 0) + 1;
            callIds.add(call.callId);
            callSignatures.add(`${call.toolName}:${canonicalJson(call.arguments)}`);
            batchOutputs.push(Object.freeze({
              callId: call.callId,
              toolName: call.toolName,
              output: serialized
            }));
            if (requiresFinalAnswerAfterTool(call.toolName, toolResult)) {
              finalizationOnly = true;
            }
          }
          continuationState = step.continuationState;
          toolOutputs = Object.freeze(batchOutputs);
          if (toolCalls >= MAX_TOOL_CALLS) finalizationOnly = true;
        }
        raiseAgentLimit({
          reason: "max_model_turns_exhausted",
          modelTurn: MAX_MODEL_TURNS
        });
      } catch (error) {
        if (isTrustedAgentLoopError(error)) throw error;
        if (isTrustedModelError(error)) throw error;
        throw loopError("agent_internal_error");
      }
    }
  });
}

module.exports = {
  AgentLoopError,
  MAX_AGENT_DURATION_MS,
  MAX_MODEL_TURNS,
  MAX_TOOL_CALLS,
  MAX_TOTAL_TOOL_OUTPUT_BYTES,
  TOOL_OUTPUT_BUDGET_BYTES,
  TOOL_REPEAT_LIMITS,
  createAgentLoop,
  isTrustedAgentLoopError
};
