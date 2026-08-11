(function initFeedbackAdminModel(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsFeedbackAdminModel = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createFeedbackAdminModel() {
  "use strict";

  function feedbackOf(stored) {
    return stored?.feedback && typeof stored.feedback === "object" ? stored.feedback : null;
  }

  function filterRecords(records, filters = {}) {
    const lab = String(filters.lab || "all");
    const variant = String(filters.variant || "all");
    const role = String(filters.role || "all");
    return (Array.isArray(records) ? records : []).filter((stored) => {
      const feedback = feedbackOf(stored);
      if (!feedback) return false;
      return (lab === "all" || feedback.branchQuestionSet?.lab === lab)
        && (variant === "all" || feedback.branchQuestionSet?.variant === variant)
        && (role === "all" || feedback.role === role);
    });
  }

  function summarizeRecords(records) {
    const safeRecords = filterRecords(records);
    const questions = new Map();
    const comments = [];
    for (const stored of safeRecords) {
      const feedback = feedbackOf(stored);
      for (const answer of feedback.branchQuestionSet?.answers || []) {
        if (!questions.has(answer.id)) {
          questions.set(answer.id, {
            id: answer.id,
            prompt: answer.prompt,
            dimension: answer.dimension,
            count: 0,
            total: 0,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          });
        }
        const item = questions.get(answer.id);
        if (Number.isInteger(answer.score) && answer.score >= 1 && answer.score <= 5) {
          item.count += 1;
          item.total += answer.score;
          item.distribution[answer.score] += 1;
        }
      }
      if (feedback.mostHelpful || feedback.stillConfusing || feedback.suggestion) {
        comments.push({
          feedbackId: feedback.id,
          lab: feedback.branchQuestionSet?.lab || "unknown",
          variant: feedback.branchQuestionSet?.variant || "unknown",
          role: feedback.role || "unknown",
          mostHelpful: feedback.mostHelpful || "",
          stillConfusing: feedback.stillConfusing || "",
          suggestion: feedback.suggestion || ""
        });
      }
    }
    return {
      count: safeRecords.length,
      questions: [...questions.values()].map((item) => ({
        id: item.id,
        prompt: item.prompt,
        dimension: item.dimension,
        count: item.count,
        average: item.count ? Number((item.total / item.count).toFixed(2)) : null,
        distribution: item.distribution
      })),
      comments
    };
  }

  function safeCsvValue(value) {
    let text = String(value ?? "").replace(/\r\n?/g, "\n");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportJson(records, exportedAt = new Date()) {
    return `${JSON.stringify({
      protocol: "os-demo.feedback.export/v1",
      exportedAt: exportedAt.toISOString(),
      count: filterRecords(records).length,
      records: filterRecords(records)
    }, null, 2)}\n`;
  }

  function exportCsv(records) {
    const header = [
      "feedbackId", "receiptId", "receivedAt", "lab", "variant", "role", "type",
      "outcome", "beforeUnderstanding", "afterUnderstanding", "question1", "question2",
      "question3", "question4", "question5", "mostHelpful", "stillConfusing", "suggestion"
    ];
    const rows = filterRecords(records).map((stored) => {
      const feedback = feedbackOf(stored);
      const answers = feedback.branchQuestionSet?.answers || [];
      return [
        feedback.id,
        stored.receiptId,
        stored.receivedAt,
        feedback.branchQuestionSet?.lab,
        feedback.branchQuestionSet?.variant,
        feedback.role,
        feedback.type,
        feedback.outcome,
        feedback.beforeUnderstanding,
        feedback.afterUnderstanding,
        ...Array.from({ length: 5 }, (_, index) => answers[index]?.score ?? ""),
        feedback.mostHelpful,
        feedback.stillConfusing,
        feedback.suggestion
      ].map(safeCsvValue).join(",");
    });
    return [`\uFEFF${header.map(safeCsvValue).join(",")}`, ...rows, ""].join("\n");
  }

  function exportMarkdown(records, exportedAt = new Date()) {
    const summary = summarizeRecords(records);
    const questionLines = summary.questions.length
      ? summary.questions.flatMap((question, index) => [
          `${index + 1}. ${question.prompt}`,
          `   - 维度：${question.dimension}`,
          `   - 平均值：${question.average ?? "暂无"}（${question.count} 份）`,
          `   - 分布：1分 ${question.distribution[1]}；2分 ${question.distribution[2]}；3分 ${question.distribution[3]}；4分 ${question.distribution[4]}；5分 ${question.distribution[5]}`
        ])
      : ["暂无结构化评分。"];
    const commentLines = summary.comments.length
      ? summary.comments.flatMap((comment) => [
          `### ${comment.feedbackId} · ${comment.lab}/${comment.variant} · ${comment.role}`,
          "",
          `- 最有帮助：${comment.mostHelpful || "未填写"}`,
          `- 仍然困惑：${comment.stillConfusing || "未填写"}`,
          `- 改进建议：${comment.suggestion || "未填写"}`,
          ""
        ])
      : ["暂无文字反馈。", ""];
    return [
      "# OS 教学实验评价汇总",
      "",
      `- 导出时间：${exportedAt.toISOString()}`,
      `- 评价数量：${summary.count}`,
      "",
      "## 五道实验评价题",
      "",
      ...questionLines,
      "",
      "## 文字建议",
      "",
      ...commentLines
    ].join("\n");
  }

  return Object.freeze({ exportCsv, exportJson, exportMarkdown, filterRecords, summarizeRecords });
});
