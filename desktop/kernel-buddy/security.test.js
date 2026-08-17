"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const directory = __dirname;
const main = fs.readFileSync(path.join(directory, "main.js"), "utf8");
const preload = fs.readFileSync(path.join(directory, "preload.js"), "utf8");
const petHtml = fs.readFileSync(path.join(directory, "renderer", "pet.html"), "utf8");
const promptHtml = fs.readFileSync(path.join(directory, "renderer", "prompt.html"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));

test("Electron is exactly pinned and no runtime package fetch is embedded", () => {
  assert.equal(packageJson.devDependencies.electron, "43.2.0");
  assert.doesNotMatch(main, /npm\s+(?:install|ci)|child_process|exec\(|spawn\(/);
});

test("main process uses a local protocol, fixed external URLs, and trusted IPC senders", () => {
  assert.match(main, /protocol\.registerSchemesAsPrivileged/);
  assert.match(main, /protocol\.handle\("buddy"/);
  assert.match(main, /isTrustedRendererUrl\(event\.senderFrame\?\.url\)/);
  assert.match(main, /buildTutorUrl\(bridgeOrigin, token\)/);
  assert.doesNotMatch(main, /shell\.openExternal\([^\n]*(?:message|request|event)/);
});

test("preload exposes a narrow fixed API without raw ipcRenderer", () => {
  const channels = [...preload.matchAll(/ipcRenderer\.(?:invoke|on)\("([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(channels)].sort(), [
    "app:quit",
    "pet:hide",
    "pet:open-prompt",
    "pet:reset",
    "pet:set-always-on-top",
    "pet:set-motion-paused",
    "prompt:close",
    "prompt:open-tutor",
    "prompt:submit"
  ]);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^\n]+ipcRenderer/);
});

test("both renderer documents enforce strict local-only CSP", () => {
  for (const html of [petHtml, promptHtml]) {
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /default-src 'self'/);
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /object-src 'none'/);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.doesNotMatch(html, /<script(?![^>]+src=)/);
  }
});

test("desktop pet has native drag and a separate clickable screen", () => {
  const css = fs.readFileSync(path.join(directory, "renderer", "pet.css"), "utf8");
  assert.match(css, /\.pet-drag-region[^}]+-webkit-app-region:\s*drag/s);
  assert.match(css, /#pet-screen[^}]+-webkit-app-region:\s*no-drag/s);
  assert.match(main, /new BrowserWindow\(petWindowOptions/);
  assert.match(main, /new BrowserWindow\(promptWindowOptions/);
});

test("renderer settings are delivered after load and the transparent pet is then shown", () => {
  assert.match(main, /petWindow\.webContents\.once\("did-finish-load"[\s\S]+sendSettings\(\)[\s\S]+petWindow\.showInactive\(\)/);
  assert.match(main, /promptWindow\.webContents\.once\("did-finish-load", sendSettings\)/);
  assert.doesNotMatch(main, /petWindow\.once\("ready-to-show"/);
});
