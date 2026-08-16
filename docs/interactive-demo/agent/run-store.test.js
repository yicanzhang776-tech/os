"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createGetQemuEventsTool,
  createGetRunResultTool
} = require("./tools");
const {
  RunLifecycleManager,
  RunStore,
  SharedTaskLock,
  resolveLegacyPanicEvent,
  terminateChildProcess
} = require("./run-store");

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.timers = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { callback, at: this.now + delay });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  advance(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      const [id, timer] = due;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = target;
  }

  pendingCount() {
    return this.timers.size;
  }
}

function deferredOperation() {
  let resolve;
  let reject;
  const terminations = [];
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    operation: {
      promise,
      terminate(reason) {
        terminations.push(reason);
      }
    },
    resolve,
    reject,
    terminations
  };
}

function resolvedOperation(exitCode) {
  return { promise: Promise.resolve(exitCode), terminate() {} };
}

function runInput(runId = "run-1", overrides = {}) {
  return {
    runId,
    taskKind: "interactive-run",
    branch: "lab4-starter",
    commit: "abc1234",
    lab: "lab4",
    variant: "starter",
    target: "riscv64gc-unknown-none-elf",
    context: { branch: "lab4-starter", lab: "lab4", variant: "starter" },
    ...overrides
  };
}

function lifecycleFixture(options = {}) {
  const clock = new FakeClock();
  const store = new RunStore({ now: () => clock.now });
  const taskLock = new SharedTaskLock({ now: () => clock.now });
  const completed = [];
  const updates = [];
  const manager = new RunLifecycleManager({
    store,
    taskLock,
    timeouts: {
      buildTimeoutMs: 10,
      qemuTimeoutMs: 20,
      totalTimeoutMs: 100,
      ...options.timeouts
    },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    onRunUpdated(run, transition) {
      updates.push({ run, transition });
    },
    onRunCompleted(run) {
      completed.push(run);
    }
  });
  return { clock, completed, manager, store, taskLock, updates };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const PANIC_EVENT = Object.freeze({
  protocol: "os-demo.event/v1",
  lab: "lab2",
  step: "panic",
  status: "fail",
  detail: "kernel panic",
  source: "console"
});

test("RunStore starts with no active or completed run", () => {
  const store = new RunStore();
  assert.equal(store.getActiveRun(), null);
  assert.equal(store.getLastCompletedRun(), null);
});

test("RunStore creates a complete activeRun foundation", () => {
  const store = new RunStore({ now: () => 100 });
  const active = store.startRun(runInput());
  assert.equal(active.runId, "run-1");
  assert.equal(active.branch, "lab4-starter");
  assert.equal(active.commit, "abc1234");
  assert.equal(active.lab, "lab4");
  assert.equal(active.variant, "starter");
  assert.equal(active.startedAt, 100);
  assert.deepEqual(active.build, { status: "not-started", exitCode: null });
  assert.deepEqual(active.qemu, { status: "not-started", exitCode: null });
});

test("a normal lifecycle run completes with successful build and QEMU", async () => {
  const fixture = lifecycleFixture();
  const outcome = fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(0)
  });
  const completed = await outcome.promise;
  assert.equal(completed.finalResult, "finished");
  assert.deepEqual(completed.build, { status: "success", exitCode: 0 });
  assert.deepEqual(completed.qemu, { status: "finished", exitCode: 0 });
  assert.equal(completed.timedOut, false);
  assert.equal(completed.manuallyStopped, false);
  assert.equal(fixture.taskLock.getActiveTask(), null);
});

test("lastCompletedRun is generated as a stable snapshot", async () => {
  const fixture = lifecycleFixture();
  const outcome = fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(0)
  });
  await outcome.promise;
  const completed = fixture.store.getLastCompletedRun();
  assert.equal(fixture.store.getActiveRun(), null);
  assert.equal(completed.runId, "run-1");
  completed.branch = "mutated";
  assert.equal(fixture.store.getLastCompletedRun().branch, "lab4-starter");
});

test("starting a new run does not mutate the previous completed run", async () => {
  const fixture = lifecycleFixture();
  await fixture.manager.start(runInput("run-1"), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(0)
  }).promise;
  fixture.manager.start(runInput("run-2", { branch: "lab5-starter", lab: "lab5" }), {
    build: () => deferredOperation().operation,
    qemu: () => resolvedOperation(0)
  });
  assert.equal(fixture.store.getActiveRun().runId, "run-2");
  assert.equal(fixture.store.getLastCompletedRun().runId, "run-1");
  fixture.manager.stop();
});

