(() => {
  "use strict";

  const RUN_SUBMIT_PROTOCOL = "os-demo.run.submit/v1";
  const RUN_SCHEMA_VERSION = "os-demo.run/v1";
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const MAX_EVENTS = 512;
  const MAX_SUBMISSION_BYTES = 512 * 1024;
  const RECEIPT_STATUSES = new Set(["created", "duplicate"]);
  const RESULT_VALUES = new Set(["pass", "todo", "fail", "timeout", "finished", "stopped"]);
  const ROLE_VALUES = new Set(["starter", "solution", "custom"]);

  const SENT_FIELDS = Object.freeze([
    "运行编号、Lab、分支角色、分支名和提交短编号",
    "开始时间、结束时间和运行时长",
    "学生预测、结构化事件、最终结果和预测对照",
    "可选的教学评价编号（仅在已经获得评价回执时）"
  ]);
  const EXCLUDED_FIELDS = Object.freeze([
    "实验源代码、文件内容和命令行",
    "完整终端、串口、stdout 或 stderr 日志",
    "本地用户名、用户目录、环境变量、Cookie、访问令牌和密码"
  ]);

  function transferApi() {
    if (typeof module !== "undefined" && module.exports) return require("./run-transfer");
    return typeof window !== "undefined" ? window.OsRunTransfer : null;
  }

  function feedbackApi() {
    if (typeof module !== "undefined" && module.exports) return require("./feedback");
    return typeof window !== "undefined" ? window.OsFeedback : null;
  }

  function submissionError(code, message, status = 0) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  function byteLength(value) {
    const source = String(value ?? "");
    if (typeof Buffer !== "undefined") return Buffer.byteLength(source, "utf8");
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(source).length;
    return unescape(encodeURIComponent(source)).length;
  }

  function sanitizeText(value, limit = 1000) {
    const transfer = transferApi();
    const base = transfer?.sanitizeText
      ? transfer.sanitizeText(value, limit * 2)
      : String(value ?? "").replace(/<[^>]*>/g, "[已移除HTML]");
    return String(base)
      .replace(/\b(?:authorization|cookie|password|passwd|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*[^\s,;]+/gi, "$1=[已移除敏感值]")
      .replace(/\b(?:gh[pousr]_|github_pat_|glpat-|sk-)[A-Za-z0-9_-]{8,}\b/g, "[已移除访问令牌]")
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [已移除访问令牌]")
      .replace(/\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi, "C:\\Users\\[本地用户]")
      .replace(/\/(?:home|Users)\/[^/\s]+/g, "/home/[本地用户]")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, limit);
  }

  function isoTime(value, field) {
    const milliseconds = typeof value === "number" ? value : Date.parse(String(value || ""));
    if (!Number.isFinite(milliseconds)) throw submissionError("invalid_run", `${field} 不是有效时间。`);
    return new Date(milliseconds).toISOString();
  }

  function sanitizePrediction(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const expectedBuild = ["success", "failure"].includes(value.expectedBuild) ? value.expectedBuild : null;
    const expectedRun = ["todo", "complete", "failure", "timeout"].includes(value.expectedRun) ? value.expectedRun : null;
    const expectedPass = typeof value.expectedPass === "boolean" ? value.expectedPass : null;
    const expectedEvents = Array.isArray(value.expectedEvents)
      ? [...new Set(value.expectedEvents
          .map((item) => sanitizeText(item, 120).toLowerCase())
          .filter((item) => /^(?:p0|lab[1-7]):[a-z0-9][a-z0-9-]{0,79}$/.test(item)))]
          .slice(0, 128)
      : [];
    const reasoning = sanitizeText(value.reasoning, 1200);
    if (!expectedBuild && !expectedRun && expectedPass === null && !expectedEvents.length && !reasoning) return null;
    return { expectedBuild, expectedRun, expectedEvents, expectedPass, reasoning };
  }

  function sanitizeComparisonItem(item) {
    if (typeof item === "string") return sanitizeText(item, 500);
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const clean = {
      type: sanitizeText(item.type, 40),
      key: sanitizeText(item.key, 120),
      text: sanitizeText(item.text, 500)
    };
    return clean.text || clean.key ? clean : null;
  }

  function sanitizePredictionComparison(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const groups = ["correct", "omissions", "missing", "opposites", "extraEvents", "unknown"];
    const output = {
      overall: sanitizeText(value.overall, 40),
      overallLabel: sanitizeText(value.overallLabel, 80)
    };
    for (const group of groups) {
      output[group] = Array.isArray(value[group])
        ? value[group].slice(0, 128).map(sanitizeComparisonItem).filter(Boolean)
        : [];
    }
    const actual = value.actual && typeof value.actual === "object" && !Array.isArray(value.actual)
      ? value.actual
      : {};
    output.actual = {
      build: sanitizeText(actual.build, 40),
      run: sanitizeText(actual.run, 40),
      pass: typeof actual.pass === "boolean" ? actual.pass : null,
      evidenceCount: Number.isInteger(actual.evidenceCount) && actual.evidenceCount >= 0
        ? Math.min(actual.evidenceCount, MAX_EVENTS)
        : null,
      eventKeys: Array.isArray(actual.eventKeys)
        ? actual.eventKeys.map((item) => sanitizeText(item, 120)).filter(Boolean).slice(0, MAX_EVENTS)
        : []
    };
    return output;
  }

  function sanitizeEvent(event, index) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw submissionError("invalid_event", `第 ${index + 1} 个事件无效。`);
    }
    if (event.protocol !== EVENT_PROTOCOL) {
      throw submissionError("unsupported_event_protocol", `第 ${index + 1} 个事件协议不兼容。`);
    }
    const lab = sanitizeText(event.lab, 20).toLowerCase();
    const step = sanitizeText(event.step, 80).toLowerCase();
    const status = sanitizeText(event.status, 20).toLowerCase();
    if (!/^(?:p0|lab[1-7])$/.test(lab) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(step)) {
      throw submissionError("invalid_event", `第 ${index + 1} 个事件键无效。`);
    }
    if (!["running", "todo", "pass", "fail"].includes(status)) {
      throw submissionError("invalid_event", `第 ${index + 1} 个事件状态无效。`);
    }
    const sequence = Number(event.sequence);
    const timestamp = event.timestamp === null || event.timestamp === undefined || event.timestamp === ""
      ? null
      : Number(event.timestamp);
    return {
      protocol: EVENT_PROTOCOL,
      lab,
      step,
      status,
      detail: sanitizeText(event.detail || event.raw || step, 500) || step,
      source: sanitizeText(event.source, 20) || "console",
      sequence: Number.isInteger(sequence) && sequence >= 0 ? sequence : 0,
      timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null
    };
  }

  function stableRun(record) {
    const transfer = transferApi();
    if (!transfer?.exportRun || !transfer?.parseRunJson) {
      throw submissionError("unavailable", "运行记录模块不可用。" );
    }
    if (record?.schemaVersion !== undefined) {
      if (record.schemaVersion !== RUN_SCHEMA_VERSION) {
        throw submissionError("unsupported_schema", `仅支持 ${RUN_SCHEMA_VERSION}。`);
      }
      if (record.protocol !== EVENT_PROTOCOL) {
        throw submissionError("unsupported_event_protocol", `仅支持 ${EVENT_PROTOCOL}。`);
      }
      const parsed = transfer.parseRunJson(JSON.stringify(record));
      return transfer.exportRun(parsed);
    }
    return transfer.exportRun(record);
  }

  function sanitizeRunRecordForSubmission(record) {
    const source = stableRun(record);
    if (!Array.isArray(source.events)) throw submissionError("invalid_events", "运行记录缺少结构化事件。" );
    if (source.events.length > MAX_EVENTS) {
      throw submissionError("too_many_events", `单次最多提交 ${MAX_EVENTS} 个事件。`);
    }
    const lab = sanitizeText(source.lab, 20).toLowerCase();
    const role = sanitizeText(source.role, 20).toLowerCase();
    if (!/^(?:p0|lab[1-7])$/.test(lab) || !ROLE_VALUES.has(role)) {
      throw submissionError("invalid_run", "运行记录的 Lab 或分支角色无效。" );
    }
    if (!RESULT_VALUES.has(source.finalResult)) {
      throw submissionError("invalid_run", "运行记录的最终结果无效。" );
    }
    const runId = sanitizeText(source.runId, 120);
    const branch = sanitizeText(source.branch, 120);
    if (!runId || !branch) throw submissionError("invalid_run", "运行编号和分支不能为空。" );
    const clean = {
      schemaVersion: RUN_SCHEMA_VERSION,
      protocol: EVENT_PROTOCOL,
      runId,
      branch,
      commit: sanitizeText(source.commit, 80) || "unknown",
      lab,
      role,
      startTime: isoTime(source.startTime, "startTime"),
      endTime: isoTime(source.endTime, "endTime"),
      prediction: sanitizePrediction(source.prediction),
      events: source.events.map(sanitizeEvent),
      finalResult: source.finalResult,
      predictionComparison: sanitizePredictionComparison(source.predictionComparison),
      lifecycle: {
        buildResult: ["success", "failure"].includes(source.lifecycle?.buildResult)
          ? source.lifecycle.buildResult : null,
        runResult: ["running", "finished", "failure", "timeout", "stopped"].includes(source.lifecycle?.runResult)
          ? source.lifecycle.runResult : null,
        completed: Boolean(source.lifecycle?.completed)
      },
      exitCode: Number.isInteger(source.exitCode) ? source.exitCode : null,
      stopped: Boolean(source.stopped),
      error: sanitizeText(source.error, 500)
    };
    if (Date.parse(clean.endTime) < Date.parse(clean.startTime)) {
      throw submissionError("invalid_run", "结束时间不能早于开始时间。" );
    }
    return clean;
  }

  function normalizeFeedbackId(value) {
    const clean = sanitizeText(value, 80);
    return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(clean) ? clean : null;
  }

  function createRunSubmissionEnvelope(record, options = {}) {
    const envelope = {
      protocol: RUN_SUBMIT_PROTOCOL,
      run: sanitizeRunRecordForSubmission(record)
    };
    const feedbackId = normalizeFeedbackId(options.feedbackId);
    if (feedbackId) envelope.feedbackId = feedbackId;
    const serialized = JSON.stringify(envelope);
    if (byteLength(serialized) > MAX_SUBMISSION_BYTES) {
      throw submissionError("file_too_large", "脱敏后的运行记录仍超过 512 KiB，不能提交。" );
    }
    return envelope;
  }

  function previewRunSubmission(record, options = {}) {
    const envelope = createRunSubmissionEnvelope(record, options);
    const run = envelope.run;
    return {
      run,
      feedbackId: envelope.feedbackId || null,
      durationMs: Math.max(0, Date.parse(run.endTime) - Date.parse(run.startTime)),
      eventCount: run.events.length,
      sentFields: [...SENT_FIELDS],
      excludedFields: [...EXCLUDED_FIELDS],
      byteLength: byteLength(JSON.stringify(envelope))
    };
  }

  async function submitRunRecord(record, options = {}) {
    if (options.consent !== true) {
      throw submissionError("consent_required", "请先查看预览并明确同意提交这一次运行记录。" );
    }
    const feedback = feedbackApi();
    if (!feedback?.normalizeServiceUrl) throw submissionError("unavailable", "反馈服务配置模块不可用。" );
    const serviceUrl = feedback.normalizeServiceUrl(options.serviceUrl);
    const inviteCode = sanitizeText(options.inviteCode || "", 128);
    const envelope = createRunSubmissionEnvelope(record, options);
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw submissionError("network", "当前浏览器不支持网络提交。" );
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12000;
    const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(`${serviceUrl}/api/run-record`, {
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
      throw submissionError("network", "网络连接失败。" );
    } finally {
      if (timer) clearTimeout(timer);
    }

    let result = null;
    try {
      const text = await response.text();
      if (text.length <= 16384) result = JSON.parse(text);
    } catch (_) {
      // Mapped below to an unavailable response.
    }
    if ([401, 403].includes(response.status)) throw submissionError("invite", "邀请码错误。", response.status);
    if (response.status === 404) throw submissionError("service_url", "反馈服务地址不支持运行记录提交。", 404);
    if (response.status === 409) throw submissionError("conflict", "同一运行编号已保存了不同内容，服务器未覆盖原记录。", 409);
    if (response.status === 413) throw submissionError("file_too_large", "提交内容超过服务端大小限制。", 413);
    if (response.status === 422) {
      const code = ["too_many_events", "unsupported_schema", "unsupported_event_protocol"].includes(result?.code)
        ? result.code : "incompatible";
      throw submissionError(code, sanitizeText(result?.error, 500) || "运行记录不兼容。", 422);
    }
    if (response.status === 429 || response.status >= 500) {
      throw submissionError("unavailable", "服务暂时不可用，可稍后重试同一运行记录。", response.status);
    }
    if (!response.ok || result?.ok !== true || !RECEIPT_STATUSES.has(result.status)
      || result.runId !== envelope.run.runId || !sanitizeText(result.receiptId, 120)
      || Number.isNaN(Date.parse(result.receivedAt))) {
      throw submissionError("unavailable", "服务响应缺少有效运行记录回执。", response.status);
    }
    return {
      ok: true,
      status: result.status,
      runId: result.runId,
      receiptId: sanitizeText(result.receiptId, 120),
      receivedAt: new Date(result.receivedAt).toISOString()
    };
  }

  const api = Object.freeze({
    EVENT_PROTOCOL,
    EXCLUDED_FIELDS,
    MAX_EVENTS,
    MAX_SUBMISSION_BYTES,
    RUN_SCHEMA_VERSION,
    RUN_SUBMIT_PROTOCOL,
    SENT_FIELDS,
    byteLength,
    createRunSubmissionEnvelope,
    previewRunSubmission,
    sanitizeRunRecordForSubmission,
    sanitizeText,
    submitRunRecord
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsRunSubmission = api;
})();
