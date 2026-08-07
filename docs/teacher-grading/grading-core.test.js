"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rubricData = require("./rubric-data.js");
const core = require("./grading-core.js");

test("每个实验量表总分为 100", function () {
    rubricData.labs.forEach(function (lab) {
        const total = lab.criteria.reduce(function (sum, item) { return sum + item.max; }, 0);
        assert.equal(total, 100, lab.id);
    });
});

test("评分会限制在分项满分内", function () {
    const lab = rubricData.labs[0];
    const result = core.calculate(lab, {
        boot: 999,
        console: -2,
        sbi: 25,
        run: 20,
        oral: 15
    }, {}, true);
    assert.equal(result.raw, 80);
});

test("构建失败时建议封顶 39", function () {
    const result = core.recommendedCap({ build: "fail", qemu: "fail" });
    assert.equal(result.cap, 39);
    assert.equal(result.reasons.length, 1);
});

test("关闭封顶开关时保留原始分", function () {
    const lab = rubricData.labs[1];
    const scores = Object.fromEntries(lab.criteria.map(function (criterion) { return [criterion.id, criterion.max]; }));
    const result = core.calculate(lab, scores, { build: "fail" }, false);
    assert.equal(result.raw, 100);
    assert.equal(result.finalScore, 100);
    assert.equal(result.cap, 39);
});

test("日志解析能识别 PASS、TODO 和前置标志", function () {
    const lab = rubricData.labs[3];
    const parsed = core.parseLog(lab, [
        "[Lab1] PASS",
        "[Lab2] PASS",
        "[Lab3] PASS",
        "[Lab4] TODO: implement Sv39 page table mapping",
        "[Lab4] PASS"
    ].join("\n"));
    assert.equal(parsed.passFound, true);
    assert.equal(parsed.todoFound, true);
    assert.deepEqual(parsed.missingPrevious, []);
});

test("日志解析不会把其他实验 PASS 当作当前实验 PASS", function () {
    const lab = rubricData.labs[6];
    const parsed = core.parseLog(lab, "[Lab6] PASS\n[Lab7] start");
    assert.equal(parsed.passFound, false);
});

test("Markdown 导出包含分项、检查和最终成绩", function () {
    const lab = rubricData.labs[0];
    const state = {
        student: "测试学生",
        scores: { boot: 20, console: 20, sbi: 25, run: 20, oral: 15 },
        evidence: {},
        checks: { build: "pass", qemu: "pass" },
        applyCap: true,
        notes: "完成良好"
    };
    const output = core.buildMarkdown(state, lab, rubricData.commonChecks);
    assert.match(output, /测试学生/);
    assert.match(output, /最终分：100\/100/);
    assert.match(output, /分项评分/);
});

test("导入拒绝未知协议和未知实验", function () {
    assert.throws(function () {
        core.validateRecord({ schema: "bad", labId: "lab1" }, rubricData);
    });
    assert.throws(function () {
        core.validateRecord({ schema: rubricData.schema, labId: "lab99" }, rubricData);
    });
});
