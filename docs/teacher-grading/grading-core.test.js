"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const rubricData = require("./rubric-data.js");
const core = require("./grading-core.js");
const { createRunRecord } = require("../interactive-demo/run-history.js");
const runTransfer = require("../interactive-demo/run-transfer.js");

function cryptoSequence() {
    let value = 0;
    return {
        randomUUID: function () {
            value += 1;
            return "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
        }
    };
}

function memoryStorage() {
    const values = new Map();
    return {
        getItem: function (key) { return values.has(key) ? values.get(key) : null; },
        setItem: function (key, value) { values.set(key, String(value)); },
        removeItem: function (key) { values.delete(key); }
    };
}

function labById(labId) {
    return rubricData.labs.find(function (lab) { return lab.id === labId; });
}

function blank(labId, crypto) {
    return core.createBlankRecord(labById(labId), rubricData, { crypto: crypto || cryptoSequence(), date: "2026-08-07" });
}

function demoRun(options) {
    const settings = Object.assign({
        lab: "lab2",
        role: "solution",
        buildResult: "success",
        runResult: "finished",
        pass: false,
        todo: false,
        fail: false,
        otherLabPass: null,
        id: "demo-run"
    }, options || {});
    const events = [];
    if (settings.otherLabPass) {
        events.push({ protocol: "os-demo.event/v1", lab: settings.otherLabPass, step: "pass", status: "pass", sequence: 1, timestamp: 1001 });
    }
    if (settings.todo) {
        events.push({ protocol: "os-demo.event/v1", lab: settings.lab, step: "task-todo", status: "todo", sequence: 2, timestamp: 1002 });
    }
    if (settings.fail) {
        events.push({ protocol: "os-demo.event/v1", lab: settings.lab, step: "runtime-failed", status: "fail", sequence: 3, timestamp: 1003 });
    }
    if (settings.pass) {
        events.push({ protocol: "os-demo.event/v1", lab: settings.lab, step: "pass", status: "pass", sequence: 4, timestamp: 1004 });
    }
    const record = createRunRecord({
        id: settings.id,
        context: {
            branch: settings.lab + "-" + settings.role,
            commit: "abc1234",
            lab: settings.lab,
            variant: settings.role,
            variantLabel: settings.role
        },
        events,
        stableOutput: settings.pass ? ["[" + settings.lab.replace("lab", "Lab") + "] PASS"] : [],
        lifecycle: {
            buildResult: settings.buildResult,
            runResult: settings.runResult,
            completed: settings.runResult === "finished"
        },
        startedAt: 1000,
        endedAt: 2000,
        exitCode: settings.runResult === "finished" ? 0 : 1,
        error: settings.fail ? "runtime failed" : ""
    });
    return runTransfer.parseRunJson(runTransfer.serializeRunJson(record, 3000));
}

test("七套量表与教师指南权重一致且总分均为 100", function () {
    const expected = {
        lab1: [25, 35, 25, 15],
        lab2: [30, 30, 30, 10],
        lab3: [30, 30, 30, 10],
        lab4: [25, 35, 30, 10],
        lab5: [25, 30, 35, 10],
        lab6: [25, 30, 35, 10],
        lab7: [30, 35, 25, 10]
    };
    rubricData.labs.forEach(function (lab) {
        assert.deepEqual(lab.criteria.map(function (item) { return item.max; }), expected[lab.id], lab.id);
        assert.equal(lab.criteria.reduce(function (sum, item) { return sum + item.max; }, 0), 100, lab.id);
    });
});

test("同一 Lab 的两位学生使用不同 recordId 并独立进入索引", function () {
    const local = memoryStorage();
    const crypto = cryptoSequence();
    const first = blank("lab1", crypto);
    first.student = "学生甲";
    const second = blank("lab1", crypto);
    second.student = "学生乙";
    core.saveRecord(local, first, rubricData, { crypto, now: "2026-08-07T01:00:00.000Z" });
    core.saveRecord(local, second, rubricData, { crypto, now: "2026-08-07T02:00:00.000Z" });
    const index = core.loadRecordIndex(local, rubricData);
    assert.notEqual(first.recordId, second.recordId);
    assert.equal(index.length, 2);
    assert.deepEqual(new Set(index.map(function (item) { return item.student; })), new Set(["学生甲", "学生乙"]));
});

