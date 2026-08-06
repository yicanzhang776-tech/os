(() => {
  "use strict";

  const TIMELINE_VERSION = 1;
  const SPEEDS = Object.freeze([0.5, 1, 2, 4]);
  const DEFAULT_INTERVAL_MS = 1000;

  function text(value, limit = 500) {
    return String(value ?? "").trim().slice(0, limit);
  }

  function normalizeFilters(filters = {}) {
    return {
      status: text(filters.status, 20).toLowerCase(),
      source: text(filters.source, 40).toLowerCase(),
      lab: text(filters.lab, 20).toLowerCase(),
      step: text(filters.step, 80).toLowerCase(),
      keyword: text(filters.keyword, 120).toLowerCase()
    };
  }

  function eventMatches(event, filters = {}) {
    if (!event || typeof event !== "object") return false;
    const normalized = normalizeFilters(filters);
    const status = text(event.status, 20).toLowerCase();
    const source = text(event.source, 40).toLowerCase();
    const lab = text(event.lab, 20).toLowerCase();
    const step = text(event.step, 80).toLowerCase();
    if (normalized.status && status !== normalized.status) return false;
    if (normalized.source && source !== normalized.source) return false;
    if (normalized.lab && lab !== normalized.lab) return false;
    if (normalized.step && step !== normalized.step) return false;
    if (!normalized.keyword) return true;
    const haystack = [lab, step, status, source, text(event.detail || event.raw, 500).toLowerCase()].join(" ");
    return haystack.includes(normalized.keyword);
  }

  function visibleEventIndexes(events, filters = {}) {
    const source = Array.isArray(events) ? events : [];
    const indexes = [];
    source.forEach((event, index) => {
      if (eventMatches(event, filters)) indexes.push(index);
    });
    return indexes;
  }

  function finiteTime(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function eventDurationMs(events, index) {
    if (!Array.isArray(events) || index <= 0 || index >= events.length) return null;
    const previous = finiteTime(events[index - 1]?.timestamp);
    const current = finiteTime(events[index]?.timestamp);
    if (previous === null || current === null) return null;
    const duration = current - previous;
    return duration >= 0 ? duration : null;
  }

  function timelineStats(run) {
    const events = Array.isArray(run?.events) ? run.events : [];
    const start = finiteTime(run?.startedAt);
    const end = finiteTime(run?.endedAt);
    let durationMs = start !== null && end !== null && end >= start ? end - start : null;
    if (durationMs === null && events.length > 1) {
      const first = finiteTime(events[0]?.timestamp);
      const last = finiteTime(events[events.length - 1]?.timestamp);
      if (first !== null && last !== null && last >= first) durationMs = last - first;
    }
    return {
      eventCount: events.length,
      durationMs,
      result: text(run?.result, 20) || "unknown",
      interrupted: Boolean(run?.stopped || run?.result === "stopped")
    };
  }

  function firstFailureIndex(events) {
    if (!Array.isArray(events)) return -1;
    return events.findIndex((event) => (
      event?.status === "fail"
      || event?.step === "fail"
      || event?.step === "panic"
    ));
  }

  function eventIdentity(event) {
    if (!event) return "missing";
    return [event.lab, event.step, event.status, event.source, event.detail].map((value) => text(value, 500)).join("|");
  }

  function reorderedRowIndexes(rows) {
    const shared = rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => (
        row?.scope === "shared"
        && Number.isInteger(row.starterIndex)
        && Number.isInteger(row.solutionIndex)
      ));
    const starterOrder = [...shared].sort((left, right) => (
      left.row.starterIndex - right.row.starterIndex || left.rowIndex - right.rowIndex
    ));
    const solutionOrder = [...shared].sort((left, right) => (
      left.row.solutionIndex - right.row.solutionIndex || left.rowIndex - right.rowIndex
    ));
    const reordered = new Set();
    starterOrder.forEach((item, index) => {
      const other = solutionOrder[index];
      if (other && item.rowIndex !== other.rowIndex) {
        reordered.add(item.rowIndex);
        reordered.add(other.rowIndex);
      }
    });
    return reordered;
  }

  function firstRunDifference(comparison, role = "") {
    if (!comparison || !Array.isArray(comparison.rows)) return null;
    const targetRole = role === "starter" || role === "solution" ? role : "";
    const reordered = reorderedRowIndexes(comparison.rows);
    let earliest = null;
    for (const [rowIndex, row] of comparison.rows.entries()) {
      const differs = (
        row.scope !== "shared"
        || eventIdentity(row.starter) !== eventIdentity(row.solution)
        || reordered.has(rowIndex)
      );
      if (!differs) continue;
      if (targetRole && !Number.isInteger(row[`${targetRole}Index`])) continue;
      const candidate = {
        rowIndex,
        scope: row.scope,
        starterIndex: Number.isInteger(row.starterIndex) ? row.starterIndex : null,
        solutionIndex: Number.isInteger(row.solutionIndex) ? row.solutionIndex : null,
        starter: row.starter || null,
        solution: row.solution || null
      };
      if (!targetRole) return candidate;
      if (!earliest || candidate[`${targetRole}Index`] < earliest[`${targetRole}Index`]) earliest = candidate;
    }
    return earliest;
  }

  function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "无法判断";
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1)} s`;
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
    return `${minutes} min ${seconds} s`;
  }

  function createTimelineController(options = {}) {
    const scheduleTimeout = options.setTimeout || ((callback, delay) => setTimeout(callback, delay));
    const cancelTimeout = options.clearTimeout || ((id) => clearTimeout(id));
    const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs > 0
      ? options.intervalMs
      : DEFAULT_INTERVAL_MS;
    let events = [];
    let filters = normalizeFilters();
    let index = -1;
    let speed = 1;
    let playing = false;
    let timer = null;
    let generation = 0;

    function snapshot() {
      return {
        version: TIMELINE_VERSION,
        index,
        speed,
        playing,
        filters: { ...filters },
        eventCount: events.length,
        visibleIndexes: visibleEventIndexes(events, filters)
      };
    }

    function notifyIndex(reason) {
      if (typeof options.onIndex === "function") options.onIndex(index, snapshot(), reason);
    }

    function notifyPlaying() {
      if (typeof options.onPlayingChange === "function") options.onPlayingChange(playing, snapshot());
    }

    function clearTimer() {
      generation += 1;
      if (timer !== null) cancelTimeout(timer);
      timer = null;
    }

    function nextVisibleIndex() {
      return visibleEventIndexes(events, filters).find((candidate) => candidate > index) ?? -1;
    }

    function previousVisibleIndex() {
      const candidates = visibleEventIndexes(events, filters).filter((candidate) => candidate < index);
      return candidates.length ? candidates[candidates.length - 1] : -1;
    }

    function stopPlayback() {
      const changed = playing;
      playing = false;
      clearTimer();
      if (changed) notifyPlaying();
    }

    function scheduleNext() {
      clearTimer();
      if (!playing) return;
      const next = nextVisibleIndex();
      if (next < 0) {
        stopPlayback();
        return;
      }
      const token = generation;
      timer = scheduleTimeout(() => {
        if (!playing || token !== generation) return;
        timer = null;
        index = next;
        notifyIndex("playback");
        scheduleNext();
      }, intervalMs / speed);
    }

    function setEvents(nextEvents) {
      stopPlayback();
      events = Array.isArray(nextEvents) ? nextEvents : [];
      index = -1;
      return snapshot();
    }

    function setFilters(nextFilters) {
      filters = normalizeFilters(nextFilters);
      if (playing) scheduleNext();
      return snapshot();
    }

    function setSpeed(nextSpeed) {
      const numeric = Number(nextSpeed);
      if (!SPEEDS.includes(numeric)) return false;
      speed = numeric;
      if (playing) scheduleNext();
      return true;
    }

    function setIndex(nextIndex) {
      const numeric = Number(nextIndex);
      index = Number.isInteger(numeric) ? Math.max(-1, Math.min(numeric, events.length - 1)) : -1;
      return index;
    }

    function jump(nextIndex, reason = "jump") {
      const numeric = Number(nextIndex);
      if (!Number.isInteger(numeric) || numeric < -1 || numeric >= events.length) return false;
      index = numeric;
      notifyIndex(reason);
      if (playing) scheduleNext();
      return true;
    }

    function next(reason = "next") {
      const target = nextVisibleIndex();
      if (target < 0) return false;
      return jump(target, reason);
    }

    function previous(reason = "previous") {
      const target = previousVisibleIndex();
      if (target < 0) return jump(-1, reason);
      return jump(target, reason);
    }

    function play() {
      const visible = visibleEventIndexes(events, filters);
      if (visible.length === 0) return false;
      if (nextVisibleIndex() < 0) {
        index = -1;
        notifyIndex("restart");
      }
      if (!playing) {
        playing = true;
        notifyPlaying();
      }
      scheduleNext();
      return true;
    }

    function pause() {
      stopPlayback();
      return snapshot();
    }

    function destroy() {
      stopPlayback();
      events = [];
      index = -1;
    }

    return {
      destroy,
      getSnapshot: snapshot,
      jump,
      next,
      pause,
      play,
      previous,
      setEvents,
      setFilters,
      setIndex,
      setSpeed
    };
  }

  const api = {
    DEFAULT_INTERVAL_MS,
    SPEEDS,
    TIMELINE_VERSION,
    createTimelineController,
    eventDurationMs,
    eventMatches,
    firstFailureIndex,
    firstRunDifference,
    formatDuration,
    normalizeFilters,
    timelineStats,
    visibleEventIndexes
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsTimelineController = api;
})();
