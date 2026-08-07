(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.OS_TEACHER_GRADING_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const STORAGE_PREFIX = "os-teacher-grading/v1/";
    const RECORD_INDEX_KEY = STORAGE_PREFIX + "record-index";
    const RECORD_KEY_PREFIX = STORAGE_PREFIX + "record/";
    const LEGACY_MIGRATION_KEY = STORAGE_PREFIX + "legacy-migration-complete";
    const MAX_IMPORT_BYTES = 256 * 1024;
    const CHECK_STATUSES = new Set(["not-run", "pass", "fail"]);
    const STRING_LIMITS = Object.freeze({
        recordId: 120,
        student: 120,
        submission: 160,
        teacher: 120,
        date: 20,
        notes: 5000,
        oralNotes: 5000,
        updatedAt: 40,
        evidence: 2000
    });

    function isPlainObject(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    function byteLength(value) {
        const source = String(value == null ? "" : value);
        if (typeof Buffer !== "undefined") return Buffer.byteLength(source, "utf8");
        if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(source).length;
        return unescape(encodeURIComponent(source)).length;
    }

    function cleanText(value, limit) {
        return String(value == null ? "" : value)
            .replace(/\u001b\[[0-9;]*m/g, "")
            .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
            .replace(/<[^>]*>/g, "[已移除HTML]")
            .replace(/\b(?:gh[pousr]_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,})\b/g, "[已移除访问令牌]")
            .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [已移除访问令牌]")
            .replace(/\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi, "C:\\Users\\[本地用户]")
            .replace(/\/(?:home|Users)\/[^/\s]+/g, "/home/[本地用户]")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
            .trim()
            .slice(0, limit);
    }

    function stringField(record, field, limit, fallback) {
        const value = record[field];
        if (value == null) return fallback;
        if (typeof value !== "string") {
            throw new Error("字段 “" + field + "” 必须是字符串。");
        }
        return cleanText(value, limit);
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.min(max, Math.max(min, number));
    }

    function createRecordId(cryptoSource) {
        const source = cryptoSource || (typeof globalThis !== "undefined" ? globalThis.crypto : null);
        if (source && typeof source.randomUUID === "function") return source.randomUUID();
        if (source && typeof source.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            source.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
            return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
        }
        throw new Error("当前浏览器不支持安全的本地记录 ID，请使用支持 Web Crypto 的现代浏览器。");
    }

    function createUniqueRecordId(storage, cryptoSource) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const recordId = createRecordId(cryptoSource);
            if (!storage || !storage.getItem(RECORD_KEY_PREFIX + recordId)) return recordId;
        }
        throw new Error("无法生成不重复的本地记录 ID，请重试。");
    }

    function createBlankRecord(lab, rubricData, options) {
        const settings = options || {};
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
            recordId: settings.recordId || createRecordId(settings.crypto),
            labId: lab.id,
            student: "",
            submission: "",
            teacher: "",
            date: settings.date || "",
            scores,
            evidence,
            checks,
            applyCap: true,
            notes: "",
            oralNotes: "",
            linkedRunEvidence: null,
            updatedAt: ""
        };
    }

    function scoreBand(score) {
        if (score >= 90) return "优秀";
        if (score >= 80) return "良好";
        if (score >= 70) return "中等";
        if (score >= 60) return "及格";
        return "未通过";
    }

    function recommendedCap(checks) {
        let cap = 100;
        const reasons = [];
        const status = isPlainObject(checks) ? checks : {};

        if (status.scope === "fail") {
            cap = Math.min(cap, 59);
            reasons.push("发现修改禁止变更的基础设施或测试判定，需人工复核；建议总分不超过 59。");
        }
        if (status.build === "fail") {
            cap = Math.min(cap, 39);
            reasons.push("目标内核无法构建，无法形成可运行实验；建议总分不超过 39。");
        } else if (status.qemu === "fail") {
            cap = Math.min(cap, 59);
            reasons.push("QEMU 端到端验收未通过；建议总分不超过 59。");
        }
        return { cap, reasons };
    }

    function calculate(lab, scores, checks, applyCap) {
        const source = isPlainObject(scores) ? scores : {};
        const rows = lab.criteria.map(function (criterion) {
            const value = clamp(source[criterion.id], 0, criterion.max);
            return { id: criterion.id, value, max: criterion.max };
        });
        const raw = rows.reduce(function (sum, row) { return sum + row.value; }, 0);
        const capInfo = recommendedCap(checks);
        const finalScore = applyCap ? Math.min(raw, capInfo.cap) : raw;
        return {
            rows,
            raw,
            cap: capInfo.cap,
            capReasons: capInfo.reasons,
            finalScore,
            band: scoreBand(finalScore)
        };
    }

    function parseLog(lab, text) {
        const source = String(text || "");
        const foundPrevious = lab.previousMarkers.filter(function (marker) { return source.includes(marker); });
        const missingPrevious = lab.previousMarkers.filter(function (marker) { return !source.includes(marker); });
        const buildErrorPatterns = [
            /could not compile/i,
            /linking with .* failed/i,
            /invalid register/i,
            /error(?:\[E\d+\])?:/i
        ];
        return {
            passFound: source.includes(lab.passMarker),
            todoFound: source.includes(lab.todoMarker) || new RegExp("\\[" + lab.id.replace("lab", "Lab") + "(?:-[^\\]]+)?\\]\\s+TODO", "i").test(source),
            foundPrevious,
            missingPrevious,
            buildError: buildErrorPatterns.some(function (pattern) { return pattern.test(source); }),
            timeout: /timed out|timeout|超时/i.test(source),
            qemuMissing: /qemu-system-riscv64.*(?:not found|无法|不是内部或外部命令)/i.test(source),
            lineCount: source ? source.split(/\r?\n/).length : 0
        };
    }

    function migrateLegacyRubric(lab, scoresSource, evidenceSource) {
        const knownScoreCount = lab.criteria.filter(function (criterion) {
            return Object.prototype.hasOwnProperty.call(scoresSource, criterion.id);
        }).length;
        if (knownScoreCount || !Object.keys(scoresSource).length) return null;

        const legacyValues = Object.keys(scoresSource).map(function (key) {
            return typeof scoresSource[key] === "number" && Number.isFinite(scoresSource[key])
                ? Math.max(0, scoresSource[key])
                : 0;
        });
        const legacyRaw = clamp(legacyValues.reduce(function (sum, value) { return sum + value; }, 0), 0, 100);
        const scores = {};
        let assigned = 0;
        lab.criteria.forEach(function (criterion, index) {
            const value = index === lab.criteria.length - 1
                ? Math.max(0, legacyRaw - assigned)
                : Math.round(legacyRaw * criterion.max) / 100;
            scores[criterion.id] = clamp(value, 0, criterion.max);
            assigned += scores[criterion.id];
        });
        const evidenceLines = isPlainObject(evidenceSource)
            ? Object.keys(evidenceSource).filter(function (key) { return typeof evidenceSource[key] === "string" && evidenceSource[key].trim(); })
                .map(function (key) { return key + "：" + cleanText(evidenceSource[key], 500); })
            : [];
        return {
            scores,
            note: "【旧版量表迁移】旧分项总分 " + legacyRaw + "/100 已按新版教师指南权重等比例恢复。" +
                (evidenceLines.length ? "\n旧版分项证据：\n- " + evidenceLines.join("\n- ") : "")
        };
    }

    function normalizeLinkedRunEvidence(value) {
        if (!isPlainObject(value) || value.schemaVersion !== "os-demo.run/v1") return null;
        const missingPrevious = Array.isArray(value.missingPrevious)
            ? value.missingPrevious.slice(0, 7).filter(function (item) { return typeof item === "string"; })
                .map(function (item) { return cleanText(item, 80); })
            : [];
        return {
            schemaVersion: "os-demo.run/v1",
            runId: cleanText(value.runId, 120),
            lab: cleanText(value.lab, 20).toLowerCase(),
            role: cleanText(value.role, 20).toLowerCase(),
            branch: cleanText(value.branch, 120),
            commit: cleanText(value.commit, 80),
            buildResult: cleanText(value.buildResult, 20),
            runResult: cleanText(value.runResult, 20),
            finalResult: cleanText(value.finalResult, 20),
            qemuCheck: CHECK_STATUSES.has(value.qemuCheck) ? value.qemuCheck : "not-run",
            passFound: value.passFound === true,
            todoFound: value.todoFound === true,
            missingPrevious,
            failureFound: value.failureFound === true,
            timeoutFound: value.timeoutFound === true,
            conclusion: cleanText(value.conclusion, 500),
            linkedAt: cleanText(value.linkedAt, 40)
        };
    }

    function validateRecord(record, rubricData, options) {
        if (!isPlainObject(record)) throw new Error("评分记录顶层必须是 JSON 普通对象。");
        if (record.schema !== rubricData.schema) {
            throw new Error("评分记录协议不兼容；当前仅支持 " + rubricData.schema + "。");
        }
        if (typeof record.labId !== "string") throw new Error("字段 “labId” 必须是字符串。");
        const lab = rubricData.labs.find(function (entry) { return entry.id === record.labId; });
        if (!lab) throw new Error("评分记录包含未知实验：" + cleanText(record.labId, 30) + "。");

        const settings = options || {};
        const recordIdValue = record.recordId;
        if (recordIdValue != null && typeof recordIdValue !== "string") {
            throw new Error("字段 “recordId” 必须是字符串。");
        }
        const recordId = cleanText(recordIdValue, STRING_LIMITS.recordId) || createRecordId(settings.crypto);
        const scoresSource = isPlainObject(record.scores) ? record.scores : {};
        const evidenceSource = isPlainObject(record.evidence) ? record.evidence : {};
        const checksSource = isPlainObject(record.checks) ? record.checks : {};
        const legacy = migrateLegacyRubric(lab, scoresSource, evidenceSource);
        const scores = {};
        const evidence = {};
        const checks = {};

        lab.criteria.forEach(function (criterion) {
            const value = legacy ? legacy.scores[criterion.id] : scoresSource[criterion.id];
            scores[criterion.id] = typeof value === "number" && Number.isFinite(value)
                ? clamp(value, 0, criterion.max)
                : 0;
            const text = evidenceSource[criterion.id];
            evidence[criterion.id] = typeof text === "string" ? cleanText(text, STRING_LIMITS.evidence) : "";
        });
        rubricData.commonChecks.forEach(function (check) {
            const status = checksSource[check.id];
            checks[check.id] = CHECK_STATUSES.has(status) ? status : "not-run";
        });

        let notes = stringField(record, "notes", STRING_LIMITS.notes, "");
        if (legacy) notes = cleanText([notes, legacy.note].filter(Boolean).join("\n\n"), STRING_LIMITS.notes);
        return {
            schema: rubricData.schema,
            recordId,
            labId: lab.id,
            student: stringField(record, "student", STRING_LIMITS.student, ""),
            submission: stringField(record, "submission", STRING_LIMITS.submission, ""),
            teacher: stringField(record, "teacher", STRING_LIMITS.teacher, ""),
            date: stringField(record, "date", STRING_LIMITS.date, ""),
            scores,
            evidence,
            checks,
            applyCap: record.applyCap !== false,
            notes,
            oralNotes: stringField(record, "oralNotes", STRING_LIMITS.oralNotes, ""),
            linkedRunEvidence: normalizeLinkedRunEvidence(record.linkedRunEvidence),
            updatedAt: stringField(record, "updatedAt", STRING_LIMITS.updatedAt, "")
        };
    }

    function parseRecordJson(source, rubricData, options) {
        if (typeof source !== "string") throw new Error("导入内容必须是 JSON 文本。");
        if (byteLength(source) > MAX_IMPORT_BYTES) throw new Error("评分记录超过 256 KiB，已拒绝导入。");
        let value;
        try {
            value = JSON.parse(source);
        } catch (_error) {
            throw new Error("评分记录不是有效 JSON，请检查文件内容。");
        }
        return validateRecord(value, rubricData, options);
    }

    function parseIndexItem(value, rubricData) {
        if (!isPlainObject(value)) return null;
        if (typeof value.recordId !== "string" || typeof value.labId !== "string") return null;
        if (!rubricData.labs.some(function (lab) { return lab.id === value.labId; })) return null;
        return {
            recordId: cleanText(value.recordId, STRING_LIMITS.recordId),
            labId: value.labId,
            student: typeof value.student === "string" ? cleanText(value.student, STRING_LIMITS.student) : "",
            submission: typeof value.submission === "string" ? cleanText(value.submission, STRING_LIMITS.submission) : "",
            teacher: typeof value.teacher === "string" ? cleanText(value.teacher, STRING_LIMITS.teacher) : "",
            finalScore: clamp(value.finalScore, 0, 100),
            updatedAt: typeof value.updatedAt === "string" ? cleanText(value.updatedAt, STRING_LIMITS.updatedAt) : ""
        };
    }

    function loadRecordIndex(storage, rubricData) {
        try {
            const value = JSON.parse(storage.getItem(RECORD_INDEX_KEY) || "[]");
            if (!Array.isArray(value)) return [];
            return value.map(function (item) { return parseIndexItem(item, rubricData); }).filter(Boolean)
                .sort(function (left, right) { return right.updatedAt.localeCompare(left.updatedAt); });
        } catch (_error) {
            return [];
        }
    }

    function indexEntry(record, rubricData) {
        const lab = rubricData.labs.find(function (entry) { return entry.id === record.labId; });
        const result = calculate(lab, record.scores, record.checks, record.applyCap);
        return {
            recordId: record.recordId,
            labId: record.labId,
            student: record.student,
            submission: record.submission,
            teacher: record.teacher,
            finalScore: result.finalScore,
            updatedAt: record.updatedAt
        };
    }

    function saveRecord(storage, record, rubricData, options) {
        const settings = options || {};
        const normalized = validateRecord(record, rubricData, settings);
        normalized.updatedAt = cleanText(settings.now || new Date().toISOString(), STRING_LIMITS.updatedAt);
        storage.setItem(RECORD_KEY_PREFIX + normalized.recordId, JSON.stringify(normalized));
        const index = loadRecordIndex(storage, rubricData).filter(function (item) { return item.recordId !== normalized.recordId; });
        index.unshift(indexEntry(normalized, rubricData));
        storage.setItem(RECORD_INDEX_KEY, JSON.stringify(index));
        return normalized;
    }

    function loadRecord(storage, recordId, rubricData, options) {
        if (typeof recordId !== "string" || !recordId) throw new Error("请选择要加载的本机评分记录。");
        const source = storage.getItem(RECORD_KEY_PREFIX + recordId);
        if (!source) throw new Error("本机未找到该评分记录，可能已被删除。");
        try {
            return validateRecord(JSON.parse(source), rubricData, options);
        } catch (error) {
            throw new Error("本机评分记录已损坏：" + error.message);
        }
    }

    function deleteRecord(storage, recordId, rubricData) {
        storage.removeItem(RECORD_KEY_PREFIX + recordId);
        const index = loadRecordIndex(storage, rubricData).filter(function (item) { return item.recordId !== recordId; });
        storage.setItem(RECORD_INDEX_KEY, JSON.stringify(index));
        return index;
    }

    function migrateLegacyDrafts(storage, rubricData, options) {
        const settings = options || {};
        if (storage.getItem(LEGACY_MIGRATION_KEY)) return { alreadyDone: true, migrated: [], errors: [] };
        const migrated = [];
        const errors = [];
        rubricData.labs.forEach(function (lab) {
            const legacyKey = STORAGE_PREFIX + lab.id;
            const source = storage.getItem(legacyKey);
            if (!source) return;
            try {
                const legacy = JSON.parse(source);
                if (!isPlainObject(legacy)) throw new Error("草稿顶层不是对象");
                const candidate = Object.assign({}, legacy, {
                    schema: rubricData.schema,
                    labId: lab.id,
                    recordId: createUniqueRecordId(storage, settings.crypto)
                });
                const saved = saveRecord(storage, candidate, rubricData, {
                    crypto: settings.crypto,
                    now: typeof legacy.updatedAt === "string" && legacy.updatedAt ? legacy.updatedAt : settings.now
                });
                migrated.push(saved.recordId);
            } catch (error) {
                errors.push(lab.id + "：" + error.message);
            }
        });
        storage.setItem(LEGACY_MIGRATION_KEY, JSON.stringify({
            completedAt: cleanText(settings.now || new Date().toISOString(), STRING_LIMITS.updatedAt),
            migrated: migrated.length,
            errors: errors.length
        }));
        return { alreadyDone: false, migrated, errors };
    }

    function summarizeRunEvidence(run, lab, linkedAt) {
        if (!isPlainObject(run) || !isPlainObject(run.context)) throw new Error("运行记录缺少已校验的上下文。");
        if (run.context.lab !== lab.id) {
            throw new Error("运行记录属于 " + run.context.lab + "，不能关联到 " + lab.id + " 评分记录。");
        }
        const lifecycle = isPlainObject(run.lifecycle) ? run.lifecycle : {};
        const events = Array.isArray(run.events) ? run.events.filter(isPlainObject) : [];
        const targetEvents = events.filter(function (event) {
            return event.protocol === "os-demo.event/v1" && event.lab === lab.id;
        });
        const stableOutput = Array.isArray(run.stableOutput)
            ? run.stableOutput.slice(-60).map(function (line) { return cleanText(line && line.line != null ? line.line : line, 500); }).filter(Boolean)
            : [];
        const parsed = parseLog(lab, stableOutput.join("\n"));
        const eventPass = targetEvents.some(function (event) { return event.step === "pass" && event.status === "pass"; });
        const eventTodo = targetEvents.some(function (event) { return event.status === "todo" || /todo/i.test(String(event.step || "")); });
        const eventFail = targetEvents.some(function (event) { return event.status === "fail"; });
        const buildResult = lifecycle.buildResult === "success" || lifecycle.buildResult === "failure" ? lifecycle.buildResult : "unknown";
        const runResult = ["running", "finished", "failure", "timeout", "stopped"].includes(lifecycle.runResult)
            ? lifecycle.runResult
            : "unknown";
        const finalResult = ["pass", "todo", "fail", "timeout", "finished", "stopped"].includes(run.result)
            ? run.result
            : "finished";
        const passFound = eventPass || parsed.passFound;
        const todoFound = eventTodo || parsed.todoFound || finalResult === "todo";
        const timeoutFound = runResult === "timeout" || finalResult === "timeout" || parsed.timeout;
        const failureFound = buildResult === "failure" || runResult === "failure" || finalResult === "fail" || eventFail || Boolean(run.error) || parsed.buildError;
        const buildCheck = buildResult === "success" ? "pass" : buildResult === "failure" ? "fail" : "not-run";
        let qemuCheck = "not-run";
        if (passFound && !todoFound && !timeoutFound && !failureFound) qemuCheck = "pass";
        else if (todoFound || timeoutFound || failureFound || runResult === "finished" || lifecycle.completed === true) qemuCheck = "fail";
        const conclusions = [
            "构建" + (buildCheck === "pass" ? "通过" : buildCheck === "fail" ? "失败" : "无结论"),
            "QEMU " + (qemuCheck === "pass" ? "通过" : qemuCheck === "fail" ? "未通过" : "无结论"),
            passFound ? "出现当前 Lab PASS" : "未出现当前 Lab PASS"
        ];
        if (todoFound) conclusions.push("出现 TODO");
        if (parsed.missingPrevious.length) conclusions.push("缺少 " + parsed.missingPrevious.length + " 个前置 PASS");
        if (failureFound) conclusions.push("出现失败证据");
        if (timeoutFound) conclusions.push("出现超时证据");
        return {
            schemaVersion: "os-demo.run/v1",
            runId: cleanText(run.id, 120),
            lab: lab.id,
            role: cleanText(run.context.variant, 20).toLowerCase(),
            branch: cleanText(run.context.branch, 120),
            commit: cleanText(run.context.commit, 80),
            buildResult,
            runResult,
            finalResult,
            qemuCheck,
            passFound,
            todoFound,
            missingPrevious: parsed.missingPrevious,
            failureFound,
            timeoutFound,
            conclusion: conclusions.join("；") + "。",
            linkedAt: cleanText(linkedAt || new Date().toISOString(), STRING_LIMITS.updatedAt),
            objectiveChecks: { build: buildCheck, qemu: qemuCheck }
        };
    }

    function applyRunEvidence(record, summary) {
        const next = Object.assign({}, record, {
            scores: Object.assign({}, record.scores),
            evidence: Object.assign({}, record.evidence),
            checks: Object.assign({}, record.checks)
        });
        ["build", "qemu"].forEach(function (checkId) {
            const status = summary.objectiveChecks && summary.objectiveChecks[checkId];
            if (status === "pass" || status === "fail") next.checks[checkId] = status;
        });
        const evidence = Object.assign({}, summary);
        delete evidence.objectiveChecks;
        next.linkedRunEvidence = normalizeLinkedRunEvidence(evidence);
        return next;
    }

    function escapeMarkdown(value) {
        return String(value == null ? "" : value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    }

    function buildMarkdown(data, lab, commonChecks) {
        const result = calculate(lab, data.scores || {}, data.checks || {}, data.applyCap !== false);
        const lines = [
            "# " + lab.name + " 教师评分记录",
            "",
            "- 记录 ID：" + (data.recordId || "未填写"),
            "- 学生/小组：" + (data.student || "未填写"),
            "- 提交标识：" + (data.submission || "未填写"),
            "- 评阅教师：" + (data.teacher || "未填写"),
            "- 评阅日期：" + (data.date || "未填写"),
            "- 原始分：" + result.raw + "/100",
            "- 最终分：" + result.finalScore + "/100（" + result.band + "）",
            "",
            "## 分项评分",
            "",
            "| 评分项 | 得分 | 满分 | 证据与评语 |",
            "|---|---:|---:|---|"
        ];

        lab.criteria.forEach(function (criterion) {
            lines.push("| " + escapeMarkdown(criterion.title) + " | " +
                result.rows.find(function (row) { return row.id === criterion.id; }).value + " | " +
                criterion.max + " | " + escapeMarkdown((data.evidence || {})[criterion.id]) + " |");
        });

        lines.push("", "## 验收检查", "", "| 检查项 | 类型 | 结果 |", "|---|---|---|");
        commonChecks.forEach(function (check) {
            const value = (data.checks || {})[check.id] || "not-run";
            const label = value === "pass" ? "通过" : value === "fail" ? "失败" : "未执行";
            lines.push("| " + escapeMarkdown(check.label) + " | " + (check.kind === "automatic" ? "自动" : "人工") + " | " + label + " |");
        });

        const linked = normalizeLinkedRunEvidence(data.linkedRunEvidence);
        if (linked) {
            lines.push("", "## 关联运行证据", "",
                "- 协议：`" + linked.schemaVersion + "`",
                "- 运行 ID：`" + escapeMarkdown(linked.runId) + "`",
                "- Lab / 角色：`" + linked.lab + "` / `" + linked.role + "`",
                "- 分支：`" + escapeMarkdown(linked.branch) + "`",
                "- 提交：`" + escapeMarkdown(linked.commit) + "`",
                "- 结论：" + escapeMarkdown(linked.conclusion));
        }

        if (result.capReasons.length) {
            lines.push("", "## 建议封顶依据", "");
            result.capReasons.forEach(function (reason) { lines.push("- " + reason); });
        }

        lines.push("", "## 总评", "", data.notes || "未填写", "", "## 口试记录", "", data.oralNotes || "未填写", "");
        return lines.join("\n");
    }

    function serializeRecordJson(data, rubricData, options) {
        return JSON.stringify(validateRecord(data, rubricData, options), null, 2) + "\n";
    }

    return {
        STORAGE_PREFIX,
        RECORD_INDEX_KEY,
        RECORD_KEY_PREFIX,
        LEGACY_MIGRATION_KEY,
        MAX_IMPORT_BYTES,
        CHECK_STATUSES,
        STRING_LIMITS,
        isPlainObject,
        byteLength,
        clamp,
        createRecordId,
        createUniqueRecordId,
        createBlankRecord,
        scoreBand,
        recommendedCap,
        calculate,
        parseLog,
        normalizeLinkedRunEvidence,
        validateRecord,
        parseRecordJson,
        loadRecordIndex,
        saveRecord,
        loadRecord,
        deleteRecord,
        migrateLegacyDrafts,
        summarizeRunEvidence,
        applyRunEvidence,
        buildMarkdown,
        serializeRecordJson
    };
});
