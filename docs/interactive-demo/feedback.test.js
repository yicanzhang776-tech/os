"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const feedback = require("./feedback.js");

function completeInput(context = {}, overrides = {}) {
  const questionSet = feedback.getQuestionSet(feedback.normalizeContext(context));
  return {
    type: "evaluation",
    role: "student",
    osExperience: "learning",
    beforeUnderstanding: 2,
    afterUnderstanding: 4,
    outcome: "somewhat_better",
    questionSetId: questionSet.id,
    branchAnswers: Object.fromEntries(questionSet.questions.map((question) => [question.id, 4])),
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
  assert.deepEqual(feedback.validateFeedback(completeInput({}, {
    beforeUnderstanding: 4,
    afterUnderstanding: 2,
    outcome: "more_confused"
  })), []);

  const errors = feedback.validateFeedback(completeInput({}, {
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
  const context = {
    branch: "lab5-starter",
    lab: "lab5",
    variant: "starter",
    commit: "1234abcd",
    runStatus: "QEMU 正在运行",
    console: "this raw log must not be copied",
    source: "kernel/src/main.rs"
  };
  const record = feedback.buildFeedbackRecord(completeInput(context, {
    suggestion: "日志位于 C:\\Users\\student\\secret，并误贴了 glpat-abcdefghijk。"
  }), context, {
    now: new Date("2026-08-04T01:02:03.000Z"),
    idSuffix: "TEST"
  });

  assert.equal(record.id, "FB-20260804T010203Z-TEST");
  assert.equal(record.context.branch, "lab5-starter");
  assert.equal(record.context.commit, "1234abcd");
  assert.equal(record.role, "student");
  assert.equal(record.branchQuestionSet.id, "lab5-starter");
  assert.equal(record.branchQuestionSet.answers.length, 5);
  assert.match(record.branchQuestionSet.answers[0].prompt, /TaskContext/);
  assert.equal("console" in record.context, false);
  assert.equal("source" in record.context, false);
  assert.match(record.suggestion, /\$HOME/);
  assert.match(record.suggestion, /\[已隐藏凭据\]/);
  assert.doesNotMatch(JSON.stringify(record), /abcdefghijk|raw log|main\.rs/);
});

test("Markdown and GitLab issue URL preserve an honest no-help evaluation", () => {
  const context = {
    branch: "lab2-solution",
    lab: "lab2",
    variant: "solution",
    commit: "abcdef12",
    runStatus: "已完成"
  };
  const record = feedback.buildFeedbackRecord(completeInput(context, {
    beforeUnderstanding: 3,
    afterUnderstanding: 3,
    outcome: "no_help",
    mostHelpful: "暂时没有发现明显帮助。"
  }), context, {
    now: new Date("2026-08-04T01:02:03.000Z"),
    idSuffix: "NOHELP"
  });

  const markdown = feedback.buildFeedbackMarkdown(record);
  assert.match(markdown, /对理解没有帮助/);
  assert.match(markdown, /lab2-solution/);
  assert.match(markdown, /Trap 与异常处理专项评价/);
  assert.match(markdown, /scause、sepc、stval/);
  assert.match(markdown, /评分：4\/5/);
  assert.match(markdown, /不会自动附带源代码、终端日志/);

  const issueUrl = new URL(feedback.buildIssueUrl(record));
  assert.equal(issueUrl.origin, "https://gitlab.eduxiji.net");
  assert.equal(issueUrl.pathname, "/T2026105749911072/project3136859-388774/-/issues/new");
  assert.match(issueUrl.searchParams.get("issue[title]"), /教学效果评价/);
  assert.equal(issueUrl.searchParams.get("issue[description]"), markdown);
});

test("feedback can be exported without attaching context", () => {
  const context = {
    branch: "lab7-starter",
    lab: "lab7",
    variant: "starter",
    commit: "deadbeef"
  };
  const record = feedback.buildFeedbackRecord(completeInput(context, { includeContext: false }), context, {
    now: new Date("2026-08-04T01:02:03.000Z"),
    idSuffix: "LOCAL"
  });
  assert.equal(record.context, null);
  assert.match(feedback.buildFeedbackMarkdown(record), /选择不附带实验上下文/);
  assert.equal(feedback.feedbackFilename(record, "json"), "FB-20260804T010203Z-LOCAL.json");
  assert.equal(JSON.parse(feedback.serializeFeedbackJson(record)).context, null);
});

test("drafts stay local and can be restored or cleared", () => {
  const values = new Map();
  const storage = {
    setItem: (key, value) => values.set(key, value),
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key)
  };
  assert.equal(feedback.saveFeedbackDraft(completeInput(), storage), true);
  assert.equal(feedback.loadFeedbackDraft(storage).input.role, "student");
  assert.equal(Object.keys(feedback.loadFeedbackDraft(storage).input.branchAnswers).length, 5);
  assert.equal(feedback.clearFeedbackDraft(storage), true);
  assert.equal(feedback.loadFeedbackDraft(storage), null);
});

test("P0 and every Lab provide exactly five content-specific questions", () => {
  const expected = {
    p0: /OpenSBI/,
    lab1: /SBI console/,
    lab2: /stvec/,
    lab3: /PhysAddr/,
    lab4: /Sv39/,
    lab5: /TaskContext/,
    lab6: /sstatus\.SPP/,
    lab7: /RamDevice/
  };
  for (const [lab, pattern] of Object.entries(expected)) {
    const set = feedback.getQuestionSet({ lab, variant: lab === "p0" ? "baseline" : "starter" });
    assert.equal(set.questions.length, 5, lab);
    assert.equal(new Set(set.questions.map((question) => question.id)).size, 5, lab);
    assert.match(set.questions.map((question) => question.prompt).join("\n"), pattern, lab);
  }
});

test("starter and solution branches receive different fifth questions", () => {
  for (let labNumber = 1; labNumber <= 7; labNumber += 1) {
    const lab = `lab${labNumber}`;
    const starter = feedback.getQuestionSet({ lab, variant: "starter" });
    const solution = feedback.getQuestionSet({ lab, variant: "solution" });
    assert.notEqual(starter.id, solution.id);
    assert.notEqual(starter.questions[4].id, solution.questions[4].id);
    assert.match(starter.questions[4].prompt, /Stage|TODO|任务|分阶段/);
    assert.match(solution.questions[4].prompt, /参考实现/);
  }
});

test("all five branch questions are required after a branch switch", () => {
  const context = { lab: "lab4", variant: "starter", branch: "lab4-starter" };
  const input = completeInput(context);
  delete input.branchAnswers[feedback.getQuestionSet(context).questions[2].id];
  assert.match(feedback.validateFeedback(input, context).join("\n"), /专项评价第 3 题/);
  assert.match(feedback.validateFeedback(completeInput(), context).join("\n"), /当前实验已切换/);
});
