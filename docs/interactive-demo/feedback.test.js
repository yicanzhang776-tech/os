"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const feedback = require("./feedback.js");

function completeInput(overrides = {}) {
  return {
    type: "evaluation",
    role: "student",
    osExperience: "learning",
    beforeUnderstanding: 2,
    afterUnderstanding: 4,
    outcome: "somewhat_better",
    helpfulAreas: ["theory", "connections"],
    mostHelpful: "知识地图让我看清了实验之间的联系。",
    stillConfusing: "Trap 的切换过程还不够熟悉。",
    suggestion: "希望增加一次失败示例。",
    includeContext: true,
    ...overrides
  };
}

test("feedback validation keeps both positive and negative teaching results", () => {
  assert.deepEqual(feedback.validateFeedback(completeInput()), []);
  assert.deepEqual(feedback.validateFeedback(completeInput({
    beforeUnderstanding: 4,
    afterUnderstanding: 2,
    outcome: "more_confused"
  })), []);

  const errors = feedback.validateFeedback(completeInput({
    role: "",
    afterUnderstanding: 8,
    mostHelpful: "",
    stillConfusing: "",
    suggestion: ""
  }));
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /使用者身份/);
  assert.match(errors.join("\n"), /使用后理解程度/);
  assert.match(errors.join("\n"), /一句话/);
});

test("record only includes a small, sanitized experiment context", () => {
  const record = feedback.buildFeedbackRecord(completeInput({
    suggestion: "日志位于 C:\\Users\\student\\secret，并误贴了 glpat-abcdefghijk。"
  }), {
    branch: "lab5-starter",
    lab: "lab5",
    variant: "starter",
    commit: "1234abcd",
    runStatus: "QEMU 正在运行",
    console: "this raw log must not be copied",
    source: "kernel/src/main.rs"
  }, {
    now: new Date("2026-08-04T01:02:03.000Z"),
    idSuffix: "TEST"
  });

  assert.equal(record.id, "FB-20260804T010203Z-TEST");
  assert.equal(record.context.branch, "lab5-starter");
  assert.equal(record.context.commit, "1234abcd");
  assert.equal(record.role, "student");
  assert.equal("console" in record.context, false);
  assert.equal("source" in record.context, false);
  assert.match(record.suggestion, /\$HOME/);
  assert.match(record.suggestion, /\[已隐藏凭据\]/);
  assert.doesNotMatch(JSON.stringify(record), /abcdefghijk|raw log|main\.rs/);
});

test("Markdown and GitHub issue URL preserve an honest no-help evaluation", () => {
  const record = feedback.buildFeedbackRecord(completeInput({
    beforeUnderstanding: 3,
    afterUnderstanding: 3,
    outcome: "no_help",
    mostHelpful: "暂时没有发现明显帮助。"
  }), {
    branch: "lab2-solution",
    lab: "lab2",
    variant: "solution",
    commit: "abcdef12",
    runStatus: "已完成"
  }, {
    now: new Date("2026-08-04T01:02:03.000Z"),
    idSuffix: "NOHELP"
  });

  const markdown = feedback.buildFeedbackMarkdown(record);
  assert.match(markdown, /对理解没有帮助/);
  assert.match(markdown, /lab2-solution/);
  assert.match(markdown, /不会自动附带源代码、终端日志/);

  const issueUrl = new URL(feedback.buildGithubIssueUrl(record));
  assert.equal(issueUrl.origin, "https://github.com");
  assert.equal(issueUrl.pathname, "/yicanzhang776-tech/os/issues/new");
  assert.match(issueUrl.searchParams.get("title"), /教学效果评价/);
  assert.equal(issueUrl.searchParams.get("body"), markdown);
});

test("feedback can be exported without attaching context", () => {
  const record = feedback.buildFeedbackRecord(completeInput({ includeContext: false }), {
    branch: "lab7-starter",
    commit: "deadbeef"
  }, {
    now: new Date("2026-08-04T01:02:03.000Z"),
    idSuffix: "LOCAL"
  });
  assert.equal(record.context, null);
  assert.match(feedback.buildFeedbackMarkdown(record), /选择不附带实验上下文/);
  assert.equal(feedback.feedbackFilename(record, "json"), "FB-20260804T010203Z-LOCAL.json");
  assert.equal(JSON.parse(feedback.serializeFeedbackJson(record)).context, null);
});
