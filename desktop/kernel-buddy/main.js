"use strict";

const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  screen,
  shell,
  Tray
} = require("electron");
const {
  PET_HEIGHT,
  PET_WIDTH,
  PROMPT_HEIGHT,
  PROMPT_WIDTH,
  buildTutorUrl,
  clampToWorkArea,
  isTrustedRendererUrl,
  mapContextState,
  petWindowOptions,
  promptWindowOptions,
  validateBridgeOrigin,
  validatePrompt
} = require("./desktop-core");
const { createSettingsStore } = require("./settings-store");

protocol.registerSchemesAsPrivileged([{
  scheme: "buddy",
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

const originFlag = process.argv.indexOf("--bridge-origin");
const bridgeOrigin = validateBridgeOrigin(originFlag >= 0 ? process.argv[originFlag + 1] : "http://127.0.0.1:8888");
const preload = path.join(__dirname, "preload.js");
const rendererDir = path.join(__dirname, "renderer");
const demoDir = path.resolve(__dirname, "..", "..", "docs", "interactive-demo");
const rendererAssets = new Map([
  ["/pet.html", path.join(rendererDir, "pet.html")],
  ["/prompt.html", path.join(rendererDir, "prompt.html")],
  ["/pet.css", path.join(rendererDir, "pet.css")],
  ["/prompt.css", path.join(rendererDir, "prompt.css")],
  ["/pet.js", path.join(rendererDir, "pet.js")],
  ["/prompt.js", path.join(rendererDir, "prompt.js")],
  ["/shared/agent-pet-motion.js", path.join(demoDir, "agent-pet-motion.js")],
  ["/assets/kernel-buddy-sprites.png", path.join(demoDir, "assets", "kernel-buddy-sprites.png")]
]);

let petWindow = null;
let promptWindow = null;
let tray = null;
let pollTimer = null;
let quitting = false;
let suspended = false;
let settingsStore = null;

function forceXWaylandWhenAvailable() {
  if (process.platform !== "linux" || !process.env.WAYLAND_DISPLAY || !process.env.DISPLAY) return false;
  app.commandLine.appendSwitch("ozone-platform", "x11");
  return true;
}

const usingXWayland = forceXWaylandWhenAvailable();

function displayForSettings(settings) {
  const displays = screen.getAllDisplays();
  return displays.find((display) => String(display.id) === settings.displayId)
    || (Number.isFinite(settings.x) && Number.isFinite(settings.y)
      ? screen.getDisplayNearestPoint({ x: settings.x, y: settings.y })
      : screen.getPrimaryDisplay());
}

function restoredPosition(settings) {
  const display = displayForSettings(settings);
  return {
    ...clampToWorkArea(settings, display.workArea),
    displayId: String(display.id)
  };
}

function savePetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const display = screen.getDisplayNearestPoint({ x: x + PET_WIDTH / 2, y: y + PET_HEIGHT / 2 });
  settingsStore.write({ x, y, displayId: String(display.id) });
}

function promptPosition() {
  const [petX, petY] = petWindow.getPosition();
  const display = screen.getDisplayNearestPoint({ x: petX, y: petY });
  const work = display.workArea;
  const toLeft = petX + PET_WIDTH + PROMPT_WIDTH + 16 > work.x + work.width;
  return {
    x: Math.min(Math.max(toLeft ? petX - PROMPT_WIDTH - 12 : petX + PET_WIDTH + 12, work.x), work.x + work.width - PROMPT_WIDTH),
    y: Math.min(Math.max(petY - 40, work.y), work.y + work.height - PROMPT_HEIGHT)
  };
}

function configureWindowSecurity(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
}

function sendSettings() {
  const settings = settingsStore.current();
  petWindow?.webContents.send("pet:settings", settings);
  promptWindow?.webContents.send("pet:settings", settings);
}

function createPetWindow() {
  const settings = settingsStore.read();
  const position = restoredPosition(settings);
  settingsStore.write(position);
  petWindow = new BrowserWindow(petWindowOptions(position, preload, settings.alwaysOnTop));
  configureWindowSecurity(petWindow);
  petWindow.loadURL("buddy://app/pet.html");
  petWindow.webContents.once("did-finish-load", () => {
    sendSettings();
    petWindow.showInactive();
  });
  petWindow.on("moved", savePetPosition);
  petWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    petWindow.hide();
  });
}

function createPromptWindow() {
  promptWindow = new BrowserWindow(promptWindowOptions(promptPosition(), preload));
  configureWindowSecurity(promptWindow);
  promptWindow.loadURL("buddy://app/prompt.html");
  promptWindow.webContents.once("did-finish-load", sendSettings);
  promptWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    promptWindow.hide();
  });
}

function openPrompt() {
  if (!promptWindow || promptWindow.isDestroyed()) createPromptWindow();
  const position = promptPosition();
  promptWindow.setPosition(position.x, position.y, false);
  promptWindow.show();
  promptWindow.focus();
}

function resetPetPosition() {
  const display = screen.getPrimaryDisplay();
  const position = clampToWorkArea({}, display.workArea);
  petWindow.setPosition(Math.round(position.x), Math.round(position.y), true);
  settingsStore.write({ ...position, displayId: String(display.id) });
  sendSettings();
}

