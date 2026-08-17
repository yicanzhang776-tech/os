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
  assert.match(html, /agent-chat-state\.js/);
  assert.match(html, /agent-panel\.js/);
  assert.match(html, /id="agent-thread"/);
  assert.match(html, /data-agent-prompt=/);
  assert.match(html, /id="agent-character-count"/);
  assert.match(html, /id="agent-retry"/);
  assert.match(html, /id="agent-copy"/);
});

test("panel renders answers as text and presentation mode never auto-submits", () => {
  const source = fs.readFileSync(path.join(__dirname, "agent-panel.js"), "utf8");
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /setTimeout|setInterval|auto.*requestAgent|presentation.*requestAgent/is);
  assert.match(source, /submit.*addEventListener/s);
  assert.match(source, /clear.*addEventListener/s);
});

test("clear control only describes the current session", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, />清空会话</);
  assert.doesNotMatch(html, /删除持久化数据|清除历史记录/);
});

test("conversation controls remain manual and the data notice is collapsible", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /<details[^>]+class="agent-consent-disclosure"/);
  assert.match(html, /单次独立回答/);
  assert.doesNotMatch(html, /自动发送|后台提问/);
});

test("conversation log announces additions and stale requests cannot revive a cleared session", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "agent-panel.js"), "utf8");
  assert.match(html, /id="agent-thread"[^>]*role="log"[^>]*aria-relevant="additions"/);
  assert.match(source, /createRequestGate\(\)/);
  assert.match(source, /requestGate\.invalidate\(\)/);
  assert.match(source, /requestGate\.isCurrent\(requestToken\)/);
  assert.match(source, /if \(isNew\) thread\.append\(row\)/);
  assert.match(source, /content\.textContent !== item\.content/);
});

test("panel delegates keyboard submission to the IME-safe shared shortcut", () => {
  const source = fs.readFileSync(path.join(__dirname, "agent-panel.js"), "utf8");
  assert.match(source, /chat\.isAgentSubmitShortcut\(event\)/);
});
