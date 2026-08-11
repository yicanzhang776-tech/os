(function initRunAdminModel(root, factory) {
  "use strict";
  const catalog = typeof module === "object" && module.exports
    ? require("../interactive-demo/event-catalog.js")
    : root?.OsEventCatalog;
  const api = factory(catalog);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsRunAdminModel = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createRunAdminModel(catalog) {
  "use strict";

  function runOf(stored) {
    return stored?.run && typeof stored.run === "object" ? stored.run : null;
  }

  function filterRunRecords(records, filters = {}) {
    const lab = String(filters.lab || "all");
    const role = String(filters.role || "all");
    const result = String(filters.result || "all");
    return (Array.isArray(records) ? records : []).filter((stored) => {
      const run = runOf(stored);
      if (!run) return false;
      return (lab === "all" || run.lab === lab)
        && (role === "all" || run.role === role)
        && (result === "all" || run.finalResult === result);
    });
  }

  function durationMs(run) {
    const start = Date.parse(run?.startTime || "");
    const end = Date.parse(run?.endTime || "");
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
  }

  function eventTimeline(run) {
    let previous = null;
    return (Array.isArray(run?.events) ? run.events : []).map((event, index) => {
      const knowledge = catalog?.resolveEventKnowledge?.(event) || null;
      const timestamp = Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : null;
      const deltaMs = previous !== null && timestamp !== null ? Math.max(0, timestamp - previous) : null;
      if (timestamp !== null) previous = timestamp;
      return {
        index,
        name: knowledge?.eventName || event.step || `event-${index + 1}`,
        knowledge: knowledge?.knowledge || "未登记知识点",
        lab: event.lab,
        step: event.step,
        status: event.status,
        source: event.source,
        timestamp,
        deltaMs,
        detail: event.detail || event.step || ""
      };
    });
  }

  function summarizeRun(stored) {
    const run = runOf(stored);
    if (!run) return null;
    return {
      runId: run.runId,
      lab: run.lab,
      role: run.role,
      branch: run.branch,
      commit: String(run.commit || "unknown").slice(0, 12),
      startTime: run.startTime,
      endTime: run.endTime,
      durationMs: durationMs(run),
      eventCount: Array.isArray(run.events) ? run.events.length : 0,
      finalResult: run.finalResult,
      predictionResult: run.predictionComparison?.overallLabel || run.predictionComparison?.overall || "无法判断",
      feedbackId: stored.feedbackId || null,
      receiptId: stored.receiptId,
      receivedAt: stored.receivedAt,
      events: eventTimeline(run)
    };
  }

  function summarizeRunRecords(records) {
    const runs = filterRunRecords(records).map(summarizeRun).filter(Boolean);
    return { count: runs.length, runs };
  }

  function safeCsvValue(value) {
    let text = String(value ?? "").replace(/\r\n?/g, "\n");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportRunJson(records, exportedAt = new Date()) {
    const safe = filterRunRecords(records);
    return `${JSON.stringify({
      protocol: "os-demo.run.collection/v1",
      exportedAt: exportedAt.toISOString(),
      count: safe.length,
      records: safe
    }, null, 2)}\n`;
  }

  function exportRunCsv(records) {
    const header = [
      "runId", "lab", "role", "branch", "commit", "startTime", "endTime",
      "durationMs", "eventCount", "finalResult", "predictionComparison", "feedbackId", "receiptId"
    ];
    const rows = filterRunRecords(records).map((stored) => {
      const summary = summarizeRun(stored);
      return [
        summary.runId, summary.lab, summary.role, summary.branch, summary.commit,
        summary.startTime, summary.endTime, summary.durationMs, summary.eventCount,
        summary.finalResult, summary.predictionResult, summary.feedbackId || "", summary.receiptId
      ].map(safeCsvValue).join(",");
    });
    return [`\uFEFF${header.map(safeCsvValue).join(",")}`, ...rows, ""].join("\n");
  }

  function markdownText(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, "[已移除HTML]")
      .replace(/^([#>*+-])/gm, "\\$1")
      .replace(/`/g, "ˋ")
      .slice(0, 1000) || "未提供";
  }

  function exportRunMarkdown(records, exportedAt = new Date()) {
    const summaries = filterRunRecords(records).map(summarizeRun).filter(Boolean);
    const body = summaries.length ? summaries.flatMap((run) => [
      `## ${markdownText(run.runId)} · ${run.lab}/${run.role}`,
      "",
      `- 分支：\`${markdownText(run.branch)}\``,
      `- 提交：\`${markdownText(run.commit)}\``,
      `- 开始：${run.startTime}`,
      `- 时长：${run.durationMs} ms`,
      `- 事件：${run.eventCount}`,
      `- 最终结果：\`${run.finalResult}\``,
      `- 预测对照：${markdownText(run.predictionResult)}`,
      `- 关联评价：${markdownText(run.feedbackId || "未关联")}`,
      "",
      "### 脱敏事件时间线",
      "",
      ...(run.events.length ? run.events.map((event, index) => (
        `${index + 1}. ${markdownText(event.name)} · ${markdownText(event.knowledge)} · ${event.status}`
        + `${event.deltaMs === null ? "" : ` · +${event.deltaMs} ms`}`
      )) : ["- 没有结构化事件。"]),
      ""
    ]) : ["当前筛选条件下没有运行记录。", ""];
    return [
      "# OS 实验自愿提交运行记录汇总",
      "",
      `- 导出时间：${exportedAt.toISOString()}`,
      `- 记录数量：${summaries.length}`,
      "- 说明：这些记录由学生明确同意后提交，不用于自动评分或排名。",
      "",
      ...body
    ].join("\n");
  }

  return Object.freeze({
    durationMs,
    eventTimeline,
    exportRunCsv,
    exportRunJson,
    exportRunMarkdown,
    filterRunRecords,
    summarizeRun,
    summarizeRunRecords
  });
});
