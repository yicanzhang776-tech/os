"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const state = require("./agent-handoff-state");

test("handoff fragment is removed before the token is returned", () => {
  const calls = [];
  const location = { hash: "#handoff=AAAAAAAAAAAAAAAAAAAAAA", pathname: "/agent.html", search: "?mode=study" };
  const token = state.readAndClearHandoffToken(location, {
    replaceState(...args) { calls.push(args); }
  });
  assert.equal(token, "AAAAAAAAAAAAAAAAAAAAAA");
  assert.deepEqual(calls, [[null, "", "/agent.html?mode=study"]]);
});

test("invalid handoff fragments are cleared and never consumed", async () => {
  let consumed = false;
  const history = { replaceState() {} };
  const result = await state.consumeLocationHandoff({
    location: { hash: "#handoff=not-a-token", pathname: "/agent.html", search: "" },
    history,
    client: { async consumeAgentHandoff() { consumed = true; } }
  });
  assert.equal(result, null);
  assert.equal(consumed, false);
});

test("valid handoff delegates only the one-time token to the client", async () => {
  const calls = [];
  const result = await state.consumeLocationHandoff({
    location: { hash: "#handoff=BBBBBBBBBBBBBBBBBBBBBB", pathname: "/agent.html", search: "" },
    history: { replaceState() {} },
    fetchImpl: "fetch-sentinel",
    client: {
      async consumeAgentHandoff(token, options) { calls.push({ token, options }); return "调试页表"; }
    }
  });
  assert.equal(result, "调试页表");
  assert.deepEqual(calls, [{ token: "BBBBBBBBBBBBBBBBBBBBBB", options: { fetchImpl: "fetch-sentinel" } }]);
});
