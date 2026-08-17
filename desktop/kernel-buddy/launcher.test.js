"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repo = path.resolve(__dirname, "..", "..");
const powershell = fs.readFileSync(path.join(repo, "scripts", "run-interactive-demo.ps1"), "utf8");
const shell = fs.readFileSync(path.join(repo, "scripts", "run-interactive-demo.sh"), "utf8");

test("desktop companion remains opt-in on both launchers", () => {
  assert.match(powershell, /\[switch\]\$DesktopPet/);
  assert.match(powershell, /if \(-not \$DesktopPet\)[\s\S]+& \$node\.Source @serverArgs/);
  assert.match(shell, /DESKTOP_PET=0/);
  assert.match(shell, /--desktop-pet\)/);
});

test("launchers use npm ci and verify the delayed Electron runtime", () => {
  assert.match(powershell, /npm[\s\S]+ci --prefix \$desktopPetDir/);
  assert.match(powershell, /& \$electron --version/);
  assert.match(shell, /npm ci --no-audit --no-fund/);
  assert.match(shell, /"\$ELECTRON" --version/);
  assert.doesNotMatch(`${powershell}\n${shell}`, /npm (?:install|update)/);
});

test("npm is required only when the locked Electron dependency is missing", () => {
  const powershellInstall = powershell.indexOf("if (-not (Test-Path $electron))");
  const shellInstall = shell.indexOf('if [ ! -x "$ELECTRON" ]');
  assert.ok(powershellInstall >= 0);
  assert.ok(shellInstall >= 0);
  assert.ok(powershell.indexOf("Get-Command npm", powershellInstall) > powershellInstall);
  assert.ok(shell.indexOf("require_command npm", shellInstall) > shellInstall);
  assert.doesNotMatch(powershell.slice(0, powershellInstall), /Get-Command npm/);
  assert.doesNotMatch(shell.slice(0, shellInstall), /require_command npm/);
});

test("launchers clean up only their captured bridge and pet processes", () => {
  assert.match(powershell, /Stop-Process -Id \$petProcess\.Id/);
  assert.match(powershell, /Stop-Process -Id \$serverProcess\.Id/);
  assert.match(shell, /kill "\$PET_PID"/);
  assert.match(shell, /kill "\$SERVER_PID"/);
  assert.doesNotMatch(`${powershell}\n${shell}`, /taskkill|killall|pkill/);
});

test("Linux launcher checks a graphical session and documents XWayland handling in main", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.match(shell, /DISPLAY:-/);
  assert.match(shell, /WAYLAND_DISPLAY:-/);
  assert.match(main, /appendSwitch\("ozone-platform", "x11"\)/);
  assert.match(main, /纯 Wayland/);
});
