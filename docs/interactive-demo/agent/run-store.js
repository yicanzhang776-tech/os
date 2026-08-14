"use strict";

const { spawnSync } = require("node:child_process");

const MAX_RUN_EVENTS = 512;
const MAX_STABLE_OUTPUT = 60;
const DEFAULT_RUN_TIMEOUTS = Object.freeze({
  buildTimeoutMs: 40_000,
  qemuTimeoutMs: 20_000,
  totalTimeoutMs: 60_000
});
const BUILD_STATUSES = new Set([
  "not-started",
  "running",
  "success",
  "failure",
  "stopped",
  "timeout"
]);
const QEMU_STATUSES = new Set([
  "not-started",
  "running",
  "finished",
  "failure",
  "timeout",
  "stopped"
]);
const LAB_PATTERN = /^lab[1-7]$/;
const LEGACY_LAB2_PANIC_PATTERN = /^\[Lab2\]\s+kernel panic$/i;

function clone(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}

function finiteTimestamp(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeExitCode(value) {
  return Number.isInteger(value) ? value : null;
}

function normalizeError(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return { code: "run_error", message: value.slice(0, 500), stage: null };
  }
  return {
    code: typeof value.code === "string" ? value.code.slice(0, 80) : "run_error",
    message: typeof value.message === "string"
      ? value.message.slice(0, 500)
      : "The run did not complete normally.",
    stage: typeof value.stage === "string" ? value.stage.slice(0, 40) : null
  };
}

function normalizeTimeouts(value = {}) {
  const normalized = {};
  for (const [field, defaultValue] of Object.entries(DEFAULT_RUN_TIMEOUTS)) {
    const candidate = value[field];
    normalized[field] = Number.isInteger(candidate) && candidate > 0
      ? candidate
      : defaultValue;
  }
  return normalized;
}

class RunStore {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.maxEvents = Number.isInteger(options.maxEvents) && options.maxEvents > 0
      ? Math.min(options.maxEvents, MAX_RUN_EVENTS)
      : MAX_RUN_EVENTS;
    this.maxStableOutput = Number.isInteger(options.maxStableOutput)
      && options.maxStableOutput > 0
      ? Math.min(options.maxStableOutput, MAX_STABLE_OUTPUT)
      : MAX_STABLE_OUTPUT;
    this._activeRun = null;
    this._lastCompletedRun = null;
  }

  getActiveRun() {
    return clone(this._activeRun);
  }

  getLastCompletedRun() {
    return clone(this._lastCompletedRun);
  }

  startRun(input = {}) {
    if (this._activeRun) {
      const error = new Error("A run is already active.");
      error.code = "run_already_active";
      throw error;
    }
    if (typeof input.runId !== "string" || !input.runId) {
      throw new TypeError("runId is required.");
    }

    const startedAt = finiteTimestamp(input.startedAt, this.now());
    this._activeRun = {
      runId: input.runId,
      branch: String(input.branch || "unknown").slice(0, 200),
      commit: String(input.commit || "unknown").slice(0, 200),
      lab: LAB_PATTERN.test(String(input.lab || "").toLowerCase())
        ? String(input.lab).toLowerCase()
        : null,
      variant: String(input.variant || "custom").slice(0, 80),
      target: String(input.target || "unknown").slice(0, 200),
      context: input.context && typeof input.context === "object" ? clone(input.context) : null,
      taskKind: String(input.taskKind || "interactive-run").slice(0, 40),
      startedAt,
      endedAt: null,
      durationMs: null,
      build: { status: "not-started", exitCode: null },
      qemu: { status: "not-started", exitCode: null },
      timedOut: false,
      manuallyStopped: false,
      error: null,
      eventCount: 0,
      lastEventSequence: null,
      activeObservedLab: null,
      events: [],
      stableOutput: [],
      finalResult: null
    };
    return this.getActiveRun();
  }

  updateBuild(runId, status, exitCode = null) {
    if (!this._activeRun || this._activeRun.runId !== runId) return false;
    if (!BUILD_STATUSES.has(status)) throw new TypeError("Invalid build status.");
    this._activeRun.build = { status, exitCode: normalizeExitCode(exitCode) };
    return true;
  }

  updateQemu(runId, status, exitCode = null) {
    if (!this._activeRun || this._activeRun.runId !== runId) return false;
    if (!QEMU_STATUSES.has(status)) throw new TypeError("Invalid QEMU status.");
    this._activeRun.qemu = { status, exitCode: normalizeExitCode(exitCode) };
    return true;
  }

  recordEvent(runId, event, options = {}) {
    if (!this._activeRun || this._activeRun.runId !== runId) return false;
    if (!event || typeof event !== "object") return false;

    const boundEvent = { ...clone(event), runId };
    for (const field of ["raw", "detail"]) {
      if (typeof boundEvent[field] === "string") boundEvent[field] = boundEvent[field].slice(0, 500);
    }
    this._activeRun.events.push(boundEvent);
    if (this._activeRun.events.length > this.maxEvents) this._activeRun.events.shift();
    this._activeRun.eventCount += 1;
    if (Number.isInteger(boundEvent.sequence) && boundEvent.sequence >= 0) {
      this._activeRun.lastEventSequence = boundEvent.sequence;
    }
    if (options.observeLab !== false && LAB_PATTERN.test(String(boundEvent.lab || ""))) {
      this._activeRun.activeObservedLab = boundEvent.lab;
    }
    return true;
  }

  recordOutput(runId, line) {
    if (!this._activeRun || this._activeRun.runId !== runId) return false;
    const clean = String(line || "").replace(/\r/g, "").trim().slice(0, 500);
    if (!clean) return false;
    this._activeRun.stableOutput.push(clean);
    if (this._activeRun.stableOutput.length > this.maxStableOutput) {
      this._activeRun.stableOutput.shift();
    }
    return true;
  }

  completeRun(runId, result = {}) {
    if (!this._activeRun || this._activeRun.runId !== runId) return null;
    const endedAt = finiteTimestamp(result.endedAt, this.now());
    const timedOut = Boolean(result.timedOut);
    const completed = {
      ...this._activeRun,
      endedAt,
      durationMs: Math.max(0, endedAt - this._activeRun.startedAt),
      timedOut,
      manuallyStopped: !timedOut && Boolean(result.manuallyStopped),
      error: normalizeError(result.error),
      finalResult: String(result.finalResult || "error").slice(0, 80)
    };
    this._lastCompletedRun = clone(completed);
    this._activeRun = null;
    return clone(completed);
  }
}

