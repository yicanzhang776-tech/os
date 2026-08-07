(function () {
    "use strict";

    const rubricData = window.OS_TEACHER_RUBRICS;
    const core = window.OS_TEACHER_GRADING_CORE;
    const runTransfer = window.OsRunTransfer;
    const lastLabKey = core.STORAGE_PREFIX + "last-lab";
    const lastRecordKey = core.STORAGE_PREFIX + "last-record";

    const elements = {
        labSelect: document.getElementById("labSelect"),
        student: document.getElementById("studentInput"),
        submission: document.getElementById("submissionInput"),
        teacher: document.getElementById("teacherInput"),
        date: document.getElementById("dateInput"),
        estimatedHours: document.getElementById("estimatedHours"),
        objectives: document.getElementById("objectives"),
        recordSelect: document.getElementById("recordSelect"),
        currentRecordId: document.getElementById("currentRecordId"),
        recordStatus: document.getElementById("recordStatus"),
        checksBody: document.getElementById("checksBody"),
        applyCap: document.getElementById("applyCapInput"),
        capNotice: document.getElementById("capNotice"),
        logInput: document.getElementById("logInput"),
        logResult: document.getElementById("logResult"),
        runEvidencePanel: document.getElementById("runEvidencePanel"),
        runEvidenceDetails: document.getElementById("runEvidenceDetails"),
        rubricRows: document.getElementById("rubricRows"),
        codeChecks: document.getElementById("codeChecks"),
        commonErrors: document.getElementById("commonErrors"),
        oralQuestions: document.getElementById("oralQuestions"),
        oralNotes: document.getElementById("oralNotesInput"),
        notes: document.getElementById("notesInput"),
        rawScore: document.getElementById("rawScore"),
        finalScore: document.getElementById("finalScore"),
        scoreBand: document.getElementById("scoreBand"),
        saveStatus: document.getElementById("saveStatus")
    };

    let state;

    function today() {
        const date = new Date();
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    }

    function blankState(lab) {
        return core.createBlankRecord(lab, rubricData, { crypto: window.crypto, date: today() });
    }

    function currentLab() {
        return rubricData.labs.find(function (lab) { return lab.id === state.labId; }) || rubricData.labs[0];
    }

    function syncFieldsToState() {
        state.student = elements.student.value.trim();
        state.submission = elements.submission.value.trim();
        state.teacher = elements.teacher.value.trim();
        state.date = elements.date.value;
        state.applyCap = elements.applyCap.checked;
        state.notes = elements.notes.value.trim();
        state.oralNotes = elements.oralNotes.value.trim();
    }

    function populateLabSelect() {
        rubricData.labs.forEach(function (lab) {
            const option = document.createElement("option");
            option.value = lab.id;
            option.textContent = lab.name;
            elements.labSelect.appendChild(option);
        });
    }

    function render() {
        const lab = currentLab();
        elements.labSelect.value = lab.id;
        elements.student.value = state.student;
        elements.submission.value = state.submission;
        elements.teacher.value = state.teacher;
        elements.date.value = state.date || today();
        elements.applyCap.checked = state.applyCap !== false;
        elements.notes.value = state.notes;
        elements.oralNotes.value = state.oralNotes;
        elements.logInput.value = "";
        elements.logResult.replaceChildren();
        elements.estimatedHours.textContent = "建议时长：" + lab.estimatedHours;
        elements.currentRecordId.textContent = "当前 recordId：" + state.recordId;

        elements.objectives.replaceChildren();
        lab.objectives.forEach(function (objective) {
            const item = document.createElement("span");
            item.textContent = objective;
            elements.objectives.appendChild(item);
        });

        renderRecordList();
        renderChecks();
        renderRunEvidence();
        renderRubric();
        renderManualReview();
        updateScore();
    }

    function renderRecordList(selectedId) {
        const records = core.loadRecordIndex(localStorage, rubricData);
        elements.recordSelect.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = records.length ? "请选择本机评分记录" : "暂无本机评分记录";
        elements.recordSelect.appendChild(empty);
        records.forEach(function (record) {
            const option = document.createElement("option");
            option.value = record.recordId;
            option.textContent = record.labId.toUpperCase() + " · " + (record.student || "未命名学生") +
                " · " + record.finalScore + " 分 · " + (record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "时间未知");
            elements.recordSelect.appendChild(option);
        });
        const preferred = selectedId || state.recordId;
        if (records.some(function (record) { return record.recordId === preferred; })) elements.recordSelect.value = preferred;
    }

    function renderChecks() {
        elements.checksBody.replaceChildren();
        rubricData.commonChecks.forEach(function (check) {
            const row = document.createElement("tr");
            const labelCell = document.createElement("td");
            labelCell.textContent = check.label.replace("labN", currentLab().id);
            const typeCell = document.createElement("td");
            const type = document.createElement("span");
            type.className = "evidence-type";
            type.textContent = check.kind === "automatic" ? "客观/自动证据" : "人工证据";
            typeCell.appendChild(type);
            const resultCell = document.createElement("td");
            const select = document.createElement("select");
            select.dataset.checkId = check.id;
            [["not-run", "未执行"], ["pass", "通过"], ["fail", "失败"]].forEach(function (entry) {
                const option = document.createElement("option");
                option.value = entry[0];
                option.textContent = entry[1];
                select.appendChild(option);
            });
            select.value = state.checks[check.id] || "not-run";
            select.addEventListener("change", function () {
                state.checks[check.id] = select.value;
                updateScore();
            });
            resultCell.appendChild(select);
            row.append(labelCell, typeCell, resultCell);
            elements.checksBody.appendChild(row);
        });
    }

    function appendEvidenceDetail(label, value) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value || "未提供";
        elements.runEvidenceDetails.append(term, detail);
    }

    function renderRunEvidence() {
        const evidence = core.normalizeLinkedRunEvidence(state.linkedRunEvidence);
        elements.runEvidenceDetails.replaceChildren();
        elements.runEvidencePanel.hidden = !evidence;
        if (!evidence) return;
        appendEvidenceDetail("Lab / 角色", evidence.lab + " / " + evidence.role);
        appendEvidenceDetail("branch", evidence.branch);
        appendEvidenceDetail("commit", evidence.commit);
        appendEvidenceDetail("runId", evidence.runId);
        appendEvidenceDetail("构建结果", evidence.buildResult);
        appendEvidenceDetail("QEMU 结果", evidence.qemuCheck === "pass" ? "通过" : evidence.qemuCheck === "fail" ? "未通过" : "无结论");
        appendEvidenceDetail("当前 Lab PASS", evidence.passFound ? "已出现" : "未出现");
        appendEvidenceDetail("TODO", evidence.todoFound ? "已出现" : "未出现");
        appendEvidenceDetail("缺少前置 PASS", evidence.missingPrevious.length ? evidence.missingPrevious.join("、") : "无");
        appendEvidenceDetail("失败 / 超时", (evidence.failureFound ? "有失败证据" : "无失败证据") + "；" +
            (evidence.timeoutFound ? "有超时证据" : "无超时证据"));
        appendEvidenceDetail("结论摘要", evidence.conclusion);
    }

    function renderRubric() {
        elements.rubricRows.replaceChildren();
        currentLab().criteria.forEach(function (criterion) {
            const row = document.createElement("article");
            row.className = "rubric-row";

            const title = document.createElement("div");
            title.className = "rubric-title";
            const strong = document.createElement("strong");
            strong.textContent = criterion.title;
            const max = document.createElement("span");
            max.textContent = "满分 " + criterion.max + " 分";
            title.append(strong, max);

            const evidenceLabel = document.createElement("label");
            evidenceLabel.textContent = "验收证据与评语";
            const evidence = document.createElement("textarea");
            evidence.rows = 3;
            evidence.maxLength = core.STRING_LIMITS.evidence;
            evidence.value = state.evidence[criterion.id] || "";
            evidence.placeholder = criterion.evidence;
            evidence.addEventListener("input", function () { state.evidence[criterion.id] = evidence.value; });
            evidenceLabel.appendChild(evidence);

            const scoreLabel = document.createElement("label");
            scoreLabel.className = "rubric-score";
            scoreLabel.textContent = "得分";
            const score = document.createElement("input");
            score.type = "number";
            score.min = "0";
            score.max = String(criterion.max);
            score.step = "1";
            score.value = String(state.scores[criterion.id] || 0);
            score.addEventListener("input", function () {
                state.scores[criterion.id] = core.clamp(score.value, 0, criterion.max);
                score.value = String(state.scores[criterion.id]);
                updateScore();
            });
            scoreLabel.appendChild(score);

            row.append(title, evidenceLabel, scoreLabel);
            elements.rubricRows.appendChild(row);
        });
    }

    function renderManualReview() {
        const lab = currentLab();
        elements.codeChecks.replaceChildren();
        lab.codeChecks.forEach(function (path) {
            const item = document.createElement("li");
            const code = document.createElement("code");
            code.textContent = path;
            item.appendChild(code);
            elements.codeChecks.appendChild(item);
        });

        elements.commonErrors.replaceChildren();
        lab.commonErrors.forEach(function (error) {
            const item = document.createElement("article");
            item.className = "error-item";
            const title = document.createElement("strong");
            title.textContent = error.symptom;
            const cause = document.createElement("p");
            cause.textContent = "可能原因：" + error.cause;
            const deduction = document.createElement("p");
            deduction.textContent = "评分建议：" + error.deduction;
            item.append(title, cause, deduction);
            elements.commonErrors.appendChild(item);
        });

        elements.oralQuestions.replaceChildren();
        lab.oralQuestions.forEach(function (question, index) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = (index + 1) + ". " + question.q;
            const list = document.createElement("ul");
            question.points.forEach(function (point) {
                const item = document.createElement("li");
                item.textContent = point;
                list.appendChild(item);
            });
            details.append(summary, list);
            elements.oralQuestions.appendChild(details);
        });
    }

    function updateScore() {
        syncFieldsToState();
        const result = core.calculate(currentLab(), state.scores, state.checks, state.applyCap);
        elements.rawScore.textContent = result.raw;
        elements.finalScore.textContent = result.finalScore;
        elements.scoreBand.textContent = result.band;
        if (result.capReasons.length) {
            elements.capNotice.hidden = false;
            elements.capNotice.textContent = "建议封顶 " + result.cap + " 分：" + result.capReasons.join(" ");
        } else {
            elements.capNotice.hidden = true;
            elements.capNotice.textContent = "";
        }
    }

    function addChip(text, kind) {
        const chip = document.createElement("span");
        chip.className = "status-chip" + (kind ? " " + kind : "");
        chip.textContent = text;
        elements.logResult.appendChild(chip);
    }

    function parseLog() {
        const result = core.parseLog(currentLab(), elements.logInput.value);
        elements.logResult.replaceChildren();
        addChip(currentLab().passMarker + (result.passFound ? " 已找到" : " 未找到"), result.passFound ? "ok" : "bad");
        if (result.todoFound) addChip("检测到 TODO", "bad");
        if (result.foundPrevious.length) addChip("前置 PASS " + result.foundPrevious.length + " 项", "ok");
        if (result.missingPrevious.length) addChip("缺少前置标志 " + result.missingPrevious.length + " 项", "bad");
        if (result.buildError) addChip("检测到构建错误", "bad");
        if (result.timeout) addChip("检测到超时", "bad");
        if (result.qemuMissing) addChip("未找到 QEMU", "bad");
        addChip(result.lineCount + " 行日志（不会保存完整日志）", "");
    }

    function saveCurrentRecord(message) {
        syncFieldsToState();
        state = core.saveRecord(localStorage, state, rubricData, { crypto: window.crypto });
        localStorage.setItem(lastLabKey, state.labId);
        localStorage.setItem(lastRecordKey, state.recordId);
        renderRecordList(state.recordId);
        elements.currentRecordId.textContent = "当前 recordId：" + state.recordId;
        elements.recordStatus.textContent = (message || "当前记录已保存") + "：" + new Date(state.updatedAt).toLocaleString();
        return state;
    }

    function newRecord() {
        state = blankState(currentLab());
        render();
        elements.recordStatus.textContent = "已新建空白记录；保存后才会写入本机记录索引。";
    }

    function loadSelectedRecord() {
        const recordId = elements.recordSelect.value;
        state = core.loadRecord(localStorage, recordId, rubricData, { crypto: window.crypto });
        localStorage.setItem(lastLabKey, state.labId);
        localStorage.setItem(lastRecordKey, state.recordId);
        render();
        elements.recordStatus.textContent = "已加载本机评分记录。";
    }

    function saveAsNewRecord() {
        syncFieldsToState();
        state.recordId = core.createUniqueRecordId(localStorage, window.crypto);
        state.updatedAt = "";
        saveCurrentRecord("已另存为新记录");
    }

    function deleteSelectedRecord() {
        const recordId = elements.recordSelect.value;
        if (!recordId) throw new Error("请先选择要删除的本机评分记录。");
        const item = core.loadRecordIndex(localStorage, rubricData).find(function (record) { return record.recordId === recordId; });
        const label = item ? item.labId.toUpperCase() + " / " + (item.student || "未命名学生") : recordId;
        if (!window.confirm("确定删除本机评分记录 “" + label + "” 吗？删除后无法从本页面恢复。")) return;
        core.deleteRecord(localStorage, recordId, rubricData);
        if (state.recordId === recordId) state = blankState(currentLab());
        localStorage.removeItem(lastRecordKey);
        render();
        elements.recordStatus.textContent = "所选本机评分记录已删除。";
    }

    function download(filename, text, type) {
        const blob = new Blob([text], { type: type + ";charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }

    function exportJson() {
        syncFieldsToState();
        const record = Object.assign({}, state, { updatedAt: new Date().toISOString() });
        download(state.labId + "-grading-" + state.recordId + ".json", core.serializeRecordJson(record, rubricData, { crypto: window.crypto }), "application/json");
        elements.saveStatus.textContent = "已导出本地评分 JSON；已清理常见令牌和本机路径，但未自动匿名化姓名与评语，共享前请人工脱敏。";
    }

    function exportMarkdown() {
        syncFieldsToState();
        download(state.labId + "-grading-" + state.recordId + ".md", core.buildMarkdown(state, currentLab(), rubricData.commonChecks), "text/markdown");
        elements.saveStatus.textContent = "已导出本地评分 Markdown；已清理常见令牌和本机路径，但未自动匿名化姓名与评语，共享前请人工脱敏。";
    }

    async function readJsonFile(file, maxBytes, label) {
        if (!file) return null;
        if (file.size > maxBytes) throw new Error(label + "超过 " + Math.floor(maxBytes / 1024) + " KiB 限制。");
        return file.text();
    }

    function previewJson(source) {
        let value;
        try {
            value = JSON.parse(source);
        } catch (_error) {
            throw new Error("导入文件不是有效 JSON。");
        }
        if (!core.isPlainObject(value)) throw new Error("导入 JSON 顶层必须是普通对象。");
        return value;
    }

    async function importGradingRecord(file) {
        const source = await readJsonFile(file, core.MAX_IMPORT_BYTES, "评分记录");
        if (source == null) return;
        const preview = previewJson(source);
        if (preview.schemaVersion === "os-demo.run/v1") {
            throw new Error("这是 os-demo.run/v1 运行记录，请使用“导入 Demo 运行证据”。");
        }
        state = core.parseRecordJson(source, rubricData, { crypto: window.crypto });
        render();
        elements.saveStatus.textContent = "已导入 os-teacher-grading/v1 评分记录；尚未保存到本机索引，可选择保存或另存为。";
    }

    async function importRunRecord(file) {
        if (!runTransfer || typeof runTransfer.parseRunJson !== "function") {
            throw new Error("Demo 运行记录校验模块未加载，请确认以完整目录直接打开本页面。");
        }
        const source = await readJsonFile(file, runTransfer.MAX_IMPORT_BYTES, "运行记录");
        if (source == null) return;
        const preview = previewJson(source);
        if (preview.schema === rubricData.schema) {
            throw new Error("这是 os-teacher-grading/v1 评分记录，请使用“导入评分记录”。");
        }
        if (preview.schemaVersion !== runTransfer.RUN_SCHEMA_VERSION) {
            throw new Error("运行记录协议不兼容；当前仅支持 os-demo.run/v1。");
        }
        const run = runTransfer.parseRunJson(source);
        const lab = rubricData.labs.find(function (entry) { return entry.id === run.context.lab; });
        if (!lab) throw new Error("评分工具不支持运行记录中的实验：" + run.context.lab + "。");
        if (state.labId !== lab.id) {
            if (!window.confirm("运行记录属于 " + lab.id.toUpperCase() + "。是否新建该 Lab 的空白评分记录并关联证据？")) return;
            state = blankState(lab);
        }
        const summary = core.summarizeRunEvidence(run, lab);
        const overwritten = ["build", "qemu"].filter(function (checkId) {
            const proposed = summary.objectiveChecks[checkId];
            return core.CHECK_STATUSES.has(proposed) &&
                state.checks[checkId] !== "not-run" && state.checks[checkId] !== proposed;
        });
        if (overwritten.length && !window.confirm(
            "导入将覆盖教师已填写的客观状态：" + overwritten.join("、") + "。是否继续？主观分数和主观评语不会改变。"
        )) return;
        state = core.applyRunEvidence(state, summary);
        render();
        elements.saveStatus.textContent = "已关联 os-demo.run/v1：仅更新有结论的 build/qemu 客观状态，未修改任何分项分数。";
    }

    function resetCurrent() {
        if (!window.confirm("确定重置当前表单吗？已保存的本机记录不会被删除，未保存修改会丢失。")) return;
        state = blankState(currentLab());
        render();
        elements.saveStatus.textContent = "当前表单已重置；本机已保存记录仍可从记录列表加载。";
    }

    function reportError(error, target) {
        target.textContent = "操作失败：" + (error && error.message ? error.message : "未知错误。");
    }

    populateLabSelect();
    const migration = core.migrateLegacyDrafts(localStorage, rubricData, { crypto: window.crypto });
    const savedLabId = localStorage.getItem(lastLabKey);
    const initialLab = rubricData.labs.find(function (lab) { return lab.id === savedLabId; }) || rubricData.labs[0];
    const savedRecordId = localStorage.getItem(lastRecordKey);
    try {
        state = savedRecordId ? core.loadRecord(localStorage, savedRecordId, rubricData, { crypto: window.crypto }) : blankState(initialLab);
    } catch (_error) {
        state = blankState(initialLab);
    }
    render();
    if (migration.migrated.length) {
        elements.recordStatus.textContent = "已将 " + migration.migrated.length + " 份旧版按 Lab 保存的草稿迁移为独立本机记录。";
    } else if (migration.errors.length) {
        elements.recordStatus.textContent = "旧版草稿迁移有异常：" + migration.errors.join("；");
    }

    elements.labSelect.addEventListener("change", function () {
        localStorage.setItem(lastLabKey, elements.labSelect.value);
        const lab = rubricData.labs.find(function (entry) { return entry.id === elements.labSelect.value; });
        state = blankState(lab);
        render();
        elements.recordStatus.textContent = "已为 " + lab.id.toUpperCase() + " 新建空白记录。";
    });
    elements.applyCap.addEventListener("change", updateScore);
    [elements.student, elements.submission, elements.teacher, elements.date, elements.notes, elements.oralNotes]
        .forEach(function (element) { element.addEventListener("input", updateScore); });
    document.getElementById("parseLogButton").addEventListener("click", parseLog);
    document.getElementById("newRecordButton").addEventListener("click", newRecord);
    document.getElementById("loadRecordButton").addEventListener("click", function () {
        try { loadSelectedRecord(); } catch (error) { reportError(error, elements.recordStatus); }
    });
    document.getElementById("saveButton").addEventListener("click", function () {
        try { saveCurrentRecord(); } catch (error) { reportError(error, elements.recordStatus); }
    });
    document.getElementById("saveAsButton").addEventListener("click", function () {
        try { saveAsNewRecord(); } catch (error) { reportError(error, elements.recordStatus); }
    });
    document.getElementById("deleteRecordButton").addEventListener("click", function () {
        try { deleteSelectedRecord(); } catch (error) { reportError(error, elements.recordStatus); }
    });
    document.getElementById("exportJsonButton").addEventListener("click", function () {
        try { exportJson(); } catch (error) { reportError(error, elements.saveStatus); }
    });
    document.getElementById("exportMarkdownButton").addEventListener("click", function () {
        try { exportMarkdown(); } catch (error) { reportError(error, elements.saveStatus); }
    });
    document.getElementById("printButton").addEventListener("click", function () { window.print(); });
    document.getElementById("resetButton").addEventListener("click", resetCurrent);
    document.getElementById("importInput").addEventListener("change", async function (event) {
        try {
            await importGradingRecord(event.target.files[0]);
        } catch (error) {
            reportError(error, elements.saveStatus);
        } finally {
            event.target.value = "";
        }
    });
    document.getElementById("runImportInput").addEventListener("change", async function (event) {
        try {
            await importRunRecord(event.target.files[0]);
        } catch (error) {
            reportError(error, elements.saveStatus);
        } finally {
            event.target.value = "";
        }
    });
})();
