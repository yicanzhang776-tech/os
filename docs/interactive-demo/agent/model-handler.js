"use strict";

const { AgentApiError } = require("./api");
const { isTrustedAgentLoopError } = require("./agent-loop");
const { isTrustedModelClientError } = require("./model-client");

const MODEL_ERROR_CODES = new Set([
  "model_not_configured",
  "model_auth_failed",
  "model_rate_limited",
  "model_timeout",
  "model_request_failed",
  "model_upstream_error",
  "model_unavailable",
  "model_invalid_response",
  "model_internal_error"
]);
const DIRECT_AGENT_ERROR_CODES = new Set(["context_changed", "context_unavailable"]);

function createProductionAgentHandler(options = {}) {
  const agentLoop = options.agentLoop;
  if (!agentLoop || typeof agentLoop.run !== "function") {
    throw new TypeError("agentLoop.run is required.");
  }

  return async function handleAgentRequest(input = {}) {
    try {
      return await agentLoop.run({
        message: input.message,
        invocationContext: input.invocationContext
      });
    } catch (error) {
      if (isTrustedModelClientError(error) && MODEL_ERROR_CODES.has(error.code)) {
        throw new AgentApiError(error.code);
      }
      if (isTrustedAgentLoopError(error) && DIRECT_AGENT_ERROR_CODES.has(error.code)) {
        throw new AgentApiError(error.code);
      }
      throw new AgentApiError("agent_internal_error");
    }
  };
}

module.exports = {
  createProductionAgentHandler
};