test("RunStore completes the same run only once", () => {
  const store = new RunStore({ now: () => 50 });
  store.startRun(runInput());
  const first = store.completeRun("run-1", { finalResult: "finished" });
  const second = store.completeRun("run-1", { finalResult: "error" });
  assert.equal(first.finalResult, "finished");
  assert.equal(second, null);
  assert.equal(store.getLastCompletedRun().finalResult, "finished");
});

test("build timeout terminates the build and records timeout", async () => {
  const fixture = lifecycleFixture();
  const build = deferredOperation();
  const outcome = fixture.manager.start(runInput(), {
    build: () => build.operation,
    qemu: () => resolvedOperation(0)
  });
  fixture.clock.advance(10);
  const completed = await outcome.promise;
  assert.deepEqual(build.terminations, ["timeout"]);
  assert.equal(completed.build.status, "timeout");
  assert.equal(completed.qemu.status, "not-started");
  assert.equal(completed.finalResult, "timeout");
  assert.equal(completed.error.code, "build_timeout");
  assert.equal(fixture.clock.pendingCount(), 0);
});

test("QEMU timeout terminates QEMU and records timeout", async () => {
  const fixture = lifecycleFixture();
  const qemu = deferredOperation();
  const outcome = fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => qemu.operation
  });
  await flushMicrotasks();
  fixture.clock.advance(20);
  const completed = await outcome.promise;
  assert.deepEqual(qemu.terminations, ["timeout"]);
  assert.equal(completed.build.status, "success");
  assert.equal(completed.qemu.status, "timeout");
  assert.equal(completed.error.code, "qemu_timeout");
});

test("an agent QEMU timeout preserves events and permits result queries and a second run", async () => {
  const fixture = lifecycleFixture();
  const qemu = deferredOperation();
  const first = fixture.manager.start(runInput("agent-timeout", {
    taskKind: "agent-test"
  }), {
    build: () => resolvedOperation(0),
    qemu: () => qemu.operation
  });
  await flushMicrotasks();
  fixture.store.recordEvent("agent-timeout", {
    protocol: "os-demo.event/v1",
    lab: "lab4",
    sequence: 1,
    step: "qemu-started",
    status: "running",
    detail: "fake QEMU event",
    source: "console"
  });
  fixture.clock.advance(20);
  await first.promise;

  const readContext = () => ({ branch: "lab4-starter", commit: "abc1234" });
  const getRunResult = createGetRunResultTool({
    runStore: fixture.store,
    readWorkspaceContext: readContext
  });
  const getQemuEvents = createGetQemuEventsTool({
    runStore: fixture.store,
    readWorkspaceContext: readContext
  });
  const result = getRunResult({ includeDiagnostics: false });
  const events = getQemuEvents({});

  assert.equal(result.ok, true);
  assert.equal(result.data.runId, "agent-timeout");
  assert.equal(result.data.qemu.status, "timeout");
  assert.equal(events.ok, true);
  assert.equal(events.data.runId, "agent-timeout");
  assert.deepEqual(events.data.events.map((event) => event.sequence), [1]);

  const second = fixture.manager.start(runInput("agent-second", {
    taskKind: "agent-test"
  }), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(0)
  });
  assert.equal(second.started, true);
  assert.equal((await second.promise).runId, "agent-second");
});

test("overall timeout is an independent final safety net", async () => {
  const fixture = lifecycleFixture({
    timeouts: { buildTimeoutMs: 100, qemuTimeoutMs: 100, totalTimeoutMs: 15 }
  });
  const build = deferredOperation();
  const outcome = fixture.manager.start(runInput(), {
    build: () => build.operation,
    qemu: () => resolvedOperation(0)
  });
  fixture.clock.advance(15);
  const completed = await outcome.promise;
  assert.equal(completed.finalResult, "timeout");
  assert.equal(completed.error.code, "total_timeout");
  assert.equal(completed.error.stage, "build");
  assert.deepEqual(build.terminations, ["timeout"]);
});

test("timeout is never recorded as a manual stop", async () => {
  const fixture = lifecycleFixture();
  const outcome = fixture.manager.start(runInput(), {
    build: () => deferredOperation().operation,
    qemu: () => resolvedOperation(0)
  });
  fixture.clock.advance(10);
  const completed = await outcome.promise;
  assert.equal(completed.timedOut, true);
  assert.equal(completed.manuallyStopped, false);
});

test("manual stop records stopped without timeout", async () => {
  const fixture = lifecycleFixture();
  const build = deferredOperation();
  const outcome = fixture.manager.start(runInput(), {
    build: () => build.operation,
    qemu: () => resolvedOperation(0)
  });
  assert.equal(fixture.manager.stop(), true);
  const completed = await outcome.promise;
  assert.deepEqual(build.terminations, ["stopped"]);
  assert.equal(completed.build.status, "stopped");
  assert.equal(completed.finalResult, "stopped");
  assert.equal(completed.timedOut, false);
  assert.equal(completed.manuallyStopped, true);
});

