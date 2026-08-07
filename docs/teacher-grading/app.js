(function () {
    "use strict";

    const rubricData = window.OS_TEACHER_RUBRICS;
    const core = window.OS_TEACHER_GRADING_CORE;
    const storagePrefix = "os-teacher-grading/v1/";
    const lastLabKey = storagePrefix + "last-lab";

    const elements = {
        labSelect: document.getElementById("labSelect"),
        student: document.getElementById("studentInput"),
        submission: document.getElementById("submissionInput"),
        teacher: document.getElementById("teacherInput"),
        date: document.getElementById("dateInput"),
        estimatedHours: document.getElementById("estimatedHours"),
        objectives: document.getElementById("objectives"),
        checksBody: document.getElementById("checksBody"),
        applyCap: document.getElementById("applyCapInput"),
        capNotice: document.getElementById("capNotice"),
        logInput: document.getElementById("logInput"),
        logResult: document.getElementById("logResult"),
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

    let state = blankState(rubricData.labs[0]);

    function today() {
        const date = new Date();
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    }

    function blankState(lab) {
        const scores = {};
        const evidence = {};
        const checks = {};
        lab.criteria.forEach(function (criterion) {
            scores[criterion.id] = 0;
            evidence[criterion.id] = "";
        });
        rubricData.commonChecks.forEach(function (check) { checks[check.id] = "not-run"; });
        return {
            schema: rubricData.schema,
            labId: lab.id,
            student: "",
            submission: "",
            teacher: "",
            date: today(),
            scores,
            evidence,
            checks,
            applyCap: true,
            notes: "",
            oralNotes: "",
            logText: "",
            updatedAt: null
        };
    }

    function currentLab() {
        return rubricData.labs.find(function (lab) { return lab.id === state.labId; }) || rubricData.labs[0];
    }

    function storageKey(labId) { return storagePrefix + labId; }

    function loadState(labId) {
        const lab = rubricData.labs.find(function (entry) { return entry.id === labId; });
        const fallback = blankState(lab);
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey(labId)) || "null");
            if (!saved || saved.schema !== rubricData.schema) return fallback;
            return Object.assign(fallback, saved, {
                scores: Object.assign(fallback.scores, saved.scores || {}),
                evidence: Object.assign(fallback.evidence, saved.evidence || {}),
                checks: Object.assign(fallback.checks, saved.checks || {})
            });
        } catch (_error) {
            return fallback;
        }
    }

    function syncFieldsToState() {
        state.student = elements.student.value.trim();
        state.submission = elements.submission.value.trim();
        state.teacher = elements.teacher.value.trim();
        state.date = elements.date.value;
        state.applyCap = elements.applyCap.checked;
        state.notes = elements.notes.value.trim();
        state.oralNotes = elements.oralNotes.value.trim();
        state.logText = elements.logInput.value;
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
        elements.logInput.value = state.logText || "";
        elements.estimatedHours.textContent = "建议时长：" + lab.estimatedHours;

        elements.objectives.replaceChildren();
        lab.objectives.forEach(function (objective) {
            const item = document.createElement("span");
            item.textContent = objective;
            elements.objectives.appendChild(item);
        });

        renderChecks();
        renderRubric();
        renderManualReview();
        updateScore();
        if (state.logText) parseLog();
        else elements.logResult.replaceChildren();
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
            type.textContent = check.kind === "automatic" ? "自动证据" : "人工证据";
            typeCell.appendChild(type);
            const resultCell = document.createElement("td");
            const select = document.createElement("select");
            select.dataset.checkId = check.id;
            [
                ["not-run", "未执行"],
                ["pass", "通过"],
                ["fail", "失败"]
            ].forEach(function (entry) {
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
        addChip(result.lineCount + " 行日志", "");
    }

    function saveDraft() {
        syncFieldsToState();
        state.updatedAt = new Date().toISOString();
        localStorage.setItem(storageKey(state.labId), JSON.stringify(state));
        localStorage.setItem(lastLabKey, state.labId);
        elements.saveStatus.textContent = "草稿已保存在当前浏览器：" + new Date().toLocaleString();
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
        URL.revokeObjectURL(url);
    }

    function exportJson() {
        syncFieldsToState();
        const record = Object.assign({}, state, { updatedAt: new Date().toISOString() });
        download(state.labId + "-grading.json", JSON.stringify(record, null, 2), "application/json");
    }

    function exportMarkdown() {
        syncFieldsToState();
        const markdown = core.buildMarkdown(state, currentLab(), rubricData.commonChecks);
        download(state.labId + "-grading.md", markdown, "text/markdown");
    }

    async function importJson(file) {
        if (!file) return;
        if (file.size > 256 * 1024) throw new Error("评分记录超过 256 KiB。" );
        const record = core.validateRecord(JSON.parse(await file.text()), rubricData);
        state = Object.assign(blankState(rubricData.labs.find(function (lab) { return lab.id === record.labId; })), record);
        render();
        elements.saveStatus.textContent = "已导入本地评分记录，尚未覆盖浏览器草稿。";
    }

    function resetCurrent() {
        if (!window.confirm("确定清空当前实验的评分记录吗？")) return;
        localStorage.removeItem(storageKey(state.labId));
        state = blankState(currentLab());
        render();
        elements.saveStatus.textContent = "当前实验记录已清空。";
    }

    populateLabSelect();
    const savedLabId = localStorage.getItem(lastLabKey);
    const initialLabId = rubricData.labs.some(function (lab) { return lab.id === savedLabId; })
        ? savedLabId
        : rubricData.labs[0].id;
    state = loadState(initialLabId);
    render();

    elements.labSelect.addEventListener("change", function () {
        syncFieldsToState();
        localStorage.setItem(lastLabKey, elements.labSelect.value);
        state = loadState(elements.labSelect.value);
        render();
    });
    elements.applyCap.addEventListener("change", updateScore);
    [elements.student, elements.submission, elements.teacher, elements.date, elements.notes, elements.oralNotes]
        .forEach(function (element) { element.addEventListener("input", updateScore); });
    document.getElementById("parseLogButton").addEventListener("click", parseLog);
    document.getElementById("saveButton").addEventListener("click", saveDraft);
    document.getElementById("exportJsonButton").addEventListener("click", exportJson);
    document.getElementById("exportMarkdownButton").addEventListener("click", exportMarkdown);
    document.getElementById("printButton").addEventListener("click", function () { window.print(); });
    document.getElementById("resetButton").addEventListener("click", resetCurrent);
    document.getElementById("importInput").addEventListener("change", async function (event) {
        try {
            await importJson(event.target.files[0]);
        } catch (error) {
            elements.saveStatus.textContent = "导入失败：" + error.message;
        } finally {
            event.target.value = "";
        }
    });
})();
