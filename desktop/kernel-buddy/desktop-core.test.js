"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const core = require("./desktop-core");
const { createSettingsStore } = require("./settings-store");

test("desktop companion accepts only fixed loopback bridge origins", () => {
  assert.equal(core.bridgeOrigin(8888), "http://127.0.0.1:8888");
  assert.equal(core.validateBridgeOrigin("http://127.0.0.1:8896"), "http://127.0.0.1:8896");
  for (const value of ["https://127.0.0.1:8888", "http://localhost:8888", "http://127.0.0.1:8888/path", "http://user@127.0.0.1:8888"]) {
    assert.throws(() => core.validateBridgeOrigin(value));
  }
});

test("tutor URLs contain one validated fragment token", () => {
  assert.equal(
    core.buildTutorUrl("http://127.0.0.1:8888", "AAAAAAAAAAAAAAAAAAAAAA"),
    "http://127.0.0.1:8888/agent.html#handoff=AAAAAAAAAAAAAAAAAAAAAA"
  );
  assert.throws(() => core.buildTutorUrl("http://127.0.0.1:8888", "bad?token"));
});

test("window configurations are fixed-size, transparent where needed, and sandboxed", () => {
  const pet = core.petWindowOptions({ x: 10, y: 20 }, "preload.js", true);
  assert.equal(pet.width, 156);
  assert.equal(pet.height, 184);
  assert.equal(pet.transparent, true);
  assert.equal(pet.frame, false);
  assert.equal(pet.alwaysOnTop, true);
  assert.equal(pet.resizable, false);
  assert.deepEqual(pet.webPreferences, {
    preload: "preload.js",
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false
  });
  const prompt = core.promptWindowOptions({ x: 30, y: 40 }, "preload.js");
  assert.equal(prompt.width, 380);
  assert.equal(prompt.height, 330);
  assert.equal(prompt.transparent, undefined);
  assert.equal(prompt.resizable, false);
});

test("position restoration clamps to the nearest visible work area", () => {
  assert.deepEqual(core.clampToWorkArea({ x: -500, y: 2000 }, { x: 100, y: 50, width: 1200, height: 800 }), { x: 100, y: 666 });
  const fallback = core.clampToWorkArea({}, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(fallback, { x: 1740, y: 872 });
});

test("context mapping lets runtime evidence preempt quiet idle motion", () => {
  assert.equal(core.mapContextState({ runState: { running: true, phase: "building" } }), "running");
  assert.equal(core.mapContextState({ runState: { running: false, phase: "failed", detail: "QEMU 超时" } }), "error");
  assert.equal(core.mapContextState({ runState: { running: false, phase: "idle" } }), "idle");
});

test("settings persistence stores only position and companion preferences", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-buddy-test-"));
  const file = path.join(directory, "settings.json");
  try {
    const store = createSettingsStore(file);
    store.read();
    store.write({ x: 10.4, y: 20.8, displayId: 7, alwaysOnTop: false, motionPaused: true, prompt: "secret", apiKey: "ark-secret" });
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(parsed, { version: 1, x: 10, y: 21, displayId: "7", alwaysOnTop: false, motionPaused: true });
    assert.doesNotMatch(JSON.stringify(parsed), /prompt|apiKey|secret|ark-/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
