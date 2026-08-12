"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { AgentApiError } = require("./api");
const { ModelClientError } = require("./model-client");
const { createProductionAgentHandler } = require("./model-handler");

const INVOCATION_CONTEXT = Object.freeze({
  requestId: "agent-handler-1",
  branch: "lab4-starter",
  commit: "abc1234",
  lab: "lab4",
  variant: "starter"
});

test("the production handler returns one answer and sends only message plus requestId", async () => {
  const calls = [];
  const handler = createProductionAgentHandler({
    modelClient: {
      async respond(input) {
        calls.push(input);
        return "safe answer";
      }
    }
  });
  assert.deepEqual(await handler({ message: "hello", invocationContext: INVOCATION_CONTEXT }), {
    answer: "safe answer"
  });
  assert.deepEqual(calls, [{ message: "hello", requestId: "agent-handler-1" }]);
  assert.doesNotMatch(JSON.stringify(calls), /lab4|starter|abc1234|branch|commit|variant/);
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
      const handler = createProductionAgentHandler({
        modelClient: { respond: async () => { throw new ModelClientError(code); } }
      });
      await assert.rejects(
        handler({ message: "hello", invocationContext: INVOCATION_CONTEXT }),
        (error) => {
          assert.equal(error instanceof AgentApiError, true);
          assert.equal(error.code, code);
          assert.deepEqual(error.details, {});
          return true;
        }
      );
    });
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
      const handler = createProductionAgentHandler({
        modelClient: { respond: async () => { throw thrown; } }
      });
      await assert.rejects(
        handler({ message: "hello", invocationContext: INVOCATION_CONTEXT }),
        (error) => {
          assert.equal(error.code, "model_internal_error");
          assert.equal(error.message, "The model request could not be completed.");
          assert.deepEqual(error.details, {});
          assert.doesNotMatch(`${JSON.stringify(error)}\n${error.stack}`, /private|Authorization|secret|trust me|token|STACK/);
          return true;
        }
      );
    });
  }
});

test("the production handler requires only a narrow model client", () => {
  assert.throws(() => createProductionAgentHandler(), /modelClient\.respond is required/);
  assert.throws(() => createProductionAgentHandler({ modelClient: {} }), /modelClient\.respond is required/);
});

