(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentPetMotion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const POSITION_KEY = "os-demo.kernel-buddy-position.v1";
  const POSITION_VERSION = 1;
  const DRAG_THRESHOLD = 6;
  const MOTION_MIN_DELAY_MS = 60_000;
  const MOTION_MAX_DELAY_MS = 120_000;
  const SLEEP_IDLE_MS = 8 * 60_000;
  const IDLE_ACTIONS = Object.freeze(["blink", "wave", "think", "type"]);
  const ACTION_DURATIONS = Object.freeze({ blink: 900, wave: 2800, think: 3600, type: 4200, sleep: 5000 });

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(finite(value, minimum), minimum), Math.max(minimum, maximum));
  }

  function normalizeGeometry(viewport = {}, size = {}, margin = 12) {
    const width = Math.max(1, finite(viewport.width, 1));
    const height = Math.max(1, finite(viewport.height, 1));
    const petWidth = clamp(finite(size.width, 104), 1, width);
    const petHeight = clamp(finite(size.height, 104), 1, height);
    const safeMargin = clamp(finite(margin, 12), 0, Math.min(width, height) / 2);
    return { width, height, petWidth, petHeight, margin: safeMargin };
  }

  function clampPetPosition(position = {}, viewport = {}, size = {}, margin = 12) {
    const geometry = normalizeGeometry(viewport, size, margin);
    const minX = geometry.margin;
    const minY = geometry.margin;
    const maxX = Math.max(minX, geometry.width - geometry.petWidth - geometry.margin);
    const maxY = Math.max(minY, geometry.height - geometry.petHeight - geometry.margin);
    return Object.freeze({
      x: clamp(position.x, minX, maxX),
      y: clamp(position.y, minY, maxY)
    });
  }

  function preferenceFromPosition(position = {}, viewport = {}, size = {}, margin = 12) {
    const geometry = normalizeGeometry(viewport, size, margin);
    const bounded = clampPetPosition(position, viewport, size, margin);
    const side = bounded.x + geometry.petWidth / 2 <= geometry.width / 2 ? "left" : "right";
    const minY = geometry.margin;
    const maxY = Math.max(minY, geometry.height - geometry.petHeight - geometry.margin);
    const yRatio = maxY === minY ? 0 : (bounded.y - minY) / (maxY - minY);
    return Object.freeze({ version: POSITION_VERSION, side, yRatio: clamp(yRatio, 0, 1) });
  }

  function positionFromPreference(preference, viewport = {}, size = {}, margin = 12) {
    const geometry = normalizeGeometry(viewport, size, margin);
    const side = preference?.version === POSITION_VERSION && ["left", "right"].includes(preference.side)
      ? preference.side
      : "right";
    const yRatio = preference?.version === POSITION_VERSION && Number.isFinite(preference.yRatio)
      ? clamp(preference.yRatio, 0, 1)
      : 1;
    const minY = geometry.margin;
    const maxY = Math.max(minY, geometry.height - geometry.petHeight - geometry.margin);
    const x = side === "left"
      ? geometry.margin
      : Math.max(geometry.margin, geometry.width - geometry.petWidth - geometry.margin);
    return Object.freeze({ x, y: minY + (maxY - minY) * yRatio, side });
  }

  function snapPetPosition(position = {}, viewport = {}, size = {}, margin = 12) {
    const preference = preferenceFromPosition(position, viewport, size, margin);
    const snapped = positionFromPreference(preference, viewport, size, margin);
    return Object.freeze({ ...snapped, preference });
  }

  function readPosition(storage) {
    try {
      const parsed = JSON.parse(storage?.getItem(POSITION_KEY));
      if (parsed?.version !== POSITION_VERSION || !["left", "right"].includes(parsed.side)
        || !Number.isFinite(parsed.yRatio) || parsed.yRatio < 0 || parsed.yRatio > 1) return null;
      return Object.freeze({ version: POSITION_VERSION, side: parsed.side, yRatio: parsed.yRatio });
    } catch (_) {
      return null;
    }
  }

  function writePosition(storage, preference) {
    try {
      if (!storage || typeof storage.setItem !== "function") return false;
      if ((preference?.version !== undefined && preference.version !== POSITION_VERSION)
        || !["left", "right"].includes(preference?.side)
        || !Number.isFinite(preference.yRatio)) return false;
      storage.setItem(POSITION_KEY, JSON.stringify({
        version: POSITION_VERSION,
        side: preference.side,
        yRatio: clamp(preference.yRatio, 0, 1)
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearPosition(storage) {
    try { storage?.removeItem?.(POSITION_KEY); return true; } catch (_) { return false; }
  }

  function dragDistance(start = {}, current = {}) {
    return Math.hypot(finite(current.x) - finite(start.x), finite(current.y) - finite(start.y));
  }

  function motionDelay(random = Math.random) {
    const unit = clamp(Number(random()), 0, 0.999999999);
    return MOTION_MIN_DELAY_MS + Math.floor(unit * (MOTION_MAX_DELAY_MS - MOTION_MIN_DELAY_MS + 1));
  }

  function chooseAction(lastAction, options = {}) {
    const random = options.random || Math.random;
    const actions = [...IDLE_ACTIONS];
    if (finite(options.idleMs) >= SLEEP_IDLE_MS) actions.push("sleep");
    const candidates = actions.filter((action) => action !== lastAction);
    const unit = clamp(Number(random()), 0, 0.999999999);
    return candidates[Math.floor(unit * candidates.length)] || "blink";
  }

  function createMotionDirector(options = {}) {
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    const random = options.random || Math.random;
    const onPose = options.onPose;
    const getIdleMs = options.getIdleMs || (() => 0);
    if (typeof setTimer !== "function" || typeof clearTimer !== "function" || typeof onPose !== "function") {
      throw new TypeError("Motion director dependencies are required.");
    }
    let nextTimer = null;
    let resetTimer = null;
    let stopped = true;
    let paused = false;
    let runtimeState = "idle";
    let lastAction = null;

    function clearTimers() {
      if (nextTimer !== null) clearTimer(nextTimer);
      if (resetTimer !== null) clearTimer(resetTimer);
      nextTimer = null;
      resetTimer = null;
    }

    function runtimePose() {
      if (runtimeState === "running") return "type";
      if (runtimeState === "error") return "alert";
      return "idle";
    }

    function schedule() {
      if (stopped || paused || runtimeState !== "idle") return;
      nextTimer = setTimer(() => {
        nextTimer = null;
        if (stopped || paused || runtimeState !== "idle") return;
        const action = chooseAction(lastAction, { random, idleMs: getIdleMs() });
        lastAction = action;
        onPose(action);
        resetTimer = setTimer(() => {
          resetTimer = null;
          if (!stopped && !paused && runtimeState === "idle") onPose("idle");
          schedule();
        }, ACTION_DURATIONS[action]);
      }, motionDelay(random));
    }

    function setPaused(value) {
      const next = value === true;
      if (paused === next) return;
      paused = next;
      clearTimers();
      onPose(runtimePose());
      if (!paused) schedule();
    }

    function setRuntimeState(value) {
      runtimeState = ["idle", "running", "error"].includes(value) ? value : "idle";
      clearTimers();
      onPose(runtimePose());
      schedule();
    }

    function start() {
      if (!stopped) return;
      stopped = false;
      onPose(runtimePose());
      schedule();
    }

    function stop() {
      stopped = true;
      clearTimers();
      onPose("idle");
    }

    return Object.freeze({ setPaused, setRuntimeState, start, stop });
  }

  return Object.freeze({
    ACTION_DURATIONS,
    DRAG_THRESHOLD,
    IDLE_ACTIONS,
    MOTION_MAX_DELAY_MS,
    MOTION_MIN_DELAY_MS,
    POSITION_KEY,
    POSITION_VERSION,
    SLEEP_IDLE_MS,
    chooseAction,
    clampPetPosition,
    clearPosition,
    createMotionDirector,
    dragDistance,
    motionDelay,
    positionFromPreference,
    preferenceFromPosition,
    readPosition,
    snapPetPosition,
    writePosition
  });
});