test("manual stop during QEMU preserves successful build state", async () => {
  const fixture = lifecycleFixture();
  const qemu = deferredOperation();
  const outcome = fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => qemu.operation
  });
  await flushMicrotasks();
  assert.equal(fixture.manager.stop(), true);
  const completed = await outcome.promise;
  assert.deepEqual(qemu.terminations, ["stopped"]);
  assert.equal(completed.build.status, "success");
  assert.equal(completed.qemu.status, "stopped");
  assert.equal(completed.finalResult, "stopped");
});

test("non-zero build exit becomes build-failure", async () => {
  const fixture = lifecycleFixture();
  const completed = await fixture.manager.start(runInput(), {
    build: () => resolvedOperation(101),
    qemu: () => resolvedOperation(0)
  }).promise;
  assert.equal(completed.finalResult, "build-failure");
  assert.deepEqual(completed.build, { status: "failure", exitCode: 101 });
  assert.equal(completed.qemu.status, "not-started");
});

test("QEMU process start failure has a distinct final result", async () => {
  const fixture = lifecycleFixture();
  const failure = new Error("QEMU executable was not found");
  failure.code = "process_start_failed";
  const completed = await fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => ({ promise: Promise.reject(failure), terminate() {} })
  }).promise;
  assert.equal(completed.finalResult, "qemu-start-failure");
  assert.equal(completed.qemu.status, "failure");
  assert.equal(completed.error.code, "qemu_start_failure");
});

test("non-zero QEMU exit becomes qemu-failure", async () => {
  const fixture = lifecycleFixture();
  const completed = await fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(2)
  }).promise;
  assert.equal(completed.finalResult, "qemu-failure");
  assert.deepEqual(completed.qemu, { status: "failure", exitCode: 2 });
});

test("all stage and total timers are cleared on completion", async () => {
  const fixture = lifecycleFixture();
  await fixture.manager.start(runInput(), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(0)
  }).promise;
  assert.equal(fixture.clock.pendingCount(), 0);
});

test("the task lock is released after timeout", async () => {
  const fixture = lifecycleFixture();
  const outcome = fixture.manager.start(runInput(), {
    build: () => deferredOperation().operation,
    qemu: () => resolvedOperation(0)
  });
  fixture.clock.advance(10);
  await outcome.promise;
  assert.equal(fixture.taskLock.getActiveTask(), null);
});

test("a simultaneous second task is rejected by the shared lock", async () => {
  const fixture = lifecycleFixture();
  const build = deferredOperation();
  const first = fixture.manager.start(runInput("interactive"), {
    build: () => build.operation,
    qemu: () => resolvedOperation(0)
  });
  const second = fixture.manager.start(runInput("agent-test", { taskKind: "agent-test" }), {
    build: () => resolvedOperation(0),
    qemu: () => resolvedOperation(0)
  });
  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(second.activeTask.kind, "interactive-run");
  fixture.manager.stop();
  await first.promise;
});

test("Lab4 legacy panic is attributed to the observed Lab4", () => {
  const resolved = resolveLegacyPanicEvent(PANIC_EVENT, "[Lab2] kernel panic", {
    lab: "lab4",
    activeObservedLab: "lab4"
  });
  assert.equal(resolved.lab, "lab4");
});

test("Lab5 legacy panic is attributed to the observed Lab5", () => {
  const resolved = resolveLegacyPanicEvent(PANIC_EVENT, "[Lab2] kernel panic", {
    lab: "lab5",
    activeObservedLab: "lab5"
  });
  assert.equal(resolved.lab, "lab5");
});

test("Lab6 legacy panic is attributed to the observed Lab6", () => {
  const resolved = resolveLegacyPanicEvent(PANIC_EVENT, "[Lab2] kernel panic", {
    lab: "lab6",
    activeObservedLab: "lab6"
  });
  assert.equal(resolved.lab, "lab6");
});

test("real Lab2 events and a true Lab2 panic remain Lab2", () => {
  const normal = resolveLegacyPanicEvent(
    { ...PANIC_EVENT, step: "breakpoint-handled", status: "running" },
    "[Lab2] breakpoint handled",
    { lab: "lab6", activeObservedLab: "lab6" }
  );
  const panic = resolveLegacyPanicEvent(PANIC_EVENT, "[Lab2] kernel panic", {
    lab: "lab2",
    activeObservedLab: null
  });
  assert.equal(normal.lab, "lab2");
  assert.equal(panic.lab, "lab2");
});

test("legacy panic falls back to the target Lab before any observed event", () => {
  const resolved = resolveLegacyPanicEvent(PANIC_EVENT, "[Lab2] kernel panic", {
    lab: "lab5",
    activeObservedLab: null
  });
  assert.equal(resolved.lab, "lab5");
});