test("缺少 randomUUID 时使用 Web Crypto getRandomValues 生成 UUID", function () {
    let seed = 0;
    const recordId = core.createRecordId({
        getRandomValues: function (bytes) {
            bytes.forEach(function (_value, index) { bytes[index] = (seed + index) & 0xff; });
            seed += 1;
            return bytes;
        }
    });
    assert.match(recordId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("旧版按 labId 保存的草稿可以一次迁移且保留元数据和总分", function () {
    const local = memoryStorage();
    const crypto = cryptoSequence();
    local.setItem(core.STORAGE_PREFIX + "lab1", JSON.stringify({
        schema: rubricData.schema,
        labId: "lab1",
        student: "旧版学生",
        submission: "legacy-commit",
        teacher: "旧版教师",
        scores: { boot: 20, console: 20, sbi: 25, run: 20, oral: 15 },
        evidence: { sbi: "旧版 SBI 证据" },
        checks: { build: "pass", qemu: "pass" },
        notes: "旧版总评",
        oralNotes: "旧版口试",
        updatedAt: "2026-08-01T00:00:00.000Z"
    }));
    const result = core.migrateLegacyDrafts(local, rubricData, { crypto, now: "2026-08-07T00:00:00.000Z" });
    const record = core.loadRecord(local, result.migrated[0], rubricData, { crypto });
    assert.equal(result.migrated.length, 1);
    assert.equal(record.student, "旧版学生");
    assert.equal(core.calculate(labById("lab1"), record.scores, record.checks, true).raw, 100);
    assert.match(record.notes, /旧版量表迁移/);
    assert.match(record.notes, /旧版 SBI 证据/);
    assert.equal(core.migrateLegacyDrafts(local, rubricData, { crypto }).alreadyDone, true);
});

test("损坏的 scores、checks、evidence 会恢复默认值而不会崩溃", function () {
    [null, [], "bad"].forEach(function (badValue) {
        const record = blank("lab2");
        record.scores = badValue;
        record.checks = badValue;
        record.evidence = badValue;
        const normalized = core.validateRecord(record, rubricData);
        assert.deepEqual(Object.values(normalized.scores), [0, 0, 0, 0]);
        assert.ok(Object.values(normalized.checks).every(function (status) { return status === "not-run"; }));
        assert.ok(Object.values(normalized.evidence).every(function (value) { return value === ""; }));
    });
});

test("超出范围的分数会限制到对应项目的 0 到满分", function () {
    const record = blank("lab4");
    record.scores = { stage1: 999, stage2: -5, stage3: Infinity, explanation: 7 };
    const normalized = core.validateRecord(record, rubricData);
    assert.deepEqual(normalized.scores, { stage1: 25, stage2: 0, stage3: 0, explanation: 7 });
});

test("未知检查项被忽略，未知检查状态恢复为 not-run", function () {
    const record = blank("lab3");
    record.checks = { build: "maybe", qemu: "pass", invented: "pass" };
    const normalized = core.validateRecord(record, rubricData);
    assert.equal(normalized.checks.build, "not-run");
    assert.equal(normalized.checks.qemu, "pass");
    assert.equal(Object.hasOwn(normalized.checks, "invented"), false);
});

test("构建成功但没有 QEMU 证据时 build=pass、qemu=not-run", function () {
    const summary = core.summarizeRunEvidence(demoRun({ buildResult: "success", runResult: null }), labById("lab2"));
    assert.equal(summary.objectiveChecks.build, "pass");
    assert.equal(summary.objectiveChecks.qemu, "not-run");
});

test("构建失败时 build=fail、qemu=not-run", function () {
    const summary = core.summarizeRunEvidence(demoRun({ buildResult: "failure", runResult: "failure" }), labById("lab2"));
    assert.equal(summary.objectiveChecks.build, "fail");
    assert.equal(summary.objectiveChecks.qemu, "not-run");
    assert.doesNotMatch(summary.conclusion, /QEMU 未通过/);
    const record = blank("lab2");
    record.checks.qemu = "pass";
    const updated = core.applyRunEvidence(record, summary);
    assert.equal(updated.checks.build, "fail");
    assert.equal(updated.checks.qemu, "not-run");
});

test("构建失败且没有串口输出时不报告前置 PASS 回归", function () {
    const summary = core.summarizeRunEvidence(demoRun({ lab: "lab7", buildResult: "failure", runResult: "failure" }), labById("lab7"));
    assert.deepEqual(summary.missingPrevious, []);
    assert.doesNotMatch(summary.conclusion, /缺少.*前置 PASS/);
});

test("构建成功且 QEMU 完成但没有当前 Lab PASS 时 qemu=fail", function () {
    const summary = core.summarizeRunEvidence(demoRun({ buildResult: "success", runResult: "finished" }), labById("lab2"));
    assert.equal(summary.objectiveChecks.build, "pass");
    assert.equal(summary.objectiveChecks.qemu, "fail");
});

test("构建成功且当前 Lab PASS 时 qemu=pass", function () {
    const summary = core.summarizeRunEvidence(demoRun({ pass: true }), labById("lab2"));
    assert.equal(summary.passFound, true);
    assert.equal(summary.objectiveChecks.qemu, "pass");
});

test("构建成功但 TODO、fail、timeout 时 qemu=fail", function () {
    const runs = [
        demoRun({ todo: true }),
        demoRun({ runResult: "timeout" }),
        demoRun({ runResult: "failure", fail: true })
    ];
    runs.forEach(function (run) {
        const summary = core.summarizeRunEvidence(run, labById("lab2"));
        assert.equal(summary.objectiveChecks.qemu, "fail");
    });
});

test("其他 Lab 的 PASS 不能代替当前 Lab PASS", function () {
    const run = demoRun({ lab: "lab7", otherLabPass: "lab6", pass: false });
    const summary = core.summarizeRunEvidence(run, labById("lab7"));
    assert.equal(summary.passFound, false);
    assert.equal(summary.objectiveChecks.qemu, "fail");
});

test("应用运行证据不会改变 scores、主观 evidence、教师评语和口试记录", function () {
    const record = blank("lab2");
    record.scores = { stage1: 7, stage2: 8, stage3: 9, explanation: 3 };
    record.evidence.stage1 = "教师主观证据";
    record.notes = "教师总评";
    record.oralNotes = "口试记录";
    const beforeScores = structuredClone(record.scores);
    const beforeEvidence = structuredClone(record.evidence);
    const summary = core.summarizeRunEvidence(demoRun({ pass: true }), labById("lab2"));
    const updated = core.applyRunEvidence(record, summary);
    assert.deepEqual(updated.scores, beforeScores);
    assert.deepEqual(updated.evidence, beforeEvidence);
    assert.equal(updated.notes, "教师总评");
    assert.equal(updated.oralNotes, "口试记录");
    assert.equal(updated.checks.build, "pass");
    assert.equal(updated.checks.qemu, "pass");
});

test("Markdown 和 JSON 导出包含关联运行证据但不包含完整日志", function () {
    const record = blank("lab2");
    const summary = core.summarizeRunEvidence(demoRun({ pass: true, id: "linked-run" }), labById("lab2"), "2026-08-07T00:00:00.000Z");
    const linked = core.applyRunEvidence(record, summary);
    const markdown = core.buildMarkdown(linked, labById("lab2"), rubricData.commonChecks);
    const json = core.serializeRecordJson(linked, rubricData);
    [markdown, json].forEach(function (output) {
        assert.match(output, /linked-run/);
        assert.match(output, /lab2-solution/);
        assert.match(output, /abc1234/);
    });
    assert.doesNotMatch(json, /stableOutput|events|完整终端日志/);
});

test("不合法协议、未知 Lab 和非普通对象会被中文错误拒绝", function () {
    assert.throws(function () {
        core.validateRecord({ schema: "bad", labId: "lab1" }, rubricData);
    }, /协议不兼容/);
    assert.throws(function () {
        core.validateRecord({ schema: rubricData.schema, labId: "lab99" }, rubricData);
    }, /未知实验/);
    assert.throws(function () {
        core.validateRecord([], rubricData);
    }, /普通对象/);
});

test("字符串字段类型和导入文件大小受到限制", function () {
    const record = blank("lab1");
    record.student = 123;
    assert.throws(function () { core.validateRecord(record, rubricData); }, /student.*字符串/);
    assert.throws(function () {
        core.parseRecordJson(" ".repeat(core.MAX_IMPORT_BYTES + 1), rubricData);
    }, /256 KiB/);
});

test("日志解析不会把其他实验 PASS 当作当前实验 PASS", function () {
    const parsed = core.parseLog(labById("lab7"), "[Lab6] PASS\n[Lab7] start");
    assert.equal(parsed.passFound, false);
});

test("构建失败时建议封顶 39，关闭封顶时保留原始分", function () {
    const lab = labById("lab5");
    const scores = Object.fromEntries(lab.criteria.map(function (criterion) { return [criterion.id, criterion.max]; }));
    assert.equal(core.recommendedCap({ build: "fail", qemu: "fail" }).cap, 39);
    const result = core.calculate(lab, scores, { build: "fail" }, false);
    assert.equal(result.raw, 100);
    assert.equal(result.finalScore, 100);
});

test("离线页面包含多记录与双协议导入入口，脚本均使用本地相对路径", function () {
    const html = fs.readFileSync(__dirname + "/index.html", "utf8");
    ["recordSelect", "saveAsButton", "deleteRecordButton", "importInput", "runImportInput", "runEvidencePanel"]
        .forEach(function (id) { assert.match(html, new RegExp("id=\\\"" + id + "\\\"")); });
    assert.match(html, /\.\.\/interactive-demo\/run-history\.js/);
    assert.match(html, /\.\.\/interactive-demo\/run-transfer\.js/);
    assert.doesNotMatch(html, /<script[^>]+https?:\/\//i);
});

test("评分页面实现不包含网络请求、动态执行或 shell 启动 API", function () {
    const source = ["app.js", "grading-core.js"].map(function (file) {
        return fs.readFileSync(__dirname + "/" + file, "utf8");
    }).join("\n");
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/);
    assert.doesNotMatch(source, /\b(?:child_process|execFile|spawnSync|spawn)\b/);
});
