(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.OS_TEACHER_GRADING_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.min(max, Math.max(min, number));
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
        const status = checks || {};

        if (status.scope === "fail") {
            cap = Math.min(cap, 59);
            reasons.push("发现修改禁止变更的基础设施或测试判定，需人工复核；建议总分不超过 59。" );
        }
        if (status.build === "fail") {
            cap = Math.min(cap, 39);
            reasons.push("目标内核无法构建，无法形成可运行实验；建议总分不超过 39。" );
        } else if (status.qemu === "fail") {
            cap = Math.min(cap, 59);
            reasons.push("QEMU 端到端验收未通过；建议总分不超过 59。" );
        }
        return { cap, reasons };
    }

    function calculate(lab, scores, checks, applyCap) {
        const rows = lab.criteria.map(function (criterion) {
            const value = clamp(scores && scores[criterion.id], 0, criterion.max);
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
        const foundPrevious = lab.previousMarkers.filter(function (marker) {
            return source.includes(marker);
        });
        const missingPrevious = lab.previousMarkers.filter(function (marker) {
            return !source.includes(marker);
        });
        const buildErrorPatterns = [
            /could not compile/i,
            /linking with .* failed/i,
            /invalid register/i,
            /error(?:\[E\d+\])?:/i
        ];
        return {
            passFound: source.includes(lab.passMarker),
            todoFound: source.includes(lab.todoMarker),
            foundPrevious,
            missingPrevious,
            buildError: buildErrorPatterns.some(function (pattern) { return pattern.test(source); }),
            timeout: /timed out|timeout/i.test(source),
            qemuMissing: /qemu-system-riscv64.*(?:not found|无法|不是内部或外部命令)/i.test(source),
            lineCount: source ? source.split(/\r?\n/).length : 0
        };
    }

    function escapeMarkdown(value) {
        return String(value == null ? "" : value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    }

    function buildMarkdown(data, lab, commonChecks) {
        const result = calculate(lab, data.scores || {}, data.checks || {}, data.applyCap !== false);
        const lines = [
            "# " + lab.name + " 教师评分记录",
            "",
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

        if (result.capReasons.length) {
            lines.push("", "## 建议封顶依据", "");
            result.capReasons.forEach(function (reason) { lines.push("- " + reason); });
        }

        lines.push("", "## 总评", "", data.notes || "未填写", "", "## 口试记录", "", data.oralNotes || "未填写", "");
        return lines.join("\n");
    }

    function validateRecord(record, rubricData) {
        if (!record || record.schema !== rubricData.schema) {
            throw new Error("评分记录协议不匹配。" );
        }
        if (!rubricData.labs.some(function (lab) { return lab.id === record.labId; })) {
            throw new Error("评分记录包含未知实验。" );
        }
        return record;
    }

    return {
        clamp,
        scoreBand,
        recommendedCap,
        calculate,
        parseLog,
        buildMarkdown,
        validateRecord
    };
});
