"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const motion = require("./agent-pet-motion");

test("pet position clamps, snaps, and survives viewport changes", () => {
  const viewport = { width: 1000, height: 700 };
  const size = { width: 104, height: 104 };
  assert.deepEqual(motion.clampPetPosition({ x: -50, y: 900 }, viewport, size), { x: 12, y: 584 });
  const snapped = motion.snapPetPosition({ x: 760, y: 300 }, viewport, size);
  assert.equal(snapped.side, "right");
  assert.equal(snapped.x, 884);
  const restored = motion.positionFromPreference(snapped.preference, { width: 600, height: 500 }, size);
  assert.equal(restored.side, "right");
  assert.equal(restored.x, 484);
  assert.ok(restored.y >= 12 && restored.y <= 384);
});

test("position storage accepts only the bounded privacy-safe schema", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  assert.equal(motion.writePosition(storage, { side: "left", yRatio: 0.25, prompt: "secret" }), true);
  assert.deepEqual(motion.readPosition(storage), { version: 1, side: "left", yRatio: 0.25 });
  assert.doesNotMatch(values.get(motion.POSITION_KEY), /secret|prompt/);
  values.set(motion.POSITION_KEY, "{broken");
  assert.equal(motion.readPosition(storage), null);
  assert.equal(motion.clearPosition(storage), true);
});

test("drag distance uses the six pixel click threshold", () => {
  assert.equal(motion.DRAG_THRESHOLD, 6);
  assert.equal(motion.dragDistance({ x: 1, y: 1 }, { x: 4, y: 5 }), 5);
  assert.equal(motion.dragDistance({ x: 0, y: 0 }, { x: 6, y: 0 }), 6);
});

test("quiet motion delay stays between sixty and one hundred twenty seconds", () => {
  assert.equal(motion.motionDelay(() => 0), 60_000);
  assert.equal(motion.motionDelay(() => 0.999999), 120_000);
});

test("action choice avoids immediate repetition and gates sleep on inactivity", () => {
  assert.notEqual(motion.chooseAction("blink", { random: () => 0, idleMs: 0 }), "blink");
  const sleep = motion.chooseAction("type", { random: () => 0.999999, idleMs: motion.SLEEP_IDLE_MS });
  assert.equal(sleep, "sleep");
});

test("motion director pauses and lets runtime states override idle actions", () => {
  const timers = [];
  const poses = [];
  const director = motion.createMotionDirector({
    random: () => 0,
    onPose(pose) { poses.push(pose); },
    setTimer(callback, delay) { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimer(timer) { timer.cleared = true; }
  });
  director.start();
  assert.equal(timers[0].delay, 60_000);
  timers[0].callback();
  assert.equal(poses.at(-1), "blink");
  director.setRuntimeState("running");
  assert.equal(poses.at(-1), "type");
  director.setRuntimeState("error");
  assert.equal(poses.at(-1), "alert");
  director.setPaused(true);
  assert.equal(poses.at(-1), "alert");
  director.stop();
  assert.equal(poses.at(-1), "idle");
});