class SharedTaskLock {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this._activeTask = null;
  }

  acquire(kind, runId) {
    if (this._activeTask) return false;
    this._activeTask = {
      kind: String(kind || "unknown").slice(0, 40),
      runId: String(runId || "unknown").slice(0, 120),
      startedAt: this.now()
    };
    return true;
  }

  release(runId) {
    if (!this._activeTask || this._activeTask.runId !== runId) return false;
    this._activeTask = null;
    return true;
  }

  getActiveTask() {
    return clone(this._activeTask);
  }
}

class RunAbortError extends Error {
  constructor(reason, scope) {
    super(reason === "timeout" ? `${scope} timeout.` : "The run was manually stopped.");
    this.code = reason === "timeout" ? `${scope}_timeout` : "run_stopped";
    this.reason = reason;
    this.scope = scope;
  }
}

function normalizeOperation(value) {
  if (value && typeof value.then === "function") {
    return { promise: value, terminate() {} };
  }
  if (!value || !value.promise || typeof value.promise.then !== "function") {
    throw new TypeError("A run operation must provide a promise.");
  }
  return {
    promise: value.promise,
    terminate: typeof value.terminate === "function" ? value.terminate : () => {}
  };
}

class RunLifecycleManager {
  constructor(options = {}) {
    if (!(options.store instanceof RunStore)) throw new TypeError("store is required.");
    if (!(options.taskLock instanceof SharedTaskLock)) throw new TypeError("taskLock is required.");
    this.store = options.store;
    this.taskLock = options.taskLock;
    this.timeouts = normalizeTimeouts(options.timeouts);
    this.setTimer = options.setTimeout || setTimeout;
    this.clearTimer = options.clearTimeout || clearTimeout;
    this.callbacks = {
      onRunStarted: options.onRunStarted,
      onRunUpdated: options.onRunUpdated,
      onRunCompleted: options.onRunCompleted
    };
    this._controller = null;
  }

