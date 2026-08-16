"use strict";

const { createAgentLoop } = require("./agent-loop");
const { createArkModelClient, isTrustedModelClientError } = require("./model-client");
const { createProductionAgentHandler } = require("./model-handler");
const { createKnowledgeRetriever } = require("./knowledge-retriever");

const MAX_API_KEY_LENGTH = 4096;
const FORBIDDEN_API_KEY_CHARACTERS = /\s|[\u0000-\u001f\u007f]/;

function normalizeApiKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length === 0
    || key.length > MAX_API_KEY_LENGTH
    || FORBIDDEN_API_KEY_CHARACTERS.test(key)) {
    return null;
  }
  return key;
}

function createAgentRuntime(options = {}) {
  if (!options.toolDispatch || typeof options.toolDispatch !== "object") {
    throw new TypeError("toolDispatch is required.");
  }
  if (typeof options.readContext !== "function") {
    throw new TypeError("readContext is required.");
  }
  const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required.");
  const knowledgeStore = options.knowledgeRetriever === undefined
    ? createKnowledgeRetriever()
    : null;
  const knowledgeRetriever = knowledgeStore === null
    ? options.knowledgeRetriever
    : knowledgeStore.retrieveKnowledge;
  if (typeof knowledgeRetriever !== "function") {
    throw new TypeError("knowledgeRetriever must be a function.");
  }

  const environmentApiKey = normalizeApiKey(options.environmentApiKey);
  let sessionApiKey = null;

  function credentialSnapshot() {
    if (sessionApiKey) return Object.freeze({ apiKey: sessionApiKey, source: "session" });
    if (environmentApiKey) {
      return Object.freeze({ apiKey: environmentApiKey, source: "environment" });
    }
    return Object.freeze({ apiKey: null, source: "none" });
  }

  function createClient(snapshot) {
    return createArkModelClient({
      fetchImpl,
      apiKeyProvider: () => snapshot.apiKey,
      baseUrl: options.baseUrl,
      model: options.model
    });
  }

  function capabilities() {
    const snapshot = credentialSnapshot();
    const modelCapabilities = createClient(snapshot).getCapabilities();
    return Object.freeze({
      ...modelCapabilities,
      credentialSource: modelCapabilities.configured ? snapshot.source : "none"
    });
  }

  return Object.freeze({
    clearSessionApiKey() {
      sessionApiKey = null;
      return capabilities();
    },

    configureSessionApiKey(value) {
      const key = normalizeApiKey(value);
      if (!key) return null;
      sessionApiKey = key;
      return capabilities();
    },

    getCapabilities: capabilities,

    async handleAgentRequest(input) {
      const snapshot = credentialSnapshot();
      const model = createClient(snapshot);
      const agentLoop = createAgentLoop({
        model,
        toolDispatch: options.toolDispatch,
        readContext: options.readContext,
        retrieveKnowledge: knowledgeRetriever,
        isTrustedModelError: isTrustedModelClientError
      });
      return createProductionAgentHandler({ agentLoop })(input);
    }
  });
}

module.exports = {
  MAX_API_KEY_LENGTH,
  createAgentRuntime,
  normalizeApiKey
};