function requestJson(pathname, method = "GET", value = null) {
  return new Promise((resolve, reject) => {
    const body = value === null ? null : Buffer.from(JSON.stringify(value));
    const url = new URL(pathname, bridgeOrigin);
    const request = http.request(url, {
      method,
      headers: {
        accept: "application/json",
        origin: bridgeOrigin,
        ...(body ? { "content-type": "application/json; charset=utf-8", "content-length": body.length } : {})
      },
      timeout: 8000
    }, (response) => {
      const chunks = [];
      let length = 0;
      response.on("data", (chunk) => {
        length += chunk.length;
        if (length > 64 * 1024) {
          response.destroy(new Error("Bridge response is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (response.statusCode < 200 || response.statusCode >= 300 || parsed?.ok === false) {
            reject(new Error(typeof parsed?.error?.code === "string" ? parsed.error.code : "bridge_error"));
            return;
          }
          resolve(parsed);
        } catch (_) { reject(new Error("bridge_error")); }
      });
    });
    request.once("timeout", () => request.destroy(new Error("bridge_timeout")));
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function createHandoff(message) {
  const prompt = validatePrompt(message);
  const result = await requestJson("/api/agent/handoff", "POST", { message: prompt });
  const token = result?.data?.token;
  const tutorUrl = buildTutorUrl(bridgeOrigin, token);
  await shell.openExternal(tutorUrl);
  return { ok: true };
}

function contextPayload(body = null, offline = false) {
  return Object.freeze({
    state: offline ? "error" : mapContextState(body),
    label: offline ? "实验服务离线" : body?.runState?.detail || "等待运行当前实验",
    branch: offline ? "未连接" : body?.context?.branch || "未知分支",
    suspended
  });
}

async function pollContext() {
  try {
    const body = await requestJson("/api/context");
    petWindow?.webContents.send("pet:context", contextPayload(body));
    promptWindow?.webContents.send("pet:context", contextPayload(body));
  } catch (_) {
    petWindow?.webContents.send("pet:context", contextPayload(null, true));
    promptWindow?.webContents.send("pet:context", contextPayload(null, true));
  }
}

function trustedIpc(event) {
  if (!isTrustedRendererUrl(event.senderFrame?.url)) throw new Error("Untrusted renderer.");
}

function registerIpc() {
  ipcMain.handle("pet:open-prompt", (event) => { trustedIpc(event); openPrompt(); return true; });
  ipcMain.handle("prompt:close", (event) => { trustedIpc(event); promptWindow?.hide(); return true; });
  ipcMain.handle("prompt:open-tutor", async (event) => {
    trustedIpc(event);
    await shell.openExternal(`${bridgeOrigin}/agent.html`);
    return true;
  });
  ipcMain.handle("prompt:submit", async (event, message) => {
    trustedIpc(event);
    return createHandoff(message);
  });
  ipcMain.handle("pet:reset", (event) => { trustedIpc(event); resetPetPosition(); return true; });
  ipcMain.handle("pet:set-motion-paused", (event, value) => {
    trustedIpc(event);
    settingsStore.write({ motionPaused: value === true });
    sendSettings();
    rebuildTray();
    return true;
  });
  ipcMain.handle("pet:set-always-on-top", (event, value) => {
    trustedIpc(event);
    const enabled = value === true;
    petWindow.setAlwaysOnTop(enabled);
    settingsStore.write({ alwaysOnTop: enabled });
    sendSettings();
    rebuildTray();
    return true;
  });
  ipcMain.handle("pet:hide", (event) => { trustedIpc(event); petWindow.hide(); return true; });
  ipcMain.handle("app:quit", (event) => { trustedIpc(event); app.quit(); return true; });
}

function rebuildTray() {
  if (!tray) return;
  const settings = settingsStore.current();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开助教", click: openPrompt },
    { type: "separator" },
    {
      label: settings.motionPaused ? "继续动作" : "暂停动作",
      click: () => { settingsStore.write({ motionPaused: !settings.motionPaused }); sendSettings(); rebuildTray(); }
    },
    {
      label: "保持置顶",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: (item) => { petWindow.setAlwaysOnTop(item.checked); settingsStore.write({ alwaysOnTop: item.checked }); sendSettings(); }
    },
    { label: "复位位置", click: resetPetPosition },
    { label: "隐藏桌宠", click: () => petWindow.hide() },
    { type: "separator" },
    { label: "完全退出", click: () => app.quit() }
  ]));
}

function createTray() {
  const source = path.join(demoDir, "assets", "kernel-buddy.png");
  const icon = nativeImage.createFromPath(source).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("小内核助教");
  tray.on("click", () => {
    if (petWindow.isVisible()) openPrompt();
    else petWindow.showInactive();
  });
  rebuildTray();
}

function registerProtocol() {
  protocol.handle("buddy", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app" || url.search || url.hash || !rendererAssets.has(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(rendererAssets.get(url.pathname)).toString());
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    petWindow?.showInactive();
    openPrompt();
  });
  app.on("before-quit", () => { quitting = true; });
  app.whenReady().then(() => {
    settingsStore = createSettingsStore(path.join(app.getPath("userData"), "kernel-buddy-settings.json"));
    registerProtocol();
    registerIpc();
    createPetWindow();
    createPromptWindow();
    createTray();
    sendSettings();
    pollContext();
    pollTimer = setInterval(pollContext, 2500);
    powerMonitor.on("suspend", () => { suspended = true; pollContext(); });
    powerMonitor.on("resume", () => { suspended = false; pollContext(); });
    screen.on("display-removed", () => resetPetPosition());
    screen.on("display-metrics-changed", () => {
      const position = restoredPosition(settingsStore.current());
      petWindow.setPosition(Math.round(position.x), Math.round(position.y), false);
      settingsStore.write(position);
    });
    if (process.platform === "linux" && process.env.WAYLAND_DISPLAY && !usingXWayland) {
      petWindow.webContents.send("pet:context", {
        state: "idle",
        label: "纯 Wayland：可拖动，跨会话位置恢复可能受限",
        branch: "Wayland 降级模式",
        suspended: false
      });
    }
  });
  app.on("window-all-closed", () => {});
  app.on("will-quit", () => {
    if (pollTimer) clearInterval(pollTimer);
    protocol.unhandle("buddy");
  });
}