  getActiveTask() {
    return this.taskLock.getActiveTask();
  }

  start(runInput, operations = {}) {
    const taskKind = runInput.taskKind || "interactive-run";
    if (!this.taskLock.acquire(taskKind, runInput.runId)) {
      return { started: false, activeTask: this.taskLock.getActiveTask(), promise: null };
    }

    let run;
    try {
      run = this.store.startRun({ ...runInput, taskKind });
    } catch (error) {
      this.taskLock.release(runInput.runId);
      throw error;
    }

    const controller = {
      runId: run.runId,
      phase: "starting",
      currentOperation: null,
      stageTimer: null,
      totalTimer: null,
      abortReason: null,
      completed: false,
      rejectAbort: null,
      abortPromise: null
    };
    controller.abortPromise = new Promise((resolve, reject) => {
      controller.rejectAbort = reject;
    });
    this._controller = controller;
    this._emit("onRunStarted", run);
    controller.totalTimer = this.setTimer(() => {
      this._abort(controller, "timeout", "total");
    }, this.timeouts.totalTimeoutMs);

    const promise = this._execute(controller, operations)
      .finally(() => {
        this._clearTimers(controller);
        this.taskLock.release(controller.runId);
        if (this._controller === controller) this._controller = null;
      });
    controller.promise = promise;
    return { started: true, activeTask: this.taskLock.getActiveTask(), promise };
  }

  stop() {
    if (!this._controller || this._controller.completed) return false;
    return this._abort(this._controller, "stopped", "manual");
  }

  async _execute(controller, operations) {
    try {
      this.store.updateBuild(controller.runId, "running");
      this._updated("build-running");
      const buildCode = await this._runPhase(controller, "build", operations.build);
      if (buildCode !== 0) {
        this.store.updateBuild(controller.runId, "failure", buildCode);
        this._updated("build-failure");
        return this._complete(controller, {
          finalResult: "build-failure",
          error: {
            code: "build_failure",
            message: `cargo build failed with exit code ${buildCode}.`,
            stage: "build"
          }
        });
      }

      this.store.updateBuild(controller.runId, "success", 0);
      this._updated("build-success");
      this.store.updateQemu(controller.runId, "running");
      this._updated("qemu-running");
      const qemuCode = await this._runPhase(controller, "qemu", operations.qemu);
      if (qemuCode !== 0) {
        this.store.updateQemu(controller.runId, "failure", qemuCode);
        this._updated("qemu-failure");
        return this._complete(controller, {
          finalResult: "qemu-failure",
          error: {
            code: "qemu_failure",
            message: `QEMU exited with code ${qemuCode}.`,
            stage: "qemu"
          }
        });
      }

      this.store.updateQemu(controller.runId, "finished", 0);
      this._updated("qemu-finished");
      return this._complete(controller, { finalResult: "finished" });
    } catch (error) {
      return this._completeError(controller, error);
    }
  }

  async _runPhase(controller, phase, startOperation) {
    controller.phase = phase;
    if (typeof startOperation !== "function") {
      const error = new TypeError(`${phase} operation is required.`);
      error.code = "process_start_failed";
      throw error;
    }

    const operation = normalizeOperation(startOperation());
    controller.currentOperation = operation;
    const timeoutMs = phase === "build"
      ? this.timeouts.buildTimeoutMs
      : this.timeouts.qemuTimeoutMs;
    controller.stageTimer = this.setTimer(() => {
      this._abort(controller, "timeout", phase);
    }, timeoutMs);

    try {
      return await Promise.race([operation.promise, controller.abortPromise]);
    } finally {
      if (controller.stageTimer !== null) {
        this.clearTimer(controller.stageTimer);
        controller.stageTimer = null;
      }
      if (controller.currentOperation === operation) controller.currentOperation = null;
    }
  }

  _abort(controller, reason, scope) {
    if (controller.completed || controller.abortReason) return false;
    controller.abortReason = { reason, scope, phase: controller.phase };
    const error = new RunAbortError(reason, scope);
    controller.rejectAbort(error);
    if (controller.currentOperation) {
      try {
        controller.currentOperation.terminate(reason);
      } catch (_) {
        // Completion is driven by abortPromise even if process termination reports an error.
      }
    }
    return true;
  }

