(function initFeedbackModule(root, factory) {
  "use strict";

  const questionApi = typeof module === "object" && module.exports
    ? require("./feedback-questions.js")
    : root?.OsFeedbackQuestions;
  const api = factory(questionApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsFeedback = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createFeedbackModule(questionApi) {
  "use strict";

    if (!questionApi?.getQuestionSet) throw new Error("实验教学评价题库未加载");
  const { getQuestionSet } = questionApi;

  const DEFAULT_TARGET = Object.freeze({
    provider: "gitlab",
    project: "T2026105749911072/project3136859-388774",
    newIssueUrl: "https://gitlab.eduxiji.net/T2026105749911072/project3136859-388774/-/issues/new"
  });
  const DRAFT_STORAGE_KEY = "os-visualization-feedback-draft-v1";
  const SERVICE_URL_STORAGE_KEY = "os-visualization-feedback-service-v1";
  const INVITE_CODE_STORAGE_KEY = "os-visualization-feedback-invite-v1";
  const FEEDBACK_SUBMIT_PROTOCOL = "os-demo.feedback.submit/v1";
  let uiContext = normalizeContext();
  let uiQuestionSet = getQuestionSet(uiContext);
  let uiInitialized = false;
  let uiPendingRecord = null;
  let uiSubmissionReceipt = null;
  let uiSubmitting = false;

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
      .replace(/<\s*(script|iframe)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "[已过滤内容]")
      .replace(/<\s*\/?\s*(?:script|iframe)\b[^>]*>/gi, "[已过滤内容]")
      .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "[已过滤属性]")
      .replace(/\bjavascript\s*:/gi, "[已过滤协议]")
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

  function validateFeedback(input = {}, context = {}) {
    const errors = [];
    if (!OPTIONS.types[input.type]) errors.push("请选择反馈类型");
    if (!OPTIONS.roles[input.role]) errors.push("请选择使用者身份");
    if (!OPTIONS.experience[input.osExperience]) errors.push("请选择操作系统学习经历");
    if (normalizeScore(input.beforeUnderstanding) === null) errors.push("请填写使用前理解程度（1-5）");
    if (normalizeScore(input.afterUnderstanding) === null) errors.push("请填写使用后理解程度（1-5）");
    if (!OPTIONS.outcomes[input.outcome]) errors.push("请选择总体学习效果");

    const questionSet = getQuestionSet(normalizeContext(context));
    if (input.questionSetId !== questionSet.id) {
      errors.push("当前实验已切换，请重新回答对应分支的五道教学评价题");
    } else {
      const answers = input.branchAnswers || {};
      questionSet.questions.forEach((question, index) => {
        if (normalizeScore(answers[question.id]) === null) {
          errors.push(`请回答教学评价第 ${index + 1} 题`);
        }
      });
    }

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
    const normalizedContext = normalizeContext(context);
    const questionSet = getQuestionSet(normalizedContext);
    const errors = validateFeedback(input, normalizedContext);
    if (errors.length) {
      const error = new Error(errors.join("；"));
      error.validationErrors = errors;
      throw error;
    }

    const createdAt = options.now instanceof Date ? options.now : new Date();
    const helpfulAreas = [...new Set(input.helpfulAreas || [])]
      .filter((area) => OPTIONS.helpfulAreas[area]);
    return {
      schemaVersion: 2,
      id: createFeedbackId(createdAt, options.idSuffix),
      createdAt: createdAt.toISOString(),
      type: input.type,
      role: input.role,
      osExperience: input.osExperience,
      beforeUnderstanding: normalizeScore(input.beforeUnderstanding),
      afterUnderstanding: normalizeScore(input.afterUnderstanding),
      outcome: input.outcome,
      helpfulAreas,
      branchQuestionSet: {
        id: questionSet.id,
        lab: questionSet.lab,
        variant: questionSet.variant,
        title: questionSet.title,
        answers: questionSet.questions.map((question) => ({
          id: question.id,
          dimension: question.dimension,
          prompt: question.prompt,
          score: normalizeScore(input.branchAnswers?.[question.id]),
          lowLabel: question.lowLabel,
          highLabel: question.highLabel
        }))
      },
      mostHelpful: sanitizeText(input.mostHelpful),
      stillConfusing: sanitizeText(input.stillConfusing),
      suggestion: sanitizeText(input.suggestion),
      context: input.includeContext === false ? null : normalizedContext
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validateFeedbackRecord(record) {
    const errors = [];
    if (!isPlainObject(record)) return ["评价记录必须是对象"];
    if (record.schemaVersion !== 2) errors.push("评价记录 schemaVersion 必须为 2");
    if (!/^FB-\d{8}T\d{6}Z-[A-Za-z0-9]{1,8}$/.test(String(record.id || ""))) {
      errors.push("评价编号格式不正确");
    }
    if (!record.createdAt || Number.isNaN(Date.parse(record.createdAt))) {
      errors.push("评价创建时间格式不正确");
    }
    if (!OPTIONS.types[record.type]) errors.push("评价类型无法识别");
    if (!OPTIONS.roles[record.role]) errors.push("使用者身份无法识别");
    if (!OPTIONS.experience[record.osExperience]) errors.push("操作系统学习经历无法识别");
    if (normalizeScore(record.beforeUnderstanding) === null) errors.push("使用前理解程度无效");
    if (normalizeScore(record.afterUnderstanding) === null) errors.push("使用后理解程度无效");
    if (!OPTIONS.outcomes[record.outcome]) errors.push("总体学习效果无法识别");
    if (!Array.isArray(record.helpfulAreas)
      || record.helpfulAreas.some((area) => !OPTIONS.helpfulAreas[area])) {
      errors.push("帮助维度格式不正确");
    }

    const branchSet = record.branchQuestionSet;
    if (!isPlainObject(branchSet)) {
      errors.push("缺少当前实验的五道教学评价");
    } else {
      const expectedSet = getQuestionSet({ lab: branchSet.lab, variant: branchSet.variant });
      if (branchSet.id !== expectedSet.id) errors.push("实验评价题组无法识别");
      if (!Array.isArray(branchSet.answers) || branchSet.answers.length !== expectedSet.questions.length) {
        errors.push("实验教学评价必须包含五道题");
      } else {
        expectedSet.questions.forEach((question, index) => {
          const answer = branchSet.answers[index];
          if (!isPlainObject(answer) || answer.id !== question.id) {
            errors.push(`实验教学评价第 ${index + 1} 题不匹配`);
          } else if (normalizeScore(answer.score) === null) {
            errors.push(`实验教学评价第 ${index + 1} 题评分无效`);
          }
        });
      }
      if (record.context && isPlainObject(record.context)) {
        const normalized = normalizeContext(record.context);
        if (normalized.lab !== "unknown" && expectedSet.lab !== normalized.lab) {
          errors.push("实验上下文与评价题组不一致");
        }
        if (["starter", "solution", "baseline"].includes(normalized.variant)
          && expectedSet.variant !== normalized.variant) {
          errors.push("分支角色与评价题组不一致");
        }
      }
    }

    if (record.context !== null && !isPlainObject(record.context)) {
      errors.push("实验上下文格式不正确");
    }
    const detailLength = [record.mostHelpful, record.stillConfusing, record.suggestion]
      .map((value) => sanitizeText(value).length)
      .reduce((sum, length) => sum + length, 0);
    if (detailLength < 5) errors.push("补充反馈内容过短");
    return errors;
  }

  function normalizeFeedbackRecord(record) {
    const errors = validateFeedbackRecord(record);
    if (errors.length) {
      const error = new Error(errors.join("；"));
      error.validationErrors = errors;
      throw error;
    }
    const questionSet = getQuestionSet({
      lab: record.branchQuestionSet.lab,
      variant: record.branchQuestionSet.variant
    });
    const answerById = Object.fromEntries(
      record.branchQuestionSet.answers.map((answer) => [answer.id, answer])
    );
    return {
      schemaVersion: 2,
      id: sanitizeText(record.id, 80),
      createdAt: new Date(record.createdAt).toISOString(),
      type: record.type,
      role: record.role,
      osExperience: record.osExperience,
      beforeUnderstanding: normalizeScore(record.beforeUnderstanding),
      afterUnderstanding: normalizeScore(record.afterUnderstanding),
      outcome: record.outcome,
      helpfulAreas: [...new Set(record.helpfulAreas)].filter((area) => OPTIONS.helpfulAreas[area]),
      branchQuestionSet: {
        id: questionSet.id,
        lab: questionSet.lab,
        variant: questionSet.variant,
        title: questionSet.title,
        answers: questionSet.questions.map((question) => ({
          id: question.id,
          dimension: question.dimension,
          prompt: question.prompt,
          score: normalizeScore(answerById[question.id]?.score),
          lowLabel: question.lowLabel,
          highLabel: question.highLabel
        }))
      },
      mostHelpful: sanitizeText(record.mostHelpful),
      stillConfusing: sanitizeText(record.stillConfusing),
      suggestion: sanitizeText(record.suggestion),
      context: record.context === null ? null : normalizeContext(record.context)
    };
  }

  function comparableFeedback(record) {
    const normalized = normalizeFeedbackRecord(record);
    const { id, createdAt, ...content } = normalized;
    return JSON.stringify(content);
  }

  function resolveFeedbackRecord(input = {}, context = {}, pendingRecord = null, options = {}) {
    const candidate = buildFeedbackRecord(input, context, options);
    if (!pendingRecord) return candidate;
    try {
      const normalizedPending = normalizeFeedbackRecord(pendingRecord);
      return comparableFeedback(normalizedPending) === comparableFeedback(candidate)
        ? normalizedPending
        : candidate;
    } catch (_) {
      return candidate;
    }
  }

  function markdownValue(value) {
    return sanitizeText(value) || "未填写";
  }

  function buildFeedbackMarkdown(record) {
    if (!record || ![1, 2].includes(record.schemaVersion)) throw new Error("无法识别的反馈数据");
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
    const branchQuestionLines = record.branchQuestionSet?.answers?.length
      ? record.branchQuestionSet.answers.map((answer, index) => [
          `${index + 1}. ${markdownValue(answer.prompt)}`,
          `   - 维度：${markdownValue(answer.dimension)}`,
          `   - 评分：${answer.score}/5（1 = ${markdownValue(answer.lowLabel)}；5 = ${markdownValue(answer.highLabel)}）`
        ].join("\n"))
      : ["未记录当前实验的五道教学评价。"];

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
      `## ${markdownValue(record.branchQuestionSet?.title || "实验教学评价")}`,
      "",
      ...branchQuestionLines,
      "",
      "## 补充反馈",
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

  function buildIssueUrl(record, target = DEFAULT_TARGET) {
    const base = target?.newIssueUrl || DEFAULT_TARGET.newIssueUrl;
    const provider = target?.provider || DEFAULT_TARGET.provider;
    const supported = provider === "github"
      ? /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/new$/.test(base)
      : provider === "gitlab" && /^https:\/\/[^/]+\/.+\/-\/issues\/new$/.test(base);
    if (!supported) throw new Error("反馈目标地址不是受支持的 Issue 地址");
    const typeLabel = optionLabel("types", record.type);
    const branchLabel = record.context?.branch && record.context.branch !== "unknown"
      ? ` · ${record.context.branch}`
      : "";
    const url = new URL(base);
    if (provider === "gitlab") {
      url.searchParams.set("issue[title]", `[${typeLabel}] ${record.id}${branchLabel}`);
      url.searchParams.set("issue[description]", buildFeedbackMarkdown(record));
    } else {
      url.searchParams.set("title", `[${typeLabel}] ${record.id}${branchLabel}`);
      url.searchParams.set("body", buildFeedbackMarkdown(record));
    }
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

  function getStorage(storage) {
    if (storage) return storage;
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch (_) {
      return null;
    }
  }

  function normalizeServiceUrl(value) {
    const raw = String(value || "").trim().replace(/\/+$/, "");
    if (!raw || raw.length > 500) throw new Error("反馈服务地址错误");
    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      throw new Error("反馈服务地址错误");
    }
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash
      || (url.pathname && url.pathname !== "/")
      || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
      throw new Error("反馈服务地址错误");
    }
    return url.origin;
  }

  function loadFeedbackSettings(storage) {
    const target = getStorage(storage);
    if (!target) return { serviceUrl: "", inviteCode: "" };
    try {
      const rawUrl = String(target.getItem(SERVICE_URL_STORAGE_KEY) || "").trim();
      return {
        serviceUrl: rawUrl ? normalizeServiceUrl(rawUrl) : "",
        inviteCode: sanitizeText(target.getItem(INVITE_CODE_STORAGE_KEY) || "", 128)
      };
    } catch (_) {
      return { serviceUrl: "", inviteCode: "" };
    }
  }

  function saveFeedbackSettings(settings = {}, storage) {
    const target = getStorage(storage);
    if (!target) return false;
    try {
      const rawUrl = String(settings.serviceUrl || "").trim();
      const serviceUrl = rawUrl ? normalizeServiceUrl(rawUrl) : "";
      const inviteCode = sanitizeText(settings.inviteCode || "", 128);
      target.setItem(SERVICE_URL_STORAGE_KEY, serviceUrl);
      target.setItem(INVITE_CODE_STORAGE_KEY, inviteCode);
      return true;
    } catch (_) {
      return false;
    }
  }

  function createFeedbackEnvelope(record) {
    return {
      protocol: FEEDBACK_SUBMIT_PROTOCOL,
      feedback: normalizeFeedbackRecord(record)
    };
  }

  function submitError(code, message, status = 0) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  async function submitFeedbackRecord(record, options = {}) {
    const serviceUrl = normalizeServiceUrl(options.serviceUrl);
    const inviteCode = sanitizeText(options.inviteCode || "", 128);
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw submitError("network", "当前浏览器不支持网络提交");
    const envelope = createFeedbackEnvelope(record);
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12000;
    const timer = controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    let response;
    try {
      response = await fetchImpl(`${serviceUrl}/api/feedback`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          ...(inviteCode ? { "X-Feedback-Invite": inviteCode } : {})
        },
        body: JSON.stringify(envelope),
        signal: controller?.signal
      });
    } catch (_) {
      throw submitError("network", "网络连接失败");
    } finally {
      if (timer) clearTimeout(timer);
    }

    if ([401, 403].includes(response.status)) throw submitError("invite", "邀请码错误", response.status);
    if (response.status === 404) throw submitError("service_url", "反馈服务地址错误", 404);
    if (response.status === 409) {
      throw submitError("conflict", "同一反馈编号对应了不同内容，请检查本机草稿", 409);
    }
    if (response.status === 429 || response.status >= 500) {
      throw submitError("unavailable", "服务暂时不可用", response.status);
    }

    let responseText;
    try {
      responseText = await response.text();
    } catch (_) {
      throw submitError("unavailable", "服务暂时不可用", response.status);
    }
    if (responseText.length > 16384) throw submitError("unavailable", "服务响应异常", response.status);
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      throw submitError("unavailable", "服务响应不是有效 JSON", response.status);
    }
    if (!response.ok || result?.ok !== true
      || !["created", "duplicate"].includes(result.status)
      || result.feedbackId !== envelope.feedback.id
      || !sanitizeText(result.receiptId, 120)
      || Number.isNaN(Date.parse(result.receivedAt))) {
      throw submitError("unavailable", "服务响应缺少有效回执", response.status);
    }
    return {
      ok: true,
      status: result.status,
      feedbackId: envelope.feedback.id,
      receiptId: sanitizeText(result.receiptId, 120),
      receivedAt: new Date(result.receivedAt).toISOString()
    };
  }

  function normalizeReceipt(receipt) {
    if (!isPlainObject(receipt)
      || !["created", "duplicate"].includes(receipt.status)
      || !sanitizeText(receipt.receiptId, 120)
      || Number.isNaN(Date.parse(receipt.receivedAt))) return null;
    return {
      status: receipt.status,
      feedbackId: sanitizeText(receipt.feedbackId, 80),
      receiptId: sanitizeText(receipt.receiptId, 120),
      receivedAt: new Date(receipt.receivedAt).toISOString()
    };
  }

  function saveFeedbackDraft(input, storage, options = {}) {
    const target = getStorage(storage);
    if (!target) return false;
    const safeDraft = {
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      input: {
        type: sanitizeText(input.type, 30),
        role: sanitizeText(input.role, 30),
        osExperience: sanitizeText(input.osExperience, 30),
        beforeUnderstanding: normalizeScore(input.beforeUnderstanding),
        afterUnderstanding: normalizeScore(input.afterUnderstanding),
        outcome: sanitizeText(input.outcome, 30),
        questionSetId: sanitizeText(input.questionSetId, 80),
        branchAnswers: Object.fromEntries(
          Object.entries(input.branchAnswers || {})
            .map(([id, score]) => [sanitizeText(id, 80), normalizeScore(score)])
            .filter(([id, score]) => id && score !== null)
        ),
        helpfulAreas: Array.isArray(input.helpfulAreas)
          ? input.helpfulAreas.filter((area) => OPTIONS.helpfulAreas[area])
          : [],
        mostHelpful: sanitizeText(input.mostHelpful),
        stillConfusing: sanitizeText(input.stillConfusing),
        suggestion: sanitizeText(input.suggestion),
        includeContext: input.includeContext !== false
      },
      pendingRecord: null,
      receipt: null
    };
    try {
      safeDraft.pendingRecord = options.pendingRecord
        ? normalizeFeedbackRecord(options.pendingRecord)
        : null;
    } catch (_) {
      safeDraft.pendingRecord = null;
    }
    safeDraft.receipt = safeDraft.pendingRecord ? normalizeReceipt(options.receipt) : null;
    try {
      target.setItem(DRAFT_STORAGE_KEY, JSON.stringify(safeDraft));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadFeedbackDraft(storage) {
    const target = getStorage(storage);
    if (!target) return null;
    try {
      const draft = JSON.parse(target.getItem(DRAFT_STORAGE_KEY));
      if (![1, 2].includes(draft?.schemaVersion) || !draft.input) return null;
      let pendingRecord = null;
      try {
        pendingRecord = draft.pendingRecord ? normalizeFeedbackRecord(draft.pendingRecord) : null;
      } catch (_) {
        pendingRecord = null;
      }
      return {
        ...draft,
        pendingRecord,
        receipt: pendingRecord ? normalizeReceipt(draft.receipt) : null
      };
    } catch (_) {
      return null;
    }
  }

  function clearFeedbackDraft(storage) {
    const target = getStorage(storage);
    if (!target) return false;
    try {
      target.removeItem(DRAFT_STORAGE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function collectFormInput(form) {
    const data = new FormData(form);
    const branchAnswers = {};
    form.querySelectorAll("[data-feedback-question-id]").forEach((control) => {
      branchAnswers[control.dataset.feedbackQuestionId] = control.value;
    });
    return {
      type: data.get("type"),
      role: data.get("role"),
      osExperience: data.get("osExperience"),
      beforeUnderstanding: data.get("beforeUnderstanding"),
      afterUnderstanding: data.get("afterUnderstanding"),
      outcome: data.get("outcome"),
      questionSetId: uiQuestionSet.id,
      branchAnswers,
      helpfulAreas: data.getAll("helpfulAreas"),
      mostHelpful: data.get("mostHelpful"),
      stillConfusing: data.get("stillConfusing"),
      suggestion: data.get("suggestion"),
      includeContext: data.get("includeContext") === "on"
    };
  }

  function applyDraftToForm(form, input) {
    for (const [name, value] of Object.entries(input || {})) {
      if (["questionSetId", "branchAnswers"].includes(name)) continue;
      const controls = [...form.querySelectorAll(`[name="${name}"]`)];
      controls.forEach((control) => {
        if (control.type === "checkbox") {
          control.checked = Array.isArray(value) ? value.includes(control.value) : Boolean(value);
        } else if (!Array.isArray(value) && value !== null && value !== undefined) {
          control.value = String(value);
        }
      });
    }
    if (input?.questionSetId === uiQuestionSet.id) {
      Object.entries(input.branchAnswers || {}).forEach(([id, score]) => {
        const control = form.querySelector(`[data-feedback-question-id="${id}"]`);
        if (control && normalizeScore(score) !== null) control.value = String(score);
      });
    }
  }

  function setFeedbackStatus(text, kind = "info") {
    const output = typeof document === "undefined" ? null : document.getElementById("feedback-status");
    if (!output) return;
    output.textContent = text;
    output.dataset.kind = kind;
  }

  function renderFeedbackContext() {
    if (typeof document === "undefined") return;
    const values = {
      "feedback-context-branch": uiContext.branch,
      "feedback-context-lab": `${uiContext.lab} / ${uiContext.variant}`,
      "feedback-context-commit": uiContext.commit,
      "feedback-context-run": uiContext.runStatus
    };
    Object.entries(values).forEach(([id, value]) => {
      const target = document.getElementById(id);
      if (target) target.textContent = value;
    });
  }

  function renderBranchQuestions(force = false) {
    if (typeof document === "undefined") return;
    const nextSet = getQuestionSet(uiContext);
    if (!force && uiQuestionSet.id === nextSet.id && document.querySelector("[data-feedback-question-id]")) {
      return;
    }
    uiQuestionSet = nextSet;
    const pageTitle = document.getElementById("feedback-heading");
    const setTitle = document.getElementById("feedback-question-title");
    const description = document.getElementById("feedback-question-description");
    const container = document.getElementById("feedback-branch-questions");
    if (pageTitle) pageTitle.textContent = nextSet.title;
    if (setTitle) setTitle.textContent = "当前实验教学评价五题";
    if (description) description.textContent = nextSet.description;
    if (!container) return;
    container.innerHTML = "";

    nextSet.questions.forEach((question, index) => {
      const item = document.createElement("div");
      item.className = "feedback-branch-question";
      const heading = document.createElement("div");
      heading.className = "feedback-question-heading";
      const number = document.createElement("span");
      number.className = "feedback-question-number";
      number.textContent = String(index + 1);
      const dimension = document.createElement("span");
      dimension.className = "feedback-question-dimension";
      dimension.textContent = question.dimension;
      heading.append(number, dimension);

      const label = document.createElement("label");
      label.htmlFor = `feedback-question-${question.id}`;
      label.textContent = question.prompt;
      const select = document.createElement("select");
      select.id = `feedback-question-${question.id}`;
      select.name = `branchAnswer-${question.id}`;
      select.dataset.feedbackQuestionId = question.id;
      select.required = true;
      const labels = {
        1: question.lowLabel,
        2: "偏低",
        3: "一般",
        4: "偏高",
        5: question.highLabel
      };
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "请选择 1–5 分";
      select.appendChild(placeholder);
      for (let score = 1; score <= 5; score += 1) {
        const option = document.createElement("option");
        option.value = String(score);
        option.textContent = `${score} · ${labels[score]}`;
        select.appendChild(option);
      }
      const scale = document.createElement("small");
      scale.textContent = `1 = ${question.lowLabel}；5 = ${question.highLabel}`;
      item.append(heading, label, select, scale);
      container.appendChild(item);
    });

    const draft = loadFeedbackDraft();
    const form = document.getElementById("feedback-form");
    if (draft && form && draft.input.questionSetId === nextSet.id) {
      applyDraftToForm(form, draft.input);
    }
  }

  function setContext(context = {}) {
    uiContext = normalizeContext(context);
    renderFeedbackContext();
    if (uiInitialized) renderBranchQuestions();
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function initFeedbackCenter() {
    if (uiInitialized || typeof document === "undefined") return false;
    const form = document.getElementById("feedback-form");
    if (!form) return false;
    uiInitialized = true;
    renderFeedbackContext();
    renderBranchQuestions(true);

    const draft = loadFeedbackDraft();
    const serviceInput = document.getElementById("feedback-service-url");
    const inviteInput = document.getElementById("feedback-invite-code");
    const submitButton = document.getElementById("feedback-submit");
    const settings = loadFeedbackSettings();
    if (serviceInput) serviceInput.value = settings.serviceUrl;
    if (inviteInput) inviteInput.value = settings.inviteCode;
    if (draft) {
      applyDraftToForm(form, draft.input);
      uiPendingRecord = draft.pendingRecord;
      uiSubmissionReceipt = draft.receipt;
      if (uiSubmissionReceipt) {
        setFeedbackStatus(
          `已经提交过。回执 ${uiSubmissionReceipt.receiptId}，接收时间 ${new Date(uiSubmissionReceipt.receivedAt).toLocaleString()}。`,
          "success"
        );
      } else {
        setFeedbackStatus(`已恢复本机草稿（${new Date(draft.savedAt).toLocaleString()}）`);
      }
    }

    function recordFromForm() {
      const input = collectFormInput(form);
      const previousId = uiPendingRecord?.id;
      const record = resolveFeedbackRecord(input, uiContext, uiPendingRecord);
      if (previousId !== record.id) uiSubmissionReceipt = null;
      uiPendingRecord = record;
      saveFeedbackDraft(input, undefined, {
        pendingRecord: uiPendingRecord,
        receipt: uiSubmissionReceipt
      });
      return record;
    }

    function saveSettingsFromForm() {
      const serviceUrl = serviceInput?.value || "";
      const inviteCode = inviteInput?.value || "";
      if (serviceUrl) {
        const normalized = normalizeServiceUrl(serviceUrl);
        if (serviceInput) serviceInput.value = normalized;
      }
      if (!saveFeedbackSettings({ serviceUrl, inviteCode })) {
        throw new Error("浏览器未允许保存反馈服务设置");
      }
      return { serviceUrl, inviteCode };
    }

    document.getElementById("feedback-save")?.addEventListener("click", () => {
      const input = collectFormInput(form);
      if (uiPendingRecord) {
        const resolved = resolveFeedbackRecord(input, uiContext, uiPendingRecord);
        if (resolved.id !== uiPendingRecord.id) {
          uiPendingRecord = null;
          uiSubmissionReceipt = null;
        }
      }
      const saved = saveFeedbackDraft(input, undefined, {
        pendingRecord: uiPendingRecord,
        receipt: uiSubmissionReceipt
      });
      setFeedbackStatus(saved ? "草稿已保存在当前浏览器。" : "浏览器未允许保存草稿。", saved ? "success" : "error");
    });

    [serviceInput, inviteInput].filter(Boolean).forEach((control) => {
      control.addEventListener("change", () => {
        const saved = saveFeedbackSettings({
          serviceUrl: serviceInput?.value || "",
          inviteCode: inviteInput?.value || ""
        });
        if (!saved) setFeedbackStatus("服务地址或邀请码格式不正确。", "error");
      });
    });

    document.getElementById("feedback-export-md")?.addEventListener("click", () => {
      try {
        const record = recordFromForm();
        downloadText(feedbackFilename(record), buildFeedbackMarkdown(record), "text/markdown;charset=utf-8");
        setFeedbackStatus("Markdown 反馈已导出，可离线交给项目负责人。", "success");
      } catch (error) {
        setFeedbackStatus(error.message, "error");
      }
    });

    document.getElementById("feedback-export-json")?.addEventListener("click", () => {
      try {
        const record = recordFromForm();
        downloadText(feedbackFilename(record, "json"), serializeFeedbackJson(record), "application/json;charset=utf-8");
        setFeedbackStatus("JSON 反馈已导出。", "success");
      } catch (error) {
        setFeedbackStatus(error.message, "error");
      }
    });

    submitButton?.addEventListener("click", async () => {
      if (uiSubmitting) return;
      try {
        const record = recordFromForm();
        const submitSettings = saveSettingsFromForm();
        uiSubmitting = true;
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        setFeedbackStatus("正在提交教学评价……");
        const receipt = await submitFeedbackRecord(record, submitSettings);
        uiSubmissionReceipt = receipt;
        saveFeedbackDraft(collectFormInput(form), undefined, {
          pendingRecord: uiPendingRecord,
          receipt
        });
        const received = new Date(receipt.receivedAt).toLocaleString();
        const prefix = receipt.status === "duplicate" ? "已经提交过" : "提交成功";
        setFeedbackStatus(`${prefix}。回执 ${receipt.receiptId}，接收时间 ${received}。`, "success");
      } catch (error) {
        const suffix = ["network", "unavailable"].includes(error.code)
          ? "草稿仍保留在当前浏览器，可导出文件或稍后重试。"
          : "";
        setFeedbackStatus(`${error.message}。${suffix}`.trim(), "error");
      } finally {
        uiSubmitting = false;
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    });

    document.getElementById("feedback-clear")?.addEventListener("click", () => {
      form.reset();
      clearFeedbackDraft();
      uiPendingRecord = null;
      uiSubmissionReceipt = null;
      renderBranchQuestions(true);
      setFeedbackStatus("表单和本机草稿已清空。", "success");
    });
    return true;
  }

  return Object.freeze({
    DEFAULT_TARGET,
    DRAFT_STORAGE_KEY,
    SERVICE_URL_STORAGE_KEY,
    INVITE_CODE_STORAGE_KEY,
    FEEDBACK_SUBMIT_PROTOCOL,
    OPTIONS,
    getQuestionSet,
    sanitizeText,
    normalizeContext,
    validateFeedback,
    validateFeedbackRecord,
    normalizeFeedbackRecord,
    createFeedbackId,
    buildFeedbackRecord,
    resolveFeedbackRecord,
    buildFeedbackMarkdown,
    buildIssueUrl,
    feedbackFilename,
    serializeFeedbackJson,
    normalizeServiceUrl,
    loadFeedbackSettings,
    saveFeedbackSettings,
    createFeedbackEnvelope,
    submitFeedbackRecord,
    saveFeedbackDraft,
    loadFeedbackDraft,
    clearFeedbackDraft,
    setContext,
    initFeedbackCenter
  });
});
