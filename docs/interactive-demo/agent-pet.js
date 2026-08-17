(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentPet = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const ERROR_PATTERN = /(?:error|failed?|failure|panic|timeout|unavailable|disconnected|offline|错误|失败|异常|超时|不可用|已断开|无法识别|未连接)/iu;
  const RUNNING_PATTERN = /(?:running|building|starting|pending|运行中|构建中|启动中|正在运行|等待真实\s*marker)/iu;

  function classifyPetState({ connectionText = "", statusText = "", statusData = "" } = {}) {
    const evidence = `${connectionText} ${statusText} ${statusData}`;
    if (ERROR_PATTERN.test(evidence)) return "error";
    if (RUNNING_PATTERN.test(evidence)) return "running";
    return "idle";
  }

  function createPetController(options = {}) {
    const document = options.document;
    const entryState = options.entryState;
    const client = options.client;
    const sessionStore = options.sessionStore || (() => null);
    const location = options.location;
    const requestAnimationFrame = options.requestAnimationFrame || ((callback) => callback());
    const MutationObserver = options.MutationObserver;
    const pet = document?.querySelector(".agent-pet");
    const trigger = document?.getElementById("kernel-buddy");
    const panel = document?.getElementById("agent-mini-panel");
    const close = document?.getElementById("agent-mini-close");
    const form = document?.getElementById("agent-mini-form");
    const message = document?.getElementById("agent-mini-message");
    const status = document?.getElementById("agent-mini-status");
    const connection = document?.getElementById("connection-status");
    const statusChip = document?.getElementById("status-chip");
    if (!pet || !trigger || !panel || !form || !message || !status || !entryState || !client || !location) return null;

    let runtimeState = "idle";

    function applyPetState(state) {
      pet.setAttribute("data-pet-state", state);
      const label = pet.querySelector(".agent-pet-state");
      if (label) label.textContent = { idle: "空闲", running: "运行中", error: "需检查", open: "提问中" }[state];
    }

    function setPanel(open) {
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      applyPetState(open ? "open" : runtimeState);
      if (open) requestAnimationFrame(() => message.focus());
    }

    function syncPetState() {
      runtimeState = classifyPetState({
        connectionText: connection?.textContent,
        statusText: statusChip?.textContent,
        statusData: statusChip?.dataset.status
      });
      applyPetState(panel.hidden ? runtimeState : "open");
    }

    trigger.addEventListener("click", () => setPanel(panel.hidden));
    close?.addEventListener("click", () => {
      setPanel(false);
      trigger.focus();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      setPanel(false);
      trigger.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (panel.hidden || pet.contains(event.target)) return;
      setPanel(false);
    });
    message.addEventListener("input", () => {
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

    const observer = typeof MutationObserver === "function"
      ? new MutationObserver(syncPetState)
      : null;
    [connection, statusChip].forEach((node) => {
      if (node) observer?.observe(node, { attributes: true, attributeFilter: ["class", "data-status"], childList: true, characterData: true, subtree: true });
    });
    syncPetState();
    return Object.freeze({ setPanel, syncPetState });
  }

  function sessionStore() {
    try { return root.sessionStorage; } catch (_) { return null; }
  }

  function start() {
    return createPetController({
      document: root.document,
      entryState: root.OsTeachingAgentEntryState,
      client: root.OsTeachingAgentClient,
      sessionStore,
      location: root.location,
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
