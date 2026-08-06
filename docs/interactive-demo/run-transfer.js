(() => {
  "use strict";

  const RUN_SCHEMA_VERSION = "os-demo.run/v1";
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const MAX_IMPORT_BYTES = 1024 * 1024;
  const MAX_EVENTS = 512;
  const VALID_LABS = new Set(["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  const VALID_ROLES = new Set(["starter", "solution", "custom"]);
  const VALID_RESULTS = new Set(["pass", "todo", "fail", "timeout", "finished", "stopped"]);
  const VALID_STATUSES = new Set(["running", "todo", "pass", "fail"]);

  function historyApi() {
    if (typeof module !== "undefined" && module.exports) return require("./run-history");
    return typeof window !== "undefined" ? window.OsRunHistory : null;
  }

  function transferError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function byteLength(value) {
    const source = String(value ?? "");
    if (typeof Buffer !== "undefined") return Buffer.byteLength(source, "utf8");
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(source).length;
    return unescape(encodeURIComponent(source)).length;
  }

  function sanitizeText(value, limit = 1000) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/<[^>]*>/g, "[已移除HTML]")
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,})\b/g, "[已移除访问令牌]")
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [已移除访问令牌]")
      .replace(/\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi, "C:\\Users\\[本地用户]")
      .replace(/\/(?:home|Users)\/[^/\s]+/g, "/home/[本地用户]")
      .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, limit);
  }

  function sanitizeJsonValue(value, depth = 0) {
    if (depth > 8) return null;
    if (typeof value === "string") return sanitizeText(value, 2000);
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean" || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, MAX_EVENTS).map((item) => sanitizeJsonValue(item, depth + 1));
    if (!value || typeof value !== "object") return null;
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 64)
        .map(([key, item]) => [sanitizeText(key, 80), sanitizeJsonValue(item, depth + 1)])
        .filter(([key]) => key)
    );
  }

  function isoTime(value, fieldName) {
    const milliseconds = typeof value === "number" ? value : Date.parse(String(value || ""));
    if (!Number.isFinite(milliseconds)) {
      throw transferError("invalid_time", `${fieldName} 不是有效时间。`);
    }
    return new Date(milliseconds).toISOString();
  }

  function normalizeEvent(event, index) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw transferError("invalid_event", `第 ${index + 1} 个事件不是有效对象。`);
    }
    if (event.protocol !== EVENT_PROTOCOL) {
      throw transferError("unsupported_event_protocol", `第 ${index + 1} 个事件协议不兼容：${sanitizeText(event.protocol, 80) || "缺失"}。`);
    }
    const lab = sanitizeText(event.lab, 20).toLowerCase();
    const step = sanitizeText(event.step, 80).toLowerCase();
    const status = sanitizeText(event.status, 20).toLowerCase();
    if (!VALID_LABS.has(lab)) throw transferError("invalid_event", `第 ${index + 1} 个事件的 Lab 无效。`);
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(step)) throw transferError("invalid_event", `第 ${index + 1} 个事件步骤无效。`);
    if (!VALID_STATUSES.has(status)) throw transferError("invalid_event", `第 ${index + 1} 个事件状态无效。`);
    const sequence = Number(event.sequence);
    const hasTimestamp = event.timestamp !== null
      && event.timestamp !== undefined
      && event.timestamp !== "";
    const timestamp = hasTimestamp ? Number(event.timestamp) : null;
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

  function normalizedRun(run) {
    const history = historyApi();
    const normalized = history?.normalizeStoredRunRecord?.(run);
    if (!normalized) throw transferError("invalid_run", "当前运行记录不完整，无法导出。");
    return normalized;
  }

  function exportRun(run, exportedAt = Date.now()) {
    const record = normalizedRun(run);
    return {
      schemaVersion: RUN_SCHEMA_VERSION,
      protocol: EVENT_PROTOCOL,
      runId: sanitizeText(record.id, 120),
      branch: sanitizeText(record.context.branch, 120),
      commit: sanitizeText(record.context.commit, 80),
      lab: record.context.lab,
      role: VALID_ROLES.has(record.context.variant) ? record.context.variant : "custom",
      startTime: isoTime(record.startedAt, "startTime"),
      endTime: isoTime(record.endedAt, "endTime"),
      prediction: sanitizeJsonValue(record.prediction),
      events: record.events.map((event, index) => normalizeEvent(event, index)),
      stableOutput: record.stableOutput.map((line) => sanitizeText(line, 500)).filter(Boolean),
      finalResult: record.result,
      predictionComparison: sanitizeJsonValue(record.predictionAssessment),
      lifecycle: sanitizeJsonValue(record.lifecycle),
      exitCode: record.exitCode,
      stopped: record.stopped,
      error: sanitizeText(record.error, 500),
      exportedAt: isoTime(exportedAt, "exportedAt")
    };
  }

  function serializeRunJson(run, exportedAt = Date.now()) {
    return `${JSON.stringify(exportRun(run, exportedAt), null, 2)}\n`;
  }

  function markdownValue(value) {
    const clean = sanitizeText(value, 2000);
    return clean ? clean.replace(/`/g, "ˋ").replace(/^([#>*+-])/gm, "\\$1") : "未提供";
  }

  function comparisonLines(comparison) {
    if (!comparison || typeof comparison !== "object") return ["- 未保存预测或无法生成对照。"];
    const groups = [
      ["预测正确", comparison.correct],
      ["预测遗漏", comparison.omissions],
      ["实际未出现", comparison.missing],
      ["结果相反", comparison.opposites],
      ["额外关键事件", comparison.extraEvents],
      ["无法判断", comparison.unknown]
    ];
    const lines = [`- 总体：${markdownValue(comparison.overallLabel || comparison.overall)}`];
    for (const [label, items] of groups) {
      if (!Array.isArray(items) || items.length === 0) continue;
      lines.push(`- ${label}：`);
      items.slice(0, 128).forEach((item) => lines.push(`  - ${markdownValue(item?.text || item)}`));
    }
    return lines;
  }

  function buildRunMarkdown(run) {
    const data = exportRun(run);
    const prediction = data.prediction;
    const eventLines = data.events.length
      ? data.events.map((event, index) => `${index + 1}. \`${event.lab}:${event.step}\` · ${event.status} · ${markdownValue(event.detail)}`)
      : ["- 没有结构化事件。"];
    return [
      "# OS 实验运行总结",
      "",
      `- 格式：\`${data.schemaVersion}\``,
      `- 事件协议：\`${data.protocol}\``,
      `- 运行 ID：\`${markdownValue(data.runId)}\``,
      `- 分支：\`${markdownValue(data.branch)}\``,
      `- 提交：\`${markdownValue(data.commit)}\``,
      `- 实验：\`${data.lab}\``,
      `- 角色：\`${data.role}\``,
      `- 开始时间：${data.startTime}`,
      `- 结束时间：${data.endTime}`,
      `- 最终结果：\`${data.finalResult}\``,
      "",
      "## 学生预测",
      "",
      prediction ? `- 预测依据：${markdownValue(prediction.reasoning)}` : "- 未保存预测。",
      ...(prediction ? [
        `- 预计构建：${markdownValue(prediction.expectedBuild)}`,
        `- 预计运行：${markdownValue(prediction.expectedRun)}`,
        `- 预计 PASS：${prediction.expectedPass === true ? "会出现" : prediction.expectedPass === false ? "不会出现" : "无法判断"}`,
        `- 预计关键事件：${Array.isArray(prediction.expectedEvents) && prediction.expectedEvents.length ? prediction.expectedEvents.map((item) => `\`${markdownValue(item)}\``).join("、") : "未选择"}`
      ] : []),
      "",
      "## 结构化事件",
      "",
      ...eventLines,
      "",
      "## 预测与实际对照",
      "",
      ...comparisonLines(data.predictionComparison),
      "",
      "> 本文件由本地页面生成，不包含完整终端日志，也不会由页面自动上传。",
      ""
    ].join("\n");
  }

  function parseRunJson(source) {
    if (typeof source !== "string") throw transferError("invalid_input", "导入内容必须是 JSON 文本。");
    if (byteLength(source) > MAX_IMPORT_BYTES) {
      throw transferError("file_too_large", `导入文件超过 ${Math.floor(MAX_IMPORT_BYTES / 1024)} KiB 限制。`);
    }
    let data;
    try {
      data = JSON.parse(source);
    } catch (_) {
      throw transferError("invalid_json", "运行记录不是有效 JSON。");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw transferError("invalid_run", "运行记录顶层必须是对象。");
    }
    if (data.schemaVersion !== RUN_SCHEMA_VERSION) {
      throw transferError("unsupported_schema", `不兼容的运行记录版本：${sanitizeText(data.schemaVersion, 80) || "缺失"}；当前仅支持 ${RUN_SCHEMA_VERSION}。`);
    }
    if (data.protocol !== EVENT_PROTOCOL) {
      throw transferError("unsupported_event_protocol", `不兼容的事件协议：${sanitizeText(data.protocol, 80) || "缺失"}；当前仅支持 ${EVENT_PROTOCOL}。`);
    }
    if (!Array.isArray(data.events)) throw transferError("invalid_events", "events 必须是数组。");
    if (data.events.length > MAX_EVENTS) throw transferError("too_many_events", `单次运行最多导入 ${MAX_EVENTS} 个事件。`);

    const runId = sanitizeText(data.runId, 120);
    const branch = sanitizeText(data.branch, 120);
    const commit = sanitizeText(data.commit, 80) || "unknown";
    const lab = sanitizeText(data.lab, 20).toLowerCase();
    const role = sanitizeText(data.role, 20).toLowerCase();
    if (!runId) throw transferError("invalid_run", "runId 不能为空。");
    if (!branch) throw transferError("invalid_run", "branch 不能为空。");
    if (!VALID_LABS.has(lab)) throw transferError("invalid_run", "lab 不受支持。");
    if (!VALID_ROLES.has(role)) throw transferError("invalid_run", "role 必须是 starter、solution 或 custom。");
    if (!VALID_RESULTS.has(data.finalResult)) throw transferError("invalid_run", "finalResult 不受支持。");
    const startTime = Date.parse(isoTime(data.startTime, "startTime"));
    const endTime = Date.parse(isoTime(data.endTime, "endTime"));
    if (endTime < startTime) throw transferError("invalid_time", "endTime 不能早于 startTime。");
    const events = data.events.map(normalizeEvent);
    const stableOutput = Array.isArray(data.stableOutput)
      ? data.stableOutput.slice(-60).map((line) => sanitizeText(line?.line ?? line, 500)).filter(Boolean)
      : [];

    const history = historyApi();
    if (!history?.createRunRecord) throw transferError("history_unavailable", "运行历史模块不可用。");
    const record = history.createRunRecord({
      id: runId,
      context: { branch, commit, lab, variant: role, variantLabel: role },
      prediction: data.prediction && typeof data.prediction === "object"
        ? sanitizeJsonValue(data.prediction)
        : null,
      events,
      stableOutput,
      lifecycle: data.lifecycle && typeof data.lifecycle === "object"
        ? sanitizeJsonValue(data.lifecycle)
        : {},
      startedAt: startTime,
      endedAt: endTime,
      exitCode: Number.isInteger(data.exitCode) ? data.exitCode : null,
      stopped: Boolean(data.stopped),
      error: sanitizeText(data.error, 500)
    });
    const normalized = history.normalizeStoredRunRecord?.(record);
    if (!normalized) throw transferError("invalid_run", "导入内容无法转换为安全运行记录。");
    return normalized;
  }

  function uniqueRunId(baseId, existingIds, now = Date.now()) {
    const base = sanitizeText(baseId, 90).replace(/[^A-Za-z0-9_.-]/g, "-") || "imported-run";
    const suffix = Math.max(0, Number(now) || Date.now()).toString(36);
    let candidate = `${base}-import-${suffix}`.slice(0, 120);
    let counter = 2;
    while (existingIds.has(candidate)) {
      candidate = `${base}-import-${suffix}-${counter}`.slice(0, 120);
      counter += 1;
    }
    return candidate;
  }

  function importRunJson(source, options = {}) {
    let record = parseRunJson(source);
    const existingRuns = Array.isArray(options.existingRuns) ? options.existingRuns : [];
    const existingIds = new Set(existingRuns.map((run) => sanitizeText(run?.id, 120)).filter(Boolean));
    const duplicate = existingIds.has(record.id);
    if (!duplicate) return { record, duplicate: false, action: "imported" };

    const strategy = options.duplicateStrategy || "error";
    if (strategy === "error") {
      throw transferError("duplicate_run_id", `运行 ID ${record.id} 已存在，请选择覆盖或生成新 ID。`);
    }
    if (strategy === "overwrite") return { record, duplicate: true, action: "overwritten" };
    if (strategy !== "new-id") throw transferError("invalid_duplicate_strategy", "重复记录处理方式无效。");

    const history = historyApi();
    const originalRunId = record.id;
    const newId = uniqueRunId(originalRunId, existingIds, options.now);
    record = history.createRunRecord({
      ...record,
      id: newId,
      context: record.context,
      prediction: record.prediction,
      events: record.events,
      stableOutput: record.stableOutput,
      lifecycle: record.lifecycle,
      startedAt: record.startedAt,
      endedAt: record.endedAt
    });
    return { record, duplicate: true, action: "renamed", originalRunId };
  }

  function runFilename(run, extension = "json") {
    const record = normalizedRun(run);
    const safeId = sanitizeText(record.id, 80).replace(/[^A-Za-z0-9_.-]/g, "-") || "os-demo-run";
    return `${safeId}.${extension === "md" ? "md" : "json"}`;
  }

  const api = {
    EVENT_PROTOCOL,
    MAX_EVENTS,
    MAX_IMPORT_BYTES,
    RUN_SCHEMA_VERSION,
    buildRunMarkdown,
    byteLength,
    exportRun,
    importRunJson,
    parseRunJson,
    runFilename,
    sanitizeText,
    serializeRunJson,
    uniqueRunId
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsRunTransfer = api;
})();
