"use strict";

const PET_WIDTH = 156;
const PET_HEIGHT = 184;
const PROMPT_WIDTH = 380;
const PROMPT_HEIGHT = 330;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_MESSAGE_LENGTH = 4000;

function bridgeOrigin(port) {
  const numeric = Number(port);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) throw new TypeError("Invalid bridge port.");
  return `http://127.0.0.1:${numeric}`;
}

function validateBridgeOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port
    || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new TypeError("Bridge origin must be a fixed loopback HTTP origin.");
  }
  return bridgeOrigin(Number(parsed.port));
}

function validatePrompt(value) {
  if (typeof value !== "string") throw new TypeError("请输入问题。");
  const prompt = value.trim();
  if (!prompt) throw new TypeError("请输入问题。");
  if (prompt.length > MAX_MESSAGE_LENGTH) throw new TypeError("问题最多 4000 个字符。");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(prompt)) throw new TypeError("问题包含不支持的控制字符。");
  return prompt;
}

function buildTutorUrl(origin, token) {
  const safeOrigin = validateBridgeOrigin(origin);
  if (!TOKEN_PATTERN.test(token)) throw new TypeError("Invalid handoff token.");
  return `${safeOrigin}/agent.html#handoff=${token}`;
}

function normalizeSettings(value = {}) {
  const x = Number.isFinite(value.x) ? Math.round(value.x) : null;
  const y = Number.isFinite(value.y) ? Math.round(value.y) : null;
  return Object.freeze({
    version: 1,
    x,
    y,
    displayId: typeof value.displayId === "string" || Number.isInteger(value.displayId) ? String(value.displayId) : null,
    alwaysOnTop: value.alwaysOnTop !== false,
    motionPaused: value.motionPaused === true
  });
}

function clampToWorkArea(position = {}, workArea = {}) {
  const x0 = Number.isFinite(workArea.x) ? workArea.x : 0;
  const y0 = Number.isFinite(workArea.y) ? workArea.y : 0;
  const width = Math.max(PET_WIDTH, Number(workArea.width) || PET_WIDTH);
  const height = Math.max(PET_HEIGHT, Number(workArea.height) || PET_HEIGHT);
  return Object.freeze({
    x: Math.min(Math.max(Number.isFinite(position.x) ? position.x : x0 + width - PET_WIDTH - 24, x0), x0 + width - PET_WIDTH),
    y: Math.min(Math.max(Number.isFinite(position.y) ? position.y : y0 + height - PET_HEIGHT - 24, y0), y0 + height - PET_HEIGHT)
  });
}

function mapContextState(payload = {}) {
  const phase = String(payload.runState?.phase || "").toLowerCase();
  const detail = String(payload.runState?.detail || "");
  if (/error|fail|panic|timeout|错误|失败|异常|超时/iu.test(`${phase} ${detail}`)) return "error";
  if (payload.runState?.running === true || /running|building|starting|运行|构建|启动/iu.test(phase)) return "running";
  return "idle";
}

function secureWebPreferences(preload) {
  return Object.freeze({
    preload,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false
  });
}

function petWindowOptions(position, preload, alwaysOnTop = true) {
  return {
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x: Math.round(position.x),
    y: Math.round(position.y),
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: alwaysOnTop === true,
    backgroundColor: "#00000000",
    webPreferences: secureWebPreferences(preload)
  };
}

function promptWindowOptions(position, preload) {
  return {
    width: PROMPT_WIDTH,
    height: PROMPT_HEIGHT,
    x: Math.round(position.x),
    y: Math.round(position.y),
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#f4f7f9",
    webPreferences: secureWebPreferences(preload)
  };
}

function isTrustedRendererUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "buddy:" && url.hostname === "app";
  } catch (_) { return false; }
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  PET_HEIGHT,
  PET_WIDTH,
  PROMPT_HEIGHT,
  PROMPT_WIDTH,
  TOKEN_PATTERN,
  bridgeOrigin,
  buildTutorUrl,
  clampToWorkArea,
  isTrustedRendererUrl,
  mapContextState,
  normalizeSettings,
  petWindowOptions,
  promptWindowOptions,
  secureWebPreferences,
  validateBridgeOrigin,
  validatePrompt
};
