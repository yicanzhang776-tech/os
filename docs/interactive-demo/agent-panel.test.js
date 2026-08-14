"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("student page contains explicit consent, bounded input and manual controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /AI 教学助教/);
  assert.match(html, /火山方舟 Agent Plan/);
  assert.match(html, /id="agent-consent"/);
  assert.match(html, /id="agent-message"[^>]+maxlength="4000"/);
  assert.match(html, /id="agent-submit"/);
  assert.match(html, /id="agent-clear"/);
  assert.match(html, /agent-client\.js/);
  assert.match(html, /agent-panel\.js/);
});

test("panel renders answers as text and presentation mode never auto-submits", () => {
  const source = fs.readFileSync(path.join(__dirname, "agent-panel.js"), "utf8");
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /setTimeout|setInterval|auto.*requestAgent|presentation.*requestAgent/is);
  assert.match(source, /submit.*addEventListener/s);
  assert.match(source, /clear.*addEventListener/s);
});

test("clear control only describes the current display", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, />清空当前显示</);
  assert.doesNotMatch(html, /删除持久化数据|清除历史记录/);
});
