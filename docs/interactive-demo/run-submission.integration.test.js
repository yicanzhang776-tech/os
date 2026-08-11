"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;

test("student page exposes explicit preview and consent controls", async () => {
  const html = await fs.promises.readFile(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="run-submission-select"/);
  assert.match(html, /id="run-submission-preview"[^>]*hidden/);
  assert.match(html, /我已查看以上内容，并同意将这一次脱敏运行记录发送给项目负责人，用于教学改进。/);
  assert.match(html, /id="run-submission-submit"[^>]*disabled/);
  assert.match(html, /默认不发送/);
  assert.ok(html.indexOf('src="run-submission.js"') < html.indexOf('src="app.js"'));
});

test("run submission is wired only to an explicit button click", async () => {
  const source = await fs.promises.readFile(path.join(root, "app.js"), "utf8");
  const calls = source.match(/\.submitRunRecord\(/g) || [];
  assert.equal(calls.length, 1);
  assert.match(source, /run_submission_submit\.addEventListener\("click", submitSelectedRunRecord\)/);
  assert.doesNotMatch(source, /setInterval\([^)]*submit|pagehide[^}]*submitRunRecord|beforeunload[^}]*submitRunRecord/s);
});

test("cancelled selection resets consent and sends nothing", async () => {
  const source = await fs.promises.readFile(path.join(root, "app.js"), "utf8");
  assert.match(source, /if \(!run \|\| !window\.OsRunSubmission\) \{[\s\S]*run_submission_preview\.hidden = true;[\s\S]*不会产生网络请求/);
  assert.match(source, /run_submission_consent\.checked = false/);
});
