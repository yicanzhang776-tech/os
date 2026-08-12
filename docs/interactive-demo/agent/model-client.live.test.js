"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createArkModelClient } = require("./model-client");

const liveEnabled = process.env.ARK_LIVE_TEST === "1";

test("explicit Ark Agent Plan live smoke test", { skip: !liveEnabled }, async () => {
  const client = createArkModelClient({
    fetchImpl: globalThis.fetch,
    apiKeyProvider: () => process.env.ARK_API_KEY,
    baseUrl: process.env.ARK_BASE_URL,
    model: process.env.ARK_MODEL
  });
  const answer = await client.respond({
    message: "Briefly define a process in an operating system.",
    requestId: "agent-live-smoke"
  });
  assert.equal(typeof answer, "string");
  assert.ok(answer.length > 0);
});
