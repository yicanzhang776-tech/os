(function (root, factory) {
  "use strict";
  const motion = typeof module === "object" && module.exports
    ? require("./agent-pet-motion")
    : root?.OsTeachingAgentPetMotion;
  const api = factory(root, motion);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentPet = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, defaultMotion) {
  "use strict";

  const ERROR_PATTERN = /(?:error|failed?|failure|panic|timeout|unavailable|disconnected|offline|错误|失败|异常|超时|不可用|已断开|无法识别|未连接)/iu;
  const RUNNING_PATTERN = /(?:running|building|starting|pending|运行中|构建中|启动中|正在运行|等待真实\s*marker)/iu;
  const PET_SIZE = Object.freeze({ width: 112, height: 112 });
  const PET_MARGIN = 14;

  function classifyPetState({ connectionText = "", statusText = "", statusData = "" } = {}) {
    const evidence = `${connectionText} ${statusText} ${statusData}`;
    if (ERROR_PATTERN.test(evidence)) return "error";
    if (RUNNING_PATTERN.test(evidence)) return "running";
    return "idle";
  }

  function createPetController(options = {}) {
    const document = options.document;
    const petMotion = options.petMotion || defaultMotion;
    const entryState = options.entryState;
    const client = options.client;
    const sessionStore = options.sessionStore || (() => null);
    const localStore = options.localStore || (() => null);
    const location = options.location;
    const windowObject = options.windowObject || root;
    const requestAnimationFrame = options.requestAnimationFrame || ((callback) => callback());
    const setTimer = options.setTimer || setTimeout;
    const MutationObserver = options.MutationObserver;
    const pet = document?.querySelector(".agent-pet");
    const trigger = document?.getElementById("kernel-buddy");
    const panel = document?.getElementById("agent-mini-panel");
    const close = document?.getElementById("agent-mini-close");
    const reset = document?.getElementById("agent-pet-reset");
    const form = document?.getElementById("agent-mini-form");
    const message = document?.getElementById("agent-mini-message");
    const status = document?.getElementById("agent-mini-status");
    const connection = document?.getElementById("connection-status");
    const statusChip = document?.getElementById("status-chip");
    if (!pet || !trigger || !panel || !form || !message || !status || !entryState || !client
      || !location || !petMotion) return null;

    let runtimeState = "idle";
    let currentPose = "idle";
    let activeSprite = 0;
    let lastInteractionAt = Date.now();
    let drag = null;
    let suppressClick = false;
    let resizeFrame = null;
    const sprites = [...(trigger.querySelectorAll?.(".agent-pet-sprite") || [])];
    const reducedMotion = windowObject?.matchMedia?.("(prefers-reduced-motion: reduce)") || null;

    function viewport() {
      const width = Number(windowObject?.innerWidth) || 1440;
      const height = Number(windowObject?.innerHeight) || 900;
      const agentOpen = document.documentElement?.dataset?.agentOpen === "true" && width > 880;
      return { width: width - (agentOpen ? 440 : 0), height };
    }

    function setPosition(position, side) {
      const area = viewport();
      const bounded = petMotion.clampPetPosition(position, area, PET_SIZE, PET_MARGIN);
      if (pet.style) {
        pet.style.left = `${Math.round(bounded.x)}px`;
        pet.style.top = `${Math.round(bounded.y)}px`;
        pet.style.right = "auto";
        pet.style.bottom = "auto";
      }
      if (side) pet.dataset.petSide = side;
      pet.dataset.panelVertical = bounded.y > area.height / 2 ? "above" : "below";
      if (!panel.hidden) positionPanel();
      return bounded;
    }

    function positionPanel() {
      const area = viewport();
      const petRect = pet.getBoundingClientRect?.() || { left: 0, top: 0, width: PET_SIZE.width, height: PET_SIZE.height };
      const panelRect = panel.getBoundingClientRect?.() || {};
      const panelWidth = Number(panelRect.width) || 360;
      const panelHeight = Number(panelRect.height) || 390;
      const petLeft = Number(petRect.left) || 0;
      const petTop = Number(petRect.top) || 0;
      const petWidth = Number(petRect.width) || PET_SIZE.width;
      const petHeight = Number(petRect.height) || PET_SIZE.height;
      const above = petTop + petHeight + 12 + panelHeight > area.height - PET_MARGIN;
      const left = pet.dataset.petSide === "left"
        ? petLeft
        : petLeft + petWidth - panelWidth;
      const top = above ? petTop - panelHeight - 10 : petTop + petHeight + 10;
      panel.style.left = `${Math.round(Math.min(Math.max(left, PET_MARGIN), Math.max(PET_MARGIN, area.width - panelWidth - PET_MARGIN)))}px`;
      panel.style.top = `${Math.round(Math.min(Math.max(top, PET_MARGIN), Math.max(PET_MARGIN, area.height - panelHeight - PET_MARGIN)))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      pet.dataset.panelVertical = above ? "above" : "below";
    }

    function currentPosition() {
      const rectangle = pet.getBoundingClientRect?.();
      if (rectangle && Number.isFinite(rectangle.left) && Number.isFinite(rectangle.top)) {
        return { x: rectangle.left, y: rectangle.top };
      }
      return {
        x: Number.parseFloat(pet.style?.left) || viewport().width - PET_SIZE.width - PET_MARGIN,
        y: Number.parseFloat(pet.style?.top) || viewport().height - PET_SIZE.height - PET_MARGIN
      };
    }

    function snapAndSave(position = currentPosition()) {
      const snapped = petMotion.snapPetPosition(position, viewport(), PET_SIZE, PET_MARGIN);
      setPosition(snapped, snapped.side);
      petMotion.writePosition(localStore(), snapped.preference);
      return snapped;
    }

    function restorePosition() {
      const preference = petMotion.readPosition(localStore()) || { version: 1, side: "right", yRatio: 0.82 };
      const restored = petMotion.positionFromPreference(preference, viewport(), PET_SIZE, PET_MARGIN);
      setPosition(restored, restored.side);
    }

    function resetPosition() {
      petMotion.clearPosition(localStore());
      const restored = petMotion.positionFromPreference({ version: 1, side: "right", yRatio: 0.82 }, viewport(), PET_SIZE, PET_MARGIN);
      setPosition(restored, restored.side);
      status.textContent = "小内核已回到默认位置。";
      delete status.dataset.status;
    }

    function renderPose(pose) {
      currentPose = pose;
      pet.dataset.petPose = pose;
      if (sprites.length < 2) return;
      const next = activeSprite === 0 ? 1 : 0;
      sprites[next].dataset.pose = pose;
      sprites[next].classList?.add("is-active");
      sprites[activeSprite].classList?.remove("is-active");
      activeSprite = next;
    }

    const director = petMotion.createMotionDirector({
      onPose: renderPose,
      getIdleMs: () => Date.now() - lastInteractionAt,
      setTimer: options.setTimer,
      clearTimer: options.clearTimer,
      random: options.random
    });

    function motionPaused() {
      return !panel.hidden || Boolean(drag?.dragging) || document.hidden === true || reducedMotion?.matches === true;
    }

    function syncMotion() {
      director.setRuntimeState(runtimeState);
      director.setPaused(motionPaused());
    }

    function applyPetState(state) {
      pet.setAttribute("data-pet-state", state);
      const label = pet.querySelector(".agent-pet-state");
      if (label) label.textContent = { idle: "空闲", running: "运行中", error: "需检查", open: "提问中" }[state];
    }

    function setPanel(open) {
      panel.hidden = !open;
      if (open) positionPanel();
      trigger.setAttribute("aria-expanded", String(open));
      applyPetState(open ? "open" : runtimeState);
      lastInteractionAt = Date.now();
      syncMotion();
      if (open) requestAnimationFrame(() => message.focus());
    }

    function syncPetState() {
      runtimeState = classifyPetState({
        connectionText: connection?.textContent,
        statusText: statusChip?.textContent,
        statusData: statusChip?.dataset.status
      });
      applyPetState(panel.hidden ? runtimeState : "open");
      syncMotion();
    }

    function pointerPoint(event) {
      return { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
    }

    function onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      lastInteractionAt = Date.now();
      drag = {
        id: event.pointerId,
        startPointer: pointerPoint(event),
        startPosition: currentPosition(),
        dragging: false
      };
    }

    function onPointerMove(event) {
      if (!drag || (drag.id !== undefined && event.pointerId !== undefined && drag.id !== event.pointerId)) return;
      const point = pointerPoint(event);
      if (!drag.dragging && petMotion.dragDistance(drag.startPointer, point) < petMotion.DRAG_THRESHOLD) return;
      if (!drag.dragging) {
        drag.dragging = true;
        setPanel(false);
        pet.dataset.dragging = "true";
        trigger.setPointerCapture?.(event.pointerId);
        syncMotion();
      }
      event.preventDefault?.();
      setPosition({
        x: drag.startPosition.x + point.x - drag.startPointer.x,
        y: drag.startPosition.y + point.y - drag.startPointer.y
      }, pet.dataset.petSide);
    }

    function onPointerUp(event) {
      if (!drag || (drag.id !== undefined && event.pointerId !== undefined && drag.id !== event.pointerId)) return;
      const wasDragging = drag.dragging;
      drag = null;
      delete pet.dataset.dragging;
      trigger.releasePointerCapture?.(event.pointerId);
      if (wasDragging) {
        snapAndSave();
        suppressClick = true;
        setTimer(() => { suppressClick = false; }, 0);
      }
      syncMotion();
    }

    trigger.addEventListener("pointerdown", onPointerDown);
    windowObject?.addEventListener?.("pointermove", onPointerMove, { passive: false });
    windowObject?.addEventListener?.("pointerup", onPointerUp);
    windowObject?.addEventListener?.("pointercancel", onPointerUp);
    trigger.addEventListener("click", () => {
      if (suppressClick) return;
      setPanel(panel.hidden);
    });
    close?.addEventListener("click", () => {
      setPanel(false);
      trigger.focus();
    });
    reset?.addEventListener("click", resetPosition);
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      setPanel(false);
      trigger.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (panel.hidden || pet.contains(event.target)) return;
      setPanel(false);
    });
    document.addEventListener("visibilitychange", syncMotion);
    reducedMotion?.addEventListener?.("change", syncMotion);
    windowObject?.addEventListener?.("resize", () => {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        restorePosition();
      });
    });
    message.addEventListener("input", () => {
      lastInteractionAt = Date.now();
      status.textContent = "";
      delete status.dataset.status;
    });
    message.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey) || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      form.requestSubmit();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      let prompt;
      try {
        prompt = client.validateAgentMessage(message.value);
      } catch (error) {
        status.dataset.status = "error";
        status.textContent = client.agentErrorMessage(error?.code || error?.message);
        message.focus();
        return;
      }
      const saved = entryState.savePendingPrompt(sessionStore(), prompt);
      if (!saved) {
        status.dataset.status = "error";
        status.textContent = "当前浏览器无法转交问题。请打开完整助教后再次输入。";
        message.focus();
        return;
      }
      location.assign("agent.html");
    });

    const observer = typeof MutationObserver === "function" ? new MutationObserver(() => {
      syncPetState();
      restorePosition();
    }) : null;
    [connection, statusChip].forEach((node) => {
      if (node) observer?.observe(node, { attributes: true, attributeFilter: ["class", "data-status"], childList: true, characterData: true, subtree: true });
    });
    if (document.documentElement) observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-agent-open", "data-mode"] });
    restorePosition();
    syncPetState();
    director.start();
    return Object.freeze({ currentPose: () => currentPose, resetPosition, restorePosition, setPanel, snapAndSave, syncPetState });
  }

  function sessionStore() {
    try { return root.sessionStorage; } catch (_) { return null; }
  }

  function localStore() {
    try { return root.localStorage; } catch (_) { return null; }
  }

  function start() {
    return createPetController({
      document: root.document,
      entryState: root.OsTeachingAgentEntryState,
      client: root.OsTeachingAgentClient,
      petMotion: root.OsTeachingAgentPetMotion,
      sessionStore,
      localStore,
      location: root.location,
      windowObject: root,
      requestAnimationFrame: root.requestAnimationFrame?.bind(root),
      MutationObserver: root.MutationObserver
    });
  }

  if (root?.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }

  return Object.freeze({ classifyPetState, createPetController, start });
});
