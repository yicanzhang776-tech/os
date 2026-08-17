"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LEGACY_UI_STORAGE_KEY,
  WORKSPACE_VIEW_KEY,
  clearLegacyUiPreference,
  loadWorkspaceView,
  removeLegacyUiParameter,
  saveWorkspaceView
} = require("./ui-shell-state");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key) ?? null
  };
}

test("legacy UI parameters are removed while presentation and Lab state survive", () => {
  assert.equal(
    removeLegacyUiParameter("http://127.0.0.1:8888/?mode=presentation&lab=lab4&ui=signal#evidence"),
    "http://127.0.0.1:8888/?mode=presentation&lab=lab4#evidence"
  );
  assert.equal(removeLegacyUiParameter("http://127.0.0.1:8888/?ui=atlas"), "http://127.0.0.1:8888/");
  assert.equal(removeLegacyUiParameter("http://127.0.0.1:8888/?lab=lab2"), null);
  assert.equal(removeLegacyUiParameter("not a URL"), null);
});

test("legacy candidate preference is removed without touching workspace state", () => {
  const storage = memoryStorage({
    [LEGACY_UI_STORAGE_KEY]: "signal",
    [WORKSPACE_VIEW_KEY]: "evidence"
  });
  assert.equal(clearLegacyUiPreference(storage), true);
  assert.equal(storage.value(LEGACY_UI_STORAGE_KEY), null);
  assert.equal(storage.value(WORKSPACE_VIEW_KEY), "evidence");
  assert.equal(clearLegacyUiPreference({ removeItem: () => { throw new Error("blocked"); } }), false);
});

test("workspace view is bounded to experiment, evidence, and reflect", () => {
  const storage = memoryStorage({ [WORKSPACE_VIEW_KEY]: "evidence" });
  assert.equal(loadWorkspaceView(storage), "evidence");
  assert.equal(saveWorkspaceView(storage, "reflect"), true);
  assert.equal(storage.value(WORKSPACE_VIEW_KEY), "reflect");
  assert.equal(saveWorkspaceView(storage, "settings"), false);
  assert.equal(loadWorkspaceView(memoryStorage({ [WORKSPACE_VIEW_KEY]: "bad" })), "experiment");
});
