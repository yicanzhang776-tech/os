"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "agent.html"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "agent-page.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "agent-page.css"), "utf8");

test("standalone tutor page exposes the Focus Console contract", () => {
  assert.match(html, /id="agent-page-thread"[^>]*role="log"/);
  assert.match(html, /id="agent-page-message"[^>]+maxlength="4000"/);
  assert.match(html, /id="agent-page-submit"/);
  assert.match(html, /id="agent-page-clear"/);
  assert.match(html, /单次独立回答/);
  assert.match(html, /id="agent-config-form"/);
  assert.match(html, /id="agent-api-key"[^>]+type="password"[^>]+autocomplete="off"/);
  assert.match(html, /仅保存在当前 Node 服务进程内/);
  assert.ok(html.indexOf("agent-entry-state.js") < html.indexOf("agent-page.js"));
});

test("the page activates and clears only process-memory credentials", () => {
  assert.match(source, /getAgentConfig\(\)/);
  assert.match(source, /configureAgentKey\(apiKey\.value\)/);
  assert.match(source, /clearAgentKey\(\)/);
  assert.match(source, /apiKey\.value\s*=\s*""/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*(?:apiKey|api-key|ARK)/i);
  assert.doesNotMatch(html, /value="ark-/i);
});

test("the standalone page sends only one current message", () => {
  assert.match(source, /requestAgent\(prompt\)/);
  assert.doesNotMatch(source, /requestAgent\([^)]*transcript/);
  assert.match(source, /consumePendingPrompt/);
});

test("answers remain text and stale requests cannot revive a cleared page", () => {
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.match(source, /createRequestGate\(\)/);
  assert.match(source, /requestGate\.invalidate\(\)/);
  assert.match(source, /requestGate\.isCurrent\(requestToken\)/);
});

test("the standalone lifecycle persists transcript and requires consent", () => {
  assert.match(source, /loadTranscript\(sessionStore\(\)\)/);
  assert.match(source, /saveTranscript\(sessionStore\(\), transcript\)/);
  assert.match(source, /hasAgentConsent\(sessionStore\(\)\)/);
  assert.match(source, /saveAgentConsent\(sessionStore\(\)\)/);
  assert.match(source, /setAttribute\("data-agent-state"/);
});

test("retry, copy, and clear use the shared lifecycle helpers", () => {
  assert.match(source, /function retryLatest\(\)/);
  assert.match(source, /lastRetryablePrompt\(transcript\)/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /function clearConversation\(\)/);
  assert.match(source, /clearTranscript\(sessionStore\(\)\)/);
  assert.match(source, /thread\.replaceChildren\(\)/);
});

test("the desktop Focus Console keeps the approved dimensions and tokens", () => {
  for (const [name, value] of Object.entries({
    "agent-ink": "#101b25",
    "agent-paper": "#f7f9fb",
    "agent-surface": "#ffffff",
    "agent-action": "#2457d6",
    "agent-tutor": "#15836e",
    "agent-warning": "#b87318"
  })) {
    assert.match(styles, new RegExp(`--${name}:\\s*${value}`, "i"));
  }
  assert.match(styles, /@media\s*\(min-width:\s*1180px\)[\s\S]*grid-template-columns:\s*248px\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /max-width:\s*920px/);
  assert.match(styles, /\.agent-page-composer\s*\{[\s\S]*position:\s*sticky/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("the consent action keeps its warning emphasis inside the composer", () => {
  assert.match(styles, /\.agent-page-composer\s+\.agent-page-consent-action\s*\{[\s\S]*background:\s*#9c6117/);
});
