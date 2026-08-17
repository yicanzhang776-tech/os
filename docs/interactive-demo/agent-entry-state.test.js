"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AGENT_ENTRY_KEY,
  savePendingPrompt,
  consumePendingPrompt,
  clearPendingPrompt
} = require("./agent-entry-state");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key) ?? null
  };
}

test("a pending prompt is consumed exactly once", () => {
  const storage = memoryStorage();
  assert.equal(savePendingPrompt(storage, "  涓轰粈涔堟病鏈夎緭鍑猴紵  "), true);
  assert.equal(consumePendingPrompt(storage), "涓轰粈涔堟病鏈夎緭鍑猴紵");
  assert.equal(consumePendingPrompt(storage), null);
});

test("invalid, damaged, and inaccessible storage never produces a prompt", () => {
  assert.equal(savePendingPrompt(memoryStorage(), "\u0000"), false);
  assert.equal(consumePendingPrompt(memoryStorage({ [AGENT_ENTRY_KEY]: "{" })), null);
  assert.equal(consumePendingPrompt({ getItem() { throw new Error("blocked"); } }), null);
});

test("unavailable storage cannot save or clear a pending prompt", () => {
  assert.equal(savePendingPrompt(undefined, "valid prompt"), false);
  assert.equal(savePendingPrompt({ getItem() { return null; } }, "valid prompt"), false);
  assert.equal(clearPendingPrompt(undefined), false);
  assert.equal(clearPendingPrompt({}), false);
});

test("clear removes a pending prompt without exposing its value", () => {
  const storage = memoryStorage();
  assert.equal(savePendingPrompt(storage, "  explain yield  "), true);
  assert.equal(clearPendingPrompt(storage), true);
  assert.equal(storage.value(AGENT_ENTRY_KEY), null);
  assert.equal(consumePendingPrompt(storage), null);
});

test("available client validation is used for pending prompts", () => {
  const previous = globalThis.OsTeachingAgentClient;
  globalThis.OsTeachingAgentClient = {
    validateAgentMessage(value) {
      if (value !== "accepted by client" && value !== "normalized by client") {
        throw new Error("rejected by client");
      }
      return value === "accepted by client" ? "normalized by client" : value;
    }
  };
  try {
    const storage = memoryStorage();
    assert.equal(savePendingPrompt(storage, "accepted by client"), true);
    assert.equal(consumePendingPrompt(storage), "normalized by client");
  } finally {
    if (previous === undefined) delete globalThis.OsTeachingAgentClient;
    else globalThis.OsTeachingAgentClient = previous;
  }
});
