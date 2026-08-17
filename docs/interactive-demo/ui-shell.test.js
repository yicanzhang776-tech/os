"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("page exposes Lab Atlas as the only UI and keeps learning and presentation entries", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.doesNotMatch(html, /id="ui-signal"|id="ui-atlas"|data-ui-choice/);
  assert.match(html, /id="workspace-mode-normal"/);
  assert.match(html, /id="workspace-mode-presentation"/);
  assert.match(html, /ui-shell-state\.js/);
  assert.match(html, /ui-shell\.js/);
  assert.match(html, /workspace\.css/);
  assert.doesNotMatch(html, /theme-signal\.css/);
  assert.match(html, /theme-atlas\.css/);
});

test("workspace navigation groups the long page into three task views", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /data-workspace-view="experiment"/);
  assert.match(html, /data-workspace-view="evidence"/);
  assert.match(html, /data-workspace-view="reflect"/);
  assert.match(html, /id="workspace-agent-toggle"/);
  assert.match(html, /id="workspace-prediction-toggle"/);
});

test("UI shell controller only reorganizes display and never runs experiments", () => {
  const source = fs.readFileSync(path.join(__dirname, "ui-shell.js"), "utf8");
  assert.doesNotMatch(source, /\/api\/(?:run|stop|agent)/);
  assert.doesNotMatch(source, /WebSocket|fetch\s*\(/);
  assert.match(source, /data-workspace-view/);
});

test("the teaching assistant starts closed and remains responsive to compact viewports", () => {
  const source = fs.readFileSync(path.join(__dirname, "ui-shell.js"), "utf8");
  assert.match(source, /matchMedia\("\(max-width: 1180px\)"\)/);
  assert.match(source, /let agentOpen = false/);
  assert.match(source, /buildWorkspace\(\);\s*setAgentOpen\(agentOpen\);/);
  assert.doesNotMatch(source, /activeVariant|applyVariant|data-ui-choice/);
});

test("workspace view controls remain keyboard reachable without binding the root element", () => {
  const source = fs.readFileSync(path.join(__dirname, "ui-shell.js"), "utf8");
  assert.doesNotMatch(source, /querySelectorAll\("\[data-workspace-view\]"\)/);
  assert.match(source, /\.workspace-view-switch button\[data-workspace-view\]/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
});

test("the command bar no longer reserves layout space for a theme selector", () => {
  const css = fs.readFileSync(path.join(__dirname, "workspace.css"), "utf8");
  assert.doesNotMatch(css, /workspace-theme-switch|grid-area:\s*theme|"theme mode agent"/);
});

test("Atlas is unconditional and overrides legacy dark surfaces with readable light treatments", () => {
  const css = fs.readFileSync(path.join(__dirname, "theme-atlas.css"), "utf8");
  assert.doesNotMatch(css, /data-ui/);
  assert.match(css, /^:root\s*\{/);
  assert.match(css, /\.framework-insight/);
  assert.match(css, /\.feedback-branch-question/);
  assert.match(css, /\.feedback-form textarea/);
  assert.match(css, /\.feedback-checks label/);
  assert.match(css, /\.presentation-toolbar/);
});
