"use strict";

const { AgentApiError } = require("./api");
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

function createProductionAgentHandler(options = {}) {
  const modelClient = options.modelClient;
  if (!modelClient || typeof modelClient.respond !== "function") {
    throw new TypeError("modelClient.respond is required.");
  }

  return async function handleAgentRequest(input = {}) {
    try {
      const answer = await modelClient.respond({
        message: input.message,
        requestId: input.invocationContext?.requestId
      });
      return { answer };
    } catch (error) {
      if (isTrustedModelClientError(error) && MODEL_ERROR_CODES.has(error.code)) {
        throw new AgentApiError(error.code);
      }
      throw new AgentApiError("model_internal_error");
    }
  };
}

module.exports = {
  createProductionAgentHandler
};
