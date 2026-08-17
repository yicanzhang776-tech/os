(function () {
  "use strict";
  const bridge = window.kernelBuddy;
  const motion = window.OsTeachingAgentPetMotion;
  const shell = document.querySelector(".pet-shell");
  const screen = document.getElementById("pet-screen");
  const status = document.getElementById("pet-status");
  const sprites = [...document.querySelectorAll(".pet-sprite")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!bridge || !motion || !shell || !screen || !status || sprites.length !== 2) return;

  let activeSprite = 0;
  let runtimeState = "idle";
  let settings = { motionPaused: false };
  let suspended = false;
  let lastInteractionAt = Date.now();

  function renderPose(pose) {
    shell.dataset.pose = pose;
    const next = activeSprite === 0 ? 1 : 0;
    sprites[next].dataset.pose = pose;
    sprites[next].classList.add("is-active");
    sprites[activeSprite].classList.remove("is-active");
    activeSprite = next;
  }

  const director = motion.createMotionDirector({
    onPose: renderPose,
    getIdleMs: () => Date.now() - lastInteractionAt
  });

  function syncMotion() {
    director.setRuntimeState(runtimeState);
    director.setPaused(settings.motionPaused || suspended || document.hidden || reduced.matches);
  }

  screen.addEventListener("click", () => {
    lastInteractionAt = Date.now();
    bridge.openPrompt();
  });
  document.addEventListener("visibilitychange", syncMotion);
  reduced.addEventListener("change", syncMotion);
  bridge.onSettings((value) => {
    settings = value && typeof value === "object" ? value : settings;
    syncMotion();
  });
  bridge.onContext((value) => {
    runtimeState = ["idle", "running", "error"].includes(value?.state) ? value.state : "idle";
    suspended = value?.suspended === true;
    shell.dataset.state = runtimeState;
    status.textContent = runtimeState === "running" ? "运行中" : runtimeState === "error" ? "需检查" : "空闲";
    status.title = typeof value?.label === "string" ? value.label : "";
    syncMotion();
  });
  director.start();
})();