  _completeError(controller, error) {
    const abort = controller.abortReason;
    if (abort?.reason === "timeout") {
      if (abort.phase === "build") this.store.updateBuild(controller.runId, "timeout");
      if (abort.phase === "qemu") this.store.updateQemu(controller.runId, "timeout");
      this._updated("timeout");
      return this._complete(controller, {
        finalResult: "timeout",
        timedOut: true,
        error: {
          code: `${abort.scope}_timeout`,
          message: `${abort.scope} timeout ended the run.`,
          stage: abort.phase
        }
      });
    }
    if (abort?.reason === "stopped") {
      if (abort.phase === "build") this.store.updateBuild(controller.runId, "stopped");
      if (abort.phase === "qemu") this.store.updateQemu(controller.runId, "stopped");
      this._updated("stopped");
      return this._complete(controller, {
        finalResult: "stopped",
        manuallyStopped: true
      });
    }

    const stage = controller.phase === "qemu" ? "qemu" : "build";
    if (stage === "build") this.store.updateBuild(controller.runId, "failure");
    else this.store.updateQemu(controller.runId, "failure");
    this._updated(`${stage}-error`);
    const startFailure = error?.code === "process_start_failed";
    return this._complete(controller, {
      finalResult: stage === "build"
        ? "build-failure"
        : startFailure ? "qemu-start-failure" : "error",
      error: {
        code: startFailure ? `${stage}_start_failure` : "run_error",
        message: error?.message || "The run failed unexpectedly.",
        stage
      }
    });
  }

  _complete(controller, result) {
    if (controller.completed) return null;
    controller.completed = true;
    this._clearTimers(controller);
    const completed = this.store.completeRun(controller.runId, result);
    if (completed) this._emit("onRunCompleted", completed);
    return completed;
  }

  _updated(transition) {
    const run = this.store.getActiveRun();
    if (run) this._emit("onRunUpdated", run, transition);
  }

  _clearTimers(controller) {
    for (const field of ["stageTimer", "totalTimer"]) {
      if (controller[field] === null) continue;
      this.clearTimer(controller[field]);
      controller[field] = null;
    }
  }

  _emit(name, ...args) {
    if (typeof this.callbacks[name] !== "function") return;
    try {
      this.callbacks[name](...args);
    } catch (_) {
      // UI notification failures must not strand a process or task lock.
    }
  }
}

function terminateChildProcess(child, options = {}) {
  if (!child || child.killed) return false;
  const platform = options.platform || process.platform;
  const runSync = options.spawnSync || spawnSync;
  const killProcess = options.killProcess || process.kill;

  if (platform === "win32") {
    let treeStopped = false;
    if (Number.isInteger(child.pid) && child.pid > 0) {
      const result = runSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5_000
      });
      treeStopped = !result.error && result.status === 0;
    }
    if (!treeStopped && typeof child.kill === "function") child.kill();
    return true;
  }

  if (Number.isInteger(child.pid) && child.pid > 0) {
    try {
      killProcess(-child.pid, "SIGKILL");
      return true;
    } catch (_) {
      // Fall back to the direct child when no detached process group exists.
    }
  }
  if (typeof child.kill === "function") child.kill("SIGKILL");
  return true;
}

function isLegacyLab2Panic(line) {
  return LEGACY_LAB2_PANIC_PATTERN.test(String(line || "").trim());
}

function resolveLegacyPanicEvent(parsed, rawLine, runContext) {
  if (!parsed || !isLegacyLab2Panic(rawLine)) return parsed;
  const observedLab = String(runContext?.activeObservedLab || "").toLowerCase();
  const targetLab = String(runContext?.lab || "").toLowerCase();
  const resolvedLab = LAB_PATTERN.test(observedLab)
    ? observedLab
    : LAB_PATTERN.test(targetLab) ? targetLab : null;
  return resolvedLab ? { ...parsed, lab: resolvedLab } : null;
}

module.exports = {
  DEFAULT_RUN_TIMEOUTS,
  MAX_RUN_EVENTS,
  MAX_STABLE_OUTPUT,
  RunLifecycleManager,
  RunStore,
  SharedTaskLock,
  isLegacyLab2Panic,
  normalizeTimeouts,
  resolveLegacyPanicEvent,
  terminateChildProcess
};
