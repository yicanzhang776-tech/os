"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SPEEDS,
  createTimelineController,
  eventDurationMs,
  eventMatches,
  firstFailureIndex,
  firstRunDifference,
  timelineStats,
  visibleEventIndexes
} = require("./timeline-controller");
const { computeState } = require("./state-model");
const {
  compareRuns,
  createRunRecord,
  loadRuns,
  saveRun
} = require("./run-history");

function event(step, index = 0, overrides = {}) {
  return {
    protocol: "os-demo.event/v1",
    lab: "lab2",
    step,
    status: "running",
    detail: step,
    source: "bridge",
    sequence: index + 1,
    timestamp: index * 100,
    ...overrides
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function fakeClock() {
  let nextId = 1;
  const active = new Map();
  const records = [];
  return {
    setTimeout(callback, delay) {
      const record = { id: nextId, callback, delay, canceled: false };
      nextId += 1;
      records.push(record);
      active.set(record.id, record);
      return record.id;
    },
    clearTimeout(id) {
      const record = active.get(id);
      if (record) record.canceled = true;
      active.delete(id);
    },
    fireNext() {
      const record = active.values().next().value;
      if (!record) return false;
      active.delete(record.id);
      record.callback();
      return true;
    },
    activeCount() {
      return active.size;
    },
    records
  };
}

function storedLab2Run(id = "refresh-run") {
  return createRunRecord({
    id,
    context: {
      branch: "lab2-solution",
      commit: "abc1234",
      lab: "lab2",
      variant: "solution"
    },
    events: [
      event("stvec-installed", 0),
      event("trap-enter", 1, { source: "qemu" }),
      event("breakpoint-handled", 2, { source: "qemu" }),
      event("pass", 3, { status: "pass", source: "runner" })
    ],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 2500,
    exitCode: 0
  });
}

test("an empty timeline remains stable and cannot start playback", () => {
  const clock = fakeClock();
  const controller = createTimelineController({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });

  assert.deepEqual(controller.getSnapshot().visibleIndexes, []);
  assert.equal(controller.play(), false);
  assert.equal(controller.next(), false);
  assert.equal(controller.previous(), true);
  assert.equal(controller.getSnapshot().index, -1);
  assert.equal(clock.activeCount(), 0);
  assert.deepEqual(timelineStats({ events: [] }), {
    eventCount: 0,
    durationMs: null,
    result: "unknown",
    interrupted: false
  });
});

test("status, source, lab, step and keyword filters return raw indexes only", () => {
  const events = [
    event("stvec-installed", 0, { detail: "install trap vector" }),
    event("trap-enter", 1, { source: "qemu", detail: "enter from breakpoint" }),
    event("pass", 2, { source: "runner", status: "pass", detail: "LAB2 PASS" }),
    event("frame-allocated", 3, { lab: "lab3", source: "qemu", detail: "allocate page frame" })
  ];

  assert.deepEqual(visibleEventIndexes(events, { status: "pass" }), [2]);
  assert.deepEqual(visibleEventIndexes(events, { source: "qemu" }), [1, 3]);
  assert.deepEqual(visibleEventIndexes(events, { lab: "lab3" }), [3]);
  assert.deepEqual(visibleEventIndexes(events, { step: "trap-enter" }), [1]);
  assert.deepEqual(visibleEventIndexes(events, { keyword: "BREAKPOINT" }), [1]);
  assert.equal(eventMatches(null, {}), false);
});

test("filtering 512 events never mutates the saved event sequence", () => {
  const events = Array.from({ length: 512 }, (_, index) => event(`step-${index}`, index, {
    lab: index % 2 === 0 ? "lab2" : "lab3",
    status: index % 64 === 0 ? "fail" : "running",
    source: index % 3 === 0 ? "qemu" : "bridge"
  }));
  const original = structuredClone(events);
  const controller = createTimelineController();
  controller.setEvents(events);
  controller.setFilters({ status: "fail", source: "qemu" });
  controller.next();
  controller.previous();

  assert.equal(controller.getSnapshot().eventCount, 512);
  assert.deepEqual(controller.getSnapshot().visibleIndexes, [0, 192, 384]);
  assert.deepEqual(events, original);
  assert.equal(events.every((item) => item.protocol === "os-demo.event/v1"), true);
});

test("rapid controls and canceled callbacks cannot move outside the raw sequence", () => {
  const clock = fakeClock();
  const visited = [];
  const controller = createTimelineController({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onIndex(index) {
      visited.push(index);
    }
  });
  controller.setEvents(Array.from({ length: 24 }, (_, index) => event(`step-${index}`, index, {
    status: index % 5 === 0 ? "fail" : "running"
  })));
  assert.equal(controller.play(), true);
  const staleCallbacks = [];

  for (let index = 0; index < 80; index += 1) {
    staleCallbacks.push(clock.records.at(-1).callback);
    controller.setSpeed(SPEEDS[index % SPEEDS.length]);
    controller.setFilters(index % 2 === 0 ? { status: "fail" } : {});
    if (index % 3 === 0) controller.next();
    if (index % 4 === 0) controller.previous();
  }

  const beforeStaleCallbacks = controller.getSnapshot().index;
  staleCallbacks.forEach((callback) => callback());
  assert.equal(controller.getSnapshot().index, beforeStaleCallbacks);
  while (clock.fireNext()) {
    if (visited.length > 100) assert.fail("playback did not terminate");
  }
  controller.pause();
  assert.ok(visited.every((index) => index >= -1 && index < 24));
  assert.equal(clock.activeCount(), 0);
});

test("changing filters during playback cancels stale work and keeps raw indexes", () => {
  const clock = fakeClock();
  const visited = [];
  const controller = createTimelineController({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onIndex(index) {
      visited.push(index);
    }
  });
  controller.setEvents([
    event("stvec-installed", 0),
    event("trap-enter", 1),
    event("panic", 2, { status: "fail" }),
    event("pass", 3, { status: "pass" })
  ]);

  controller.play();
  assert.equal(clock.fireNext(), true);
  assert.equal(controller.getSnapshot().index, 0);
  const canceledCallback = clock.records.at(-1).callback;
  controller.setFilters({ status: "fail" });
  canceledCallback();
  assert.equal(controller.getSnapshot().index, 0);
  assert.equal(clock.fireNext(), true);
  assert.equal(controller.getSnapshot().index, 2);
  assert.deepEqual(visited, [0, 2]);
});

test("filtered playback state is rebuilt from the complete raw event prefix", () => {
  const events = storedLab2Run().events;
  const controller = createTimelineController();
  controller.setEvents(events);
  controller.setFilters({ status: "pass" });
  assert.deepEqual(controller.getSnapshot().visibleIndexes, [3]);
  controller.next();

  const rawIndex = controller.getSnapshot().index;
  const completePrefixState = computeState(events.slice(0, rawIndex + 1), {
    lab: "lab2",
    variant: "solution"
  });
  const visibleOnlyState = computeState(
    controller.getSnapshot().visibleIndexes.map((index) => events[index]),
    { lab: "lab2", variant: "solution" }
  );

  assert.equal(rawIndex, 3);
  assert.equal(completePrefixState.completed, true);
  assert.equal(completePrefixState.fields.trapPhase.status, "known");
  assert.equal(visibleOnlyState.completed, null);
});

test("playback speed schedules 0.5x, 1x, 2x and 4x delays", () => {
  const expectedDelays = new Map([
    [0.5, 2000],
    [1, 1000],
    [2, 500],
    [4, 250]
  ]);

  for (const speed of SPEEDS) {
    const clock = fakeClock();
    const controller = createTimelineController({
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      intervalMs: 1000
    });
    controller.setEvents([event("stvec-installed")]);
    assert.equal(controller.setSpeed(speed), true);
    assert.equal(controller.play(), true);
    assert.equal(clock.records.at(-1).delay, expectedDelays.get(speed));
    controller.destroy();
  }

  const restartClock = fakeClock();
  const restartController = createTimelineController({
    setTimeout: restartClock.setTimeout,
    clearTimeout: restartClock.clearTimeout
  });
  restartController.setEvents([event("only-event")]);
  restartController.play();
  restartClock.fireNext();
  assert.equal(restartController.getSnapshot().index, 0);
  assert.equal(restartController.getSnapshot().playing, false);
  restartController.play();
  assert.equal(restartController.getSnapshot().index, -1);
  assert.equal(restartController.getSnapshot().playing, true);
  restartController.destroy();
});

test("adjacent duration and interrupted run statistics use raw evidence", () => {
  const events = [
    event("start", 0, { timestamp: 0 }),
    event("middle", 1, { timestamp: 250 }),
    event("late", 2, { timestamp: 200 }),
    event("unknown-time", 3, { timestamp: -1 })
  ];

  assert.equal(eventDurationMs(events, 0), null);
  assert.equal(eventDurationMs(events, 1), 250);
  assert.equal(eventDurationMs(events, 2), null);
  assert.equal(eventDurationMs(events, 3), null);
  assert.equal(eventDurationMs([{ timestamp: null }, { timestamp: null }], 1), null);
  assert.equal(timelineStats({ events: [{ timestamp: null }, { timestamp: null }] }).durationMs, null);

  const clock = fakeClock();
  const controller = createTimelineController({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });
  controller.setEvents(events.slice(0, 2));
  controller.play();
  clock.fireNext();
  const interruptedCallback = clock.records.at(-1).callback;
  controller.pause();
  interruptedCallback();
  assert.equal(controller.getSnapshot().index, 0);
  assert.equal(controller.getSnapshot().playing, false);
  assert.equal(clock.activeCount(), 0);

  assert.deepEqual(timelineStats({
    events: events.slice(0, 2),
    startedAt: 0,
    endedAt: 250,
    stopped: true,
    result: "stopped"
  }), {
    eventCount: 2,
    durationMs: 250,
    result: "stopped",
    interrupted: true
  });
  assert.equal(timelineStats({ events: events.slice(0, 2) }).durationMs, 250);
});

test("first failure and first role-specific difference use original raw indexes", () => {
  const failures = [
    event("start", 0),
    event("panic", 1, { status: "fail" }),
    event("fail", 2, { status: "fail" })
  ];
  assert.equal(firstFailureIndex(failures), 1);
  assert.equal(firstFailureIndex([event("start")]), -1);

  const starter = createRunRecord({
    id: "starter-diff",
    context: { branch: "lab2-starter", lab: "lab2", variant: "starter" },
    events: [
      event("boot", 0, { lab: "p0" }),
      event("stvec-missing", 1, { status: "todo" })
    ],
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  const solution = createRunRecord({
    id: "solution-diff",
    context: { branch: "lab2-solution", lab: "lab2", variant: "solution" },
    events: [
      event("boot", 0, { lab: "p0" }),
      event("stvec-installed", 1)
    ],
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  const comparison = compareRuns(starter, solution);
  assert.equal(firstRunDifference(comparison, "starter").starterIndex, 1);
  assert.equal(firstRunDifference(comparison, "solution").solutionIndex, 1);

  const deliberatelyOutOfOrderRows = {
    rows: [
      { scope: "shared", starterIndex: 0, solutionIndex: 9, starter: event("a"), solution: event("b") },
      { scope: "solution-only", starterIndex: null, solutionIndex: 1, starter: null, solution: event("c") },
      { scope: "shared", starterIndex: 2, solutionIndex: 3, starter: event("d"), solution: event("e") }
    ]
  };
  assert.equal(firstRunDifference(deliberatelyOutOfOrderRows).rowIndex, 0);
  assert.equal(firstRunDifference(deliberatelyOutOfOrderRows, "solution").solutionIndex, 1);
});

test("pure starter and solution event reordering is a role-specific difference", () => {
  const sharedA = event("stvec-installed", 1, { timestamp: 1100 });
  const sharedB = event("trap-enter", 2, { timestamp: 1200 });
  const starter = createRunRecord({
    id: "starter-reordered",
    context: { branch: "lab2-starter", lab: "lab2", variant: "starter" },
    events: [
      event("boot", 0, { lab: "p0", timestamp: 1000 }),
      sharedA,
      sharedB
    ],
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  const solution = createRunRecord({
    id: "solution-reordered",
    context: { branch: "lab2-solution", lab: "lab2", variant: "solution" },
    events: [
      event("boot", 0, { lab: "p0", timestamp: 1000 }),
      { ...sharedB, sequence: 2, timestamp: 1100 },
      { ...sharedA, sequence: 3, timestamp: 1200 }
    ],
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  const comparison = compareRuns(starter, solution);

  assert.equal(comparison.starterOnly, 0);
  assert.equal(comparison.solutionOnly, 0);
  assert.equal(firstRunDifference(comparison).starter.step, "stvec-installed");
  assert.equal(firstRunDifference(comparison, "starter").starterIndex, 1);
  assert.equal(firstRunDifference(comparison, "starter").starter.step, "stvec-installed");
  assert.equal(firstRunDifference(comparison, "solution").solutionIndex, 1);
  assert.equal(firstRunDifference(comparison, "solution").solution.step, "trap-enter");
});

test("a saved run can be loaded after a browser refresh and replayed identically", () => {
  const local = memoryStorage();
  const original = storedLab2Run("browser-refresh");
  saveRun(local, original);

  const beforeRefresh = createTimelineController();
  beforeRefresh.setEvents(original.events);
  beforeRefresh.jump(2);
  const beforeState = computeState(original.events.slice(0, beforeRefresh.getSnapshot().index + 1), {
    lab: "lab2",
    variant: "solution"
  });

  const [loaded] = loadRuns(local);
  const afterRefresh = createTimelineController();
  afterRefresh.setEvents(loaded.events);
  afterRefresh.jump(2);
  const afterState = computeState(loaded.events.slice(0, afterRefresh.getSnapshot().index + 1), {
    lab: "lab2",
    variant: "solution"
  });

  assert.deepEqual(loaded.events, original.events);
  assert.deepEqual(afterRefresh.getSnapshot().visibleIndexes, beforeRefresh.getSnapshot().visibleIndexes);
  assert.deepEqual(afterState, beforeState);
});
