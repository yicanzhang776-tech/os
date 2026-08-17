"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AGENT_TRANSCRIPT_KEY,
  MAX_TRANSCRIPT_MESSAGES,
  appendMessage,
  clearTranscript,
  createRequestGate,
  isAgentSubmitShortcut,
  lastRetryablePrompt,
  loadTranscript,
  saveTranscript
} = require("./agent-chat-state");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key) ?? null
  };
}

test("chat keeps bounded plain-text user and assistant messages", () => {
  let transcript = [];
  for (let index = 0; index < MAX_TRANSCRIPT_MESSAGES + 4; index += 1) {
    transcript = appendMessage(transcript, {
      id: `m-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message ${index}`,
      status: "complete"
    });
  }
  assert.equal(transcript.length, MAX_TRANSCRIPT_MESSAGES);
  assert.equal(transcript[0].id, "m-4");
  assert.equal(transcript.at(-1).content, `message ${MAX_TRANSCRIPT_MESSAGES + 3}`);
  assert.throws(() => appendMessage(transcript, { role: "system", content: "hidden" }), /invalid_agent_message/);
  assert.throws(() => appendMessage(transcript, { role: "user", content: "\u0000" }), /invalid_agent_message/);
});

test("retry selects the latest failed or unanswered user prompt", () => {
  const transcript = [
    { id: "u1", role: "user", content: "first", status: "complete" },
    { id: "a1", role: "assistant", content: "answer", status: "complete" },
    { id: "u2", role: "user", content: "second", status: "failed" }
  ];
  assert.equal(lastRetryablePrompt(transcript), "second");
  assert.equal(lastRetryablePrompt(transcript.slice(0, 2)), null);
});

test("session transcript survives reload without retaining unsupported fields", () => {
  const storage = memoryStorage();
  const messages = [
    { id: "u1", role: "user", content: "为什么没有任务切换？", status: "complete", secret: "drop" },
    { id: "a1", role: "assistant", content: "先检查 yield 事件。", status: "complete", html: "<b>drop</b>" }
  ];
  assert.equal(saveTranscript(storage, messages), true);
  assert.deepEqual(loadTranscript(storage), [
    { id: "u1", role: "user", content: "为什么没有任务切换？", status: "complete" },
    { id: "a1", role: "assistant", content: "先检查 yield 事件。", status: "complete" }
  ]);
  assert.doesNotMatch(storage.value(AGENT_TRANSCRIPT_KEY), /secret|html|<b>/);
});

test("damaged storage and clear always return an empty transcript", () => {
  assert.deepEqual(loadTranscript(memoryStorage({ [AGENT_TRANSCRIPT_KEY]: "{" })), []);
  assert.deepEqual(loadTranscript({ getItem: () => { throw new Error("blocked"); } }), []);
  const storage = memoryStorage({ [AGENT_TRANSCRIPT_KEY]: "[]" });
  assert.equal(clearTranscript(storage), true);
  assert.equal(storage.value(AGENT_TRANSCRIPT_KEY), null);
});

test("clearing a conversation invalidates an in-flight agent response", () => {
  const gate = createRequestGate();
  const first = gate.begin();
  assert.equal(gate.isCurrent(first), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);
  const second = gate.begin();
  assert.equal(gate.isCurrent(second), true);
  assert.notEqual(second, first);
});

test("agent submit shortcut never fires during IME composition", () => {
  assert.equal(isAgentSubmitShortcut({ key: "Enter", ctrlKey: true, isComposing: false }), true);
  assert.equal(isAgentSubmitShortcut({ key: "Enter", metaKey: true, isComposing: false }), true);
  assert.equal(isAgentSubmitShortcut({ key: "Enter", ctrlKey: true, isComposing: true }), false);
  assert.equal(isAgentSubmitShortcut({ key: "Enter", ctrlKey: true, keyCode: 229 }), false);
  assert.equal(isAgentSubmitShortcut({ key: "Enter", shiftKey: true }), false);
  assert.equal(isAgentSubmitShortcut({ key: "a", ctrlKey: true }), false);
});
