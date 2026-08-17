(function () {
  "use strict";

  const stateApi = window.OsDemoUiShellState;
  if (!stateApi) return;

  const root = document.documentElement;
  const main = document.getElementById("main-content");
  const commandBar = document.querySelector(".workspace-command-bar");
  if (!main || !commandBar) return;

  function localStore() {
    try { return window.localStorage; } catch (_) { return null; }
  }

  const compactViewport = window.matchMedia("(max-width: 1180px)");
  let activeView = stateApi.loadWorkspaceView(localStore());
  let agentOpen = false;
  let predictionOpen = false;
  const panels = new Map();

  function createElement(tag, className, attributes = {}) {
    const element = document.createElement(tag);
    element.className = className;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  function moveIfPresent(parent, selector) {
    const element = document.querySelector(selector);
    if (element) parent.append(element);
  }

  function buildWorkspace() {
    const firstContent = document.getElementById("lab-timeline-section");
    if (!firstContent) return;
    const layout = createElement("div", "workspace-layout");
    const labRail = createElement("aside", "workspace-lab-rail", { "aria-label": "实验路径" });
    const canvas = createElement("div", "workspace-canvas");
    const agentRail = createElement("aside", "workspace-agent-rail", {
      id: "workspace-agent-rail",
      "aria-label": "AI 教学助教"
    });

    for (const view of stateApi.WORKSPACE_VIEWS) {
      const panel = createElement("section", `workspace-panel workspace-panel-${view}`, {
        "data-workspace-panel": view,
        "aria-label": view === "experiment" ? "实验工作区" : view === "evidence" ? "证据工作区" : "复盘工作区"
      });
      panels.set(view, panel);
      canvas.append(panel);
    }

    main.insertBefore(layout, firstContent);
    layout.append(labRail, canvas, agentRail);
    moveIfPresent(labRail, "#lab-timeline-section");
    moveIfPresent(panels.get("experiment"), ".stage-layout");
    moveIfPresent(panels.get("experiment"), "#knowledge-section");
    moveIfPresent(agentRail, "#agent-panel");
    moveIfPresent(panels.get("evidence"), ".evidence-grid");
    moveIfPresent(panels.get("evidence"), "#run-lab-panel");
    moveIfPresent(panels.get("reflect"), ".learning-loop");
    moveIfPresent(panels.get("reflect"), "#feedback");
  }

  function workspaceViewButtons() {
    return [...document.querySelectorAll(".workspace-view-switch button[data-workspace-view]")];
  }

  function applyWorkspaceView(view) {
    if (!stateApi.WORKSPACE_VIEWS.includes(view)) return;
    activeView = view;
    stateApi.saveWorkspaceView(localStore(), view);
    workspaceViewButtons().forEach((button) => {
      const selected = button.dataset.workspaceView === view;
      button.setAttribute("aria-pressed", String(selected));
    });
    if (root.dataset.mode === "presentation") {
      panels.forEach((panel) => { panel.hidden = false; });
    } else {
      panels.forEach((panel, key) => { panel.hidden = key !== view; });
    }
    root.dataset.workspaceView = view;
  }

  function setAgentOpen(open) {
    agentOpen = open === true;
    root.dataset.agentOpen = String(agentOpen);
    const toggle = document.getElementById("workspace-agent-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", String(agentOpen));
  }

  function setPredictionOpen(open) {
    predictionOpen = open === true;
    root.dataset.predictionOpen = String(predictionOpen);
    const toggle = document.getElementById("workspace-prediction-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", String(predictionOpen));
  }

  function syncModeControls() {
    const presentation = root.dataset.mode === "presentation";
    document.getElementById("workspace-mode-normal")?.setAttribute("aria-pressed", String(!presentation));
    document.getElementById("workspace-mode-presentation")?.setAttribute("aria-pressed", String(presentation));
    applyWorkspaceView(activeView);
  }

  function revealTarget(selector) {
    if (selector === "#knowledge-section") applyWorkspaceView("experiment");
    else if (["#run-lab-panel", "#event-detail-panel", "#state-comparison"].includes(selector)) applyWorkspaceView("evidence");
  }

  buildWorkspace();
  setAgentOpen(agentOpen);
  stateApi.clearLegacyUiPreference(localStore());
  const canonicalUrl = stateApi.removeLegacyUiParameter(window.location.href);
  if (canonicalUrl) window.history.replaceState(null, "", canonicalUrl);
  applyWorkspaceView(activeView);

  workspaceViewButtons().forEach((button) => {
    button.addEventListener("click", () => applyWorkspaceView(button.dataset.workspaceView));
  });
  document.querySelector(".workspace-view-switch")?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = workspaceViewButtons();
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
  document.getElementById("workspace-agent-toggle")?.addEventListener("click", () => setAgentOpen(!agentOpen));
  document.getElementById("workspace-prediction-toggle")?.addEventListener("click", () => setPredictionOpen(!predictionOpen));
  document.getElementById("workspace-mode-normal")?.addEventListener("click", () => {
    if (root.dataset.mode === "presentation") document.getElementById("presentation-mode-toggle")?.click();
  });
  document.getElementById("workspace-mode-presentation")?.addEventListener("click", () => {
    if (root.dataset.mode !== "presentation") document.getElementById("presentation-mode-toggle")?.click();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-presentation-target]");
    if (trigger) revealTarget(trigger.dataset.presentationTarget);
  }, true);

  compactViewport.addEventListener?.("change", (event) => {
    if (event.matches) setAgentOpen(false);
  });

  new MutationObserver(syncModeControls).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
  syncModeControls();
})();
