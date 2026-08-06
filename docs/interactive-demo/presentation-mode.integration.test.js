"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const directory = __dirname;
const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
const css = fs.readFileSync(path.join(directory, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(directory, "app.js"), "utf8");
const server = fs.readFileSync(path.join(directory, "server.js"), "utf8");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = app.indexOf("\n  function ", start + 10);
  return app.slice(start, next < 0 ? app.length : next);
}

test("presentation controls, recommended Labs and local import entry are present", () => {
  assert.match(html, /id="presentation-mode-toggle"[^>]+aria-pressed="false"/);
  assert.match(html, /id="presentation-toolbar"[^>]+hidden/);
  for (const lab of ["lab1", "lab2", "lab4", "lab5"]) {
    assert.match(html, new RegExp(`data-presentation-lab="${lab}"`));
  }
  for (const id of ["presentation-import", "presentation-reset", "presentation-fullscreen", "presentation-exit"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="presentation-status"[^>]+aria-live="polite"/);
  assert.equal((html.match(/id="import-run-file"/g) || []).length, 1);
  assert.ok(html.indexOf('src="presentation-mode.js"') < html.indexOf('src="app.js"'));
  assert.match(server, /"presentation-mode\.js"/);
});

test("presentation layout is isolated and responsive", () => {
  assert.match(css, /\.presentation-toolbar\s*\{\s*display:\s*none;/);
  assert.match(css, /html\[data-mode="presentation"\] \.knowledge-section/);
  assert.match(css, /html\[data-mode="presentation"\] \.replay-timeline/);
  assert.match(css, /html\[data-mode="presentation"\] \.event-detail-explanation/);
  assert.match(css, /html\[data-mode="presentation"\] \.event-state-snapshot/);
  assert.match(css, /html\[data-mode="presentation"\] \.state-final-grid/);
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]+html\[data-mode="presentation"\] \.run-lab-grid/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+html\[data-mode="presentation"\] \.state-diff-grid/);
  assert.match(css, /html\[data-mode="presentation"\] \.button,[\s\S]+min-height:\s*44px/);
});

test("mode switching restores only local view state and never runs or switches a branch", () => {
  const restore = functionSource("restorePresentationView");
  const recommended = functionSource("openPresentationLab");
  const reset = functionSource("resetPresentationView");
  assert.match(app, /loadPresentationState\([\s\S]+window\.location\.search/);
  assert.match(restore, /state\.savedRuns\.find/);
  assert.match(restore, /loadRunIntoReplay\(run\)/);
  assert.match(restore, /replayTo\(/);
  assert.match(recommended, /selectRecommendedRuns\(state\.savedRuns, entry\.lab\)/);
  assert.match(recommended, /setStage\(targetIndex\)/);
  assert.doesNotMatch(recommended, /runCurrentBranch|fetch\(|WebSocket|git switch/i);
  assert.doesNotMatch(reset, /localStorage\.clear|removeItem|\/api\/stop|fetch\(|git switch/i);
});

test("QEMU controls and telemetry are guarded in presentation mode", () => {
  const run = functionSource("runCurrentBranch");
  const stop = functionSource("stopCurrentRun");
  const telemetry = functionSource("connectTelemetry");
  assert.match(run, /if \(presentationEnabled\(\)\)[\s\S]+return;/);
  assert.match(stop, /if \(presentationEnabled\(\)\)[\s\S]+return;/);
  assert.match(telemetry, /if \(presentationEnabled\(\)\)[\s\S]+return;/);
  assert.match(app, /if \(presentationEnabled\(\)\) return;\s+if \(message\.type === "history"\)/);
  assert.doesNotMatch(app, /git\s+(switch|checkout)/i);
});

test("browser local storage failures are contained by the page adapter", () => {
  const accessor = functionSource("browserLocalStorage");
  const save = functionSource("saveCompletedRun");
  assert.match(accessor, /try\s*\{[\s\S]+window\.localStorage[\s\S]+catch/);
  assert.doesNotMatch(app.replace(accessor, ""), /window\.localStorage/);
  assert.match(save, /try\s*\{[\s\S]+savedRuns\.some[\s\S]+catch/);
  assert.match(save, /保存失败/);
});

test("fullscreen is user-triggered and existing timeline keyboard controls remain available", () => {
  const fullscreen = functionSource("togglePresentationFullscreen");
  assert.match(fullscreen, /requestFullscreen\(\)/);
  assert.match(app, /presentation_fullscreen\?\.addEventListener\("click", togglePresentationFullscreen\)/);
  assert.doesNotMatch(functionSource("restorePresentationView"), /requestFullscreen\(\)/);
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"]) {
    assert.match(app, new RegExp(`event\\.key === "${key}"`));
  }
  assert.match(app, /event\.code === "Space"/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "f"/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "d"/);
});