test("legacy panic without an observed or target Lab is not guessed", () => {
  assert.equal(resolveLegacyPanicEvent(PANIC_EVENT, "[Lab2] kernel panic", {
    lab: null,
    activeObservedLab: null
  }), null);
});

test("events are bound to the active runId and update event counters", () => {
  const store = new RunStore();
  store.startRun(runInput("real-run"));
  store.recordEvent("real-run", {
    runId: "untrusted-run",
    lab: "lab4",
    sequence: 7,
    step: "paging-active"
  });
  const active = store.getActiveRun();
  assert.equal(active.events[0].runId, "real-run");
  assert.equal(active.eventCount, 1);
  assert.equal(active.lastEventSequence, 7);
  assert.equal(active.activeObservedLab, "lab4");
});

test("RunStore event accessors return independent read-only snapshots", () => {
  const store = new RunStore();
  store.startRun(runInput("snapshot-run"));
  store.recordEvent("snapshot-run", {
    protocol: "os-demo.event/v1",
    lab: "lab4",
    step: "paging-active",
    status: "running",
    detail: "paging is active",
    source: "console",
    sequence: 9
  });
  const first = store.getActiveRun();
  first.events[0].detail = "caller mutation";
  first.events.push({ sequence: 10 });
  const second = store.getActiveRun();
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].detail, "paging is active");
  assert.equal(second.events[0].sequence, 9);
});

test("RunStore keeps completed and active event snapshots separate", () => {
  const store = new RunStore({ now: () => 100 });
  store.startRun(runInput("completed-run"));
  store.recordEvent("completed-run", {
    protocol: "os-demo.event/v1",
    lab: "lab4",
    step: "completed-evidence",
    status: "pass",
    source: "lifecycle",
    sequence: 3
  });
  store.completeRun("completed-run", { finalResult: "finished", endedAt: 110 });
  store.startRun(runInput("active-run"));
  store.recordEvent("active-run", {
    protocol: "os-demo.event/v1",
    lab: "lab4",
    step: "active-evidence",
    status: "running",
    source: "lifecycle",
    sequence: 4
  });
  assert.deepEqual(store.getLastCompletedRun().events.map((event) => event.sequence), [3]);
  assert.deepEqual(store.getActiveRun().events.map((event) => event.sequence), [4]);
});

test("timeout followed by a late child completion emits one completion only", async () => {
  const fixture = lifecycleFixture();
  const build = deferredOperation();
  const outcome = fixture.manager.start(runInput(), {
    build: () => build.operation,
    qemu: () => resolvedOperation(0)
  });
  fixture.clock.advance(10);
  await outcome.promise;
  build.resolve(0);
  await flushMicrotasks();
  assert.equal(fixture.completed.length, 1);
  assert.equal(fixture.completed[0].finalResult, "timeout");
});

test("RunStore bounds event history and stable output", () => {
  const store = new RunStore({ maxEvents: 2, maxStableOutput: 2 });
  store.startRun(runInput());
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    store.recordEvent("run-1", { lab: "lab4", sequence });
    store.recordOutput("run-1", `line ${sequence}`);
  }
  const active = store.getActiveRun();
  assert.deepEqual(active.events.map((event) => event.sequence), [2, 3]);
  assert.deepEqual(active.stableOutput, ["line 2", "line 3"]);
  assert.equal(active.eventCount, 3);
});

test("POSIX termination targets the detached child process group", () => {
  const calls = [];
  const child = { pid: 321, killed: false, kill() { calls.push("direct"); } };
  terminateChildProcess(child, {
    platform: "linux",
    killProcess(pid, signal) {
      calls.push([pid, signal]);
    }
  });
  assert.deepEqual(calls, [[-321, "SIGKILL"]]);
});

test("direct-child termination never signals the surrounding process group", () => {
  const calls = [];
  const child = {
    pid: 321,
    killed: false,
    kill(signal) {
      calls.push(["direct", signal]);
    }
  };
  terminateChildProcess(child, {
    platform: "linux",
    killProcessGroup: false,
    killProcess(pid, signal) {
      calls.push([pid, signal]);
    }
  });
  assert.deepEqual(calls, [["direct", "SIGKILL"]]);
});

test("Windows termination uses taskkill for the complete process tree", () => {
  const calls = [];
  const child = { pid: 654, killed: false, kill() { calls.push("direct"); } };
  terminateChildProcess(child, {
    platform: "win32",
    spawnSync(command, args) {
      calls.push([command, args]);
      return { status: 0 };
    }
  });
  assert.deepEqual(calls, [["taskkill", ["/pid", "654", "/T", "/F"]]]);
});
