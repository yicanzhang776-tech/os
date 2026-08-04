(function initFeedbackModule(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsFeedback = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createFeedbackModule() {
  "use strict";

  const DEFAULT_TARGET = Object.freeze({
    provider: "github",
    repository: "yicanzhang776-tech/os",
    newIssueUrl: "https://github.com/yicanzhang776-tech/os/issues/new"
  });

  const OPTIONS = Object.freeze({
    types: Object.freeze({
      evaluation: "教学效果评价",
      suggestion: "改进建议",
      problem: "实验问题"
    }),
    roles: Object.freeze({
      student: "学生",
      teacher: "教师",
      assistant: "助教",
      learner: "其他学习者"
    }),
    experience: Object.freeze({
      none: "尚未学习过操作系统",
      learning: "正在学习操作系统",
      learned: "已经学过操作系统课程",
      kernel: "有内核或系统开发经验"
    }),
    outcomes: Object.freeze({
      much_better: "理解明显加深",
      somewhat_better: "理解有所加深",
      unchanged: "理解没有明显变化",
      no_help: "对理解没有帮助",
      more_confused: "使用后更加困惑"
    }),
    helpfulAreas: Object.freeze({
      theory: "理论概念",
      code: "代码实现",
      process: "实验流程",
      connections: "知识点之间的联系",
      debugging: "调试与问题定位"
    })
  });

  function sanitizeText(value, maxLength = 2000) {
    let text = String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]{12,}\b/g, "[已隐藏凭据]")
      .replace(/\bglpat-[A-Za-z0-9_-]{8,}\b/g, "[已隐藏凭据]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [已隐藏凭据]")
      .replace(/\b[A-Za-z]:[\\/]Users[\\/][^\\/\s]+/gi, "$HOME")
      .replace(/\/(?:home|Users)\/[^/\s]+/g, "$HOME")
      .trim();
    if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
    return text;
  }

  function optionLabel(group, value) {
    return OPTIONS[group]?.[value] || "未填写";
  }

  function normalizeScore(value) {
    const score = Number(value);
    return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
  }

  function normalizeContext(context = {}) {
    const branch = sanitizeText(context.branch || "unknown", 120);
    const commitCandidate = sanitizeText(context.commit || "unknown", 40);
    const commit = /^[0-9a-f]{4,40}$/i.test(commitCandidate) ? commitCandidate : "unknown";
    const labCandidate = sanitizeText(context.lab || "unknown", 20).toLowerCase();
    const lab = /^(?:p0|lab[1-7])$/.test(labCandidate) ? labCandidate : "unknown";
    const variantCandidate = sanitizeText(context.variant || "unknown", 20).toLowerCase();
    const variant = /^(?:starter|solution|baseline|demo|main)$/.test(variantCandidate)
      ? variantCandidate
      : "unknown";
    return {
      branch,
      commit,
      lab,
      variant,
      runStatus: sanitizeText(context.runStatus || context.phase || "未运行", 60)
    };
  }

  function validateFeedback(input = {}) {
    const errors = [];
    if (!OPTIONS.types[input.type]) errors.push("请选择反馈类型");
    if (!OPTIONS.roles[input.role]) errors.push("请选择使用者身份");
    if (!OPTIONS.experience[input.osExperience]) errors.push("请选择操作系统学习经历");
    if (normalizeScore(input.beforeUnderstanding) === null) errors.push("请填写使用前理解程度（1-5）");
    if (normalizeScore(input.afterUnderstanding) === null) errors.push("请填写使用后理解程度（1-5）");
    if (!OPTIONS.outcomes[input.outcome]) errors.push("请选择总体学习效果");

    const helpfulAreas = Array.isArray(input.helpfulAreas) ? input.helpfulAreas : [];
    if (helpfulAreas.some((area) => !OPTIONS.helpfulAreas[area])) {
      errors.push("帮助维度中含有无法识别的选项");
    }

    const detailLength = [input.mostHelpful, input.stillConfusing, input.suggestion]
      .map((value) => sanitizeText(value).length)
      .reduce((sum, length) => sum + length, 0);
    if (detailLength < 5) errors.push("请用一句话描述收获、困惑或建议");
    return errors;
  }

  function createFeedbackId(date = new Date(), suffix) {
    const validDate = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
    const stamp = validDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const randomPart = sanitizeText(
      suffix || Math.random().toString(36).slice(2, 6).toUpperCase(),
      8
    ).replace(/[^A-Za-z0-9]/g, "") || "LOCAL";
    return `FB-${stamp}-${randomPart}`;
  }

  function buildFeedbackRecord(input = {}, context = {}, options = {}) {
    const errors = validateFeedback(input);
    if (errors.length) {
      const error = new Error(errors.join("；"));
      error.validationErrors = errors;
      throw error;
    }

    const createdAt = options.now instanceof Date ? options.now : new Date();
    const helpfulAreas = [...new Set(input.helpfulAreas || [])]
      .filter((area) => OPTIONS.helpfulAreas[area]);
    return {
      schemaVersion: 1,
      id: createFeedbackId(createdAt, options.idSuffix),
      createdAt: createdAt.toISOString(),
      type: input.type,
      role: input.role,
      osExperience: input.osExperience,
      beforeUnderstanding: normalizeScore(input.beforeUnderstanding),
      afterUnderstanding: normalizeScore(input.afterUnderstanding),
      outcome: input.outcome,
      helpfulAreas,
      mostHelpful: sanitizeText(input.mostHelpful),
      stillConfusing: sanitizeText(input.stillConfusing),
      suggestion: sanitizeText(input.suggestion),
      context: input.includeContext === false ? null : normalizeContext(context)
    };
  }

  function markdownValue(value) {
    return sanitizeText(value) || "未填写";
  }

  function buildFeedbackMarkdown(record) {
    if (!record || record.schemaVersion !== 1) throw new Error("无法识别的反馈数据");
    const areaLabels = (record.helpfulAreas || [])
      .map((area) => optionLabel("helpfulAreas", area))
      .join("、") || "未选择";
    const contextLines = record.context
      ? [
          `- 当前分支：${markdownValue(record.context.branch)}`,
          `- 实验与版本：${markdownValue(record.context.lab)} / ${markdownValue(record.context.variant)}`,
          `- 提交：${markdownValue(record.context.commit)}`,
          `- 运行状态：${markdownValue(record.context.runStatus)}`
        ]
      : ["- 使用者选择不附带实验上下文"];

    return [
      "# 教学评价与反馈",
      "",
      `- 反馈编号：${record.id}`,
      `- 反馈类型：${optionLabel("types", record.type)}`,
      `- 提交时间：${record.createdAt}`,
      "",
      "## 学习背景与效果",
      "",
      `- 使用者身份：${optionLabel("roles", record.role)}`,
      `- 操作系统学习经历：${optionLabel("experience", record.osExperience)}`,
      `- 使用前理解程度：${record.beforeUnderstanding}/5`,
      `- 使用后理解程度：${record.afterUnderstanding}/5`,
      `- 总体效果：${optionLabel("outcomes", record.outcome)}`,
      `- 有帮助的方面：${areaLabels}`,
      "",
      "## 具体反馈",
      "",
      `### 最有帮助的内容\n\n${markdownValue(record.mostHelpful)}`,
      "",
      `### 仍然困惑的内容\n\n${markdownValue(record.stillConfusing)}`,
      "",
      `### 改进建议\n\n${markdownValue(record.suggestion)}`,
      "",
      "## 实验上下文",
      "",
      ...contextLines,
      "",
      "> 页面不会自动附带源代码、终端日志、账号凭据或个人联系方式。",
      ""
    ].join("\n");
  }

  function buildGithubIssueUrl(record, target = DEFAULT_TARGET) {
    const base = target?.newIssueUrl || DEFAULT_TARGET.newIssueUrl;
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/new$/.test(base)) {
      throw new Error("反馈目标地址不是受支持的 GitHub Issue 地址");
    }
    const typeLabel = optionLabel("types", record.type);
    const branchLabel = record.context?.branch && record.context.branch !== "unknown"
      ? ` · ${record.context.branch}`
      : "";
    const url = new URL(base);
    url.searchParams.set("title", `[${typeLabel}] ${record.id}${branchLabel}`);
    url.searchParams.set("body", buildFeedbackMarkdown(record));
    return url.toString();
  }

  function feedbackFilename(record, extension = "md") {
    const safeId = sanitizeText(record?.id || "feedback", 80).replace(/[^A-Za-z0-9_.-]/g, "-");
    const safeExtension = extension === "json" ? "json" : "md";
    return `${safeId}.${safeExtension}`;
  }

  function serializeFeedbackJson(record) {
    return `${JSON.stringify(record, null, 2)}\n`;
  }

  return Object.freeze({
    DEFAULT_TARGET,
    OPTIONS,
    sanitizeText,
    normalizeContext,
    validateFeedback,
    createFeedbackId,
    buildFeedbackRecord,
    buildFeedbackMarkdown,
    buildGithubIssueUrl,
    feedbackFilename,
    serializeFeedbackJson
  });
});
