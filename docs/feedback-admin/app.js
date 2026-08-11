(function initFeedbackAdminPage() {
  "use strict";

  const model = window.OsFeedbackAdminModel;
  const dom = {
    lab: document.getElementById("filter-lab"),
    variant: document.getElementById("filter-variant"),
    role: document.getElementById("filter-role"),
    refresh: document.getElementById("refresh"),
    count: document.getElementById("feedback-count"),
    status: document.getElementById("status"),
    questions: document.getElementById("question-summary"),
    comments: document.getElementById("feedback-comments"),
    exportJson: document.getElementById("export-json"),
    exportCsv: document.getElementById("export-csv"),
    exportMarkdown: document.getElementById("export-md")
  };
  const runDom = {
    lab: document.getElementById("run-filter-lab"),
    role: document.getElementById("run-filter-role"),
    result: document.getElementById("run-filter-result"),
    refresh: document.getElementById("run-refresh"),
    count: document.getElementById("run-count"),
    status: document.getElementById("run-status"),
    list: document.getElementById("run-record-list"),
    exportJson: document.getElementById("run-export-json"),
    exportCsv: document.getElementById("run-export-csv"),
    exportMarkdown: document.getElementById("run-export-md")
  };

  function clearChildren(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function appendCell(row, text) {
    const cell = document.createElement("td");
    cell.textContent = String(text ?? "");
    row.appendChild(cell);
  }

  function queryString() {
    const params = new URLSearchParams();
    if (dom.lab.value !== "all") params.set("lab", dom.lab.value);
    if (dom.variant.value !== "all") params.set("variant", dom.variant.value);
    if (dom.role.value !== "all") params.set("role", dom.role.value);
    return params.toString();
  }

  function setExportLinks() {
    const query = queryString();
    const suffix = query ? `?${query}` : "";
    dom.exportJson.href = `/api/export.json${suffix}`;
    dom.exportCsv.href = `/api/export.csv${suffix}`;
    dom.exportMarkdown.href = `/api/export.md${suffix}`;
  }

  function render(records) {
    const summary = model.summarizeRecords(records);
    dom.count.textContent = `${summary.count} 份评价`;
    clearChildren(dom.questions);
    for (const question of summary.questions) {
      const row = document.createElement("tr");
      appendCell(row, question.prompt);
      appendCell(row, question.dimension);
      appendCell(row, question.average ?? "暂无");
      appendCell(row, [1, 2, 3, 4, 5].map((score) => `${score}分 ${question.distribution[score]}`).join("；"));
      dom.questions.appendChild(row);
    }
    if (!summary.questions.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "当前筛选条件下暂无结构化评分。";
      row.appendChild(cell);
      dom.questions.appendChild(row);
    }

    clearChildren(dom.comments);
    for (const comment of summary.comments) {
      const article = document.createElement("article");
      const title = document.createElement("h3");
      title.textContent = `${comment.feedbackId} · ${comment.lab}/${comment.variant} · ${comment.role}`;
      article.appendChild(title);
      for (const [label, value] of [
        ["最有帮助", comment.mostHelpful],
        ["仍然困惑", comment.stillConfusing],
        ["改进建议", comment.suggestion]
      ]) {
        const paragraph = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${label}：`;
        paragraph.append(strong, document.createTextNode(value || "未填写"));
        article.appendChild(paragraph);
      }
      dom.comments.appendChild(article);
    }
    if (!summary.comments.length) {
      const empty = document.createElement("p");
      empty.textContent = "当前筛选条件下暂无文字反馈。";
      dom.comments.appendChild(empty);
    }
  }

  async function load() {
    dom.refresh.disabled = true;
    dom.status.textContent = "正在读取本机记录……";
    setExportLinks();
    try {
      const query = queryString();
      const response = await fetch(`/api/feedback${query ? `?${query}` : ""}`, {
        headers: { Accept: "application/json" }
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !Array.isArray(result.records)) {
        throw new Error(result.error || "读取失败");
      }
      render(result.records);
      dom.status.textContent = `已读取 ${result.count} 份本机评价。`;
    } catch (error) {
      clearChildren(dom.questions);
      clearChildren(dom.comments);
      dom.count.textContent = "读取失败";
      dom.status.textContent = `无法读取本机评价：${error.message}`;
    } finally {
      dom.refresh.disabled = false;
    }
  }

  function runQueryString() {
    const params = new URLSearchParams();
    if (runDom.lab.value !== "all") params.set("lab", runDom.lab.value);
    if (runDom.role.value !== "all") params.set("runRole", runDom.role.value);
    if (runDom.result.value !== "all") params.set("result", runDom.result.value);
    return params.toString();
  }

  function setRunExportLinks() {
    const query = runQueryString();
    const suffix = query ? `?${query}` : "";
    runDom.exportJson.href = `/api/runs/export.json${suffix}`;
    runDom.exportCsv.href = `/api/runs/export.csv${suffix}`;
    runDom.exportMarkdown.href = `/api/runs/export.md${suffix}`;
  }

  function appendRunFact(list, label, value) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${label}：`;
    item.append(strong, document.createTextNode(String(value ?? "无法判断")));
    list.appendChild(item);
  }

  function renderRunRecords(records) {
    const summary = window.OsRunAdminModel.summarizeRunRecords(records);
    runDom.count.textContent = `${summary.count} 条运行记录`;
    clearChildren(runDom.list);
    for (const run of summary.runs) {
      const article = document.createElement("article");
      const heading = document.createElement("h3");
      heading.textContent = `${run.runId} · ${run.lab}/${run.role} · ${run.finalResult}`;
      const facts = document.createElement("ul");
      facts.className = "run-facts";
      appendRunFact(facts, "分支", run.branch);
      appendRunFact(facts, "提交", run.commit);
      appendRunFact(facts, "开始时间", run.startTime);
      appendRunFact(facts, "时长", `${run.durationMs} ms`);
      appendRunFact(facts, "结构化事件", run.eventCount);
      appendRunFact(facts, "预测对照", run.predictionResult);
      appendRunFact(facts, "关联教学评价", run.feedbackId || "未关联");
      article.append(heading, facts);

      const details = document.createElement("details");
      const detailsTitle = document.createElement("summary");
      detailsTitle.textContent = "查看脱敏事件时间线";
      const timeline = document.createElement("ol");
      timeline.className = "run-event-timeline";
      for (const event of run.events) {
        const row = document.createElement("li");
        const eventTitle = document.createElement("strong");
        eventTitle.textContent = event.name;
        const eventText = document.createElement("span");
        const delta = event.deltaMs === null ? "" : ` · +${event.deltaMs} ms`;
        const time = event.timestamp === null ? "时间未知" : `${event.timestamp} ms`;
        eventText.textContent = ` · ${event.knowledge} · ${event.status} · ${time}${delta} · ${event.detail}`;
        row.append(eventTitle, eventText);
        timeline.appendChild(row);
      }
      if (!run.events.length) {
        const empty = document.createElement("li");
        empty.textContent = "没有结构化事件。";
        timeline.appendChild(empty);
      }
      details.append(detailsTitle, timeline);
      article.appendChild(details);
      runDom.list.appendChild(article);
    }
    if (!summary.count) {
      const empty = document.createElement("p");
      empty.textContent = "当前筛选条件下没有学生自愿提交的运行记录。";
      runDom.list.appendChild(empty);
    }
  }

  async function loadRunRecords() {
    runDom.refresh.disabled = true;
    runDom.status.textContent = "正在读取本机脱敏运行记录……";
    setRunExportLinks();
    try {
      const query = runQueryString();
      const response = await fetch(`/api/run-records${query ? `?${query}` : ""}`, {
        headers: { Accept: "application/json" }
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !Array.isArray(result.records)) {
        throw new Error(result.error || "读取失败");
      }
      renderRunRecords(result.records);
      runDom.status.textContent = `已读取 ${result.count} 条本机脱敏运行记录。`;
    } catch (error) {
      clearChildren(runDom.list);
      runDom.count.textContent = "读取失败";
      runDom.status.textContent = `无法读取本机运行记录：${error.message}`;
    } finally {
      runDom.refresh.disabled = false;
    }
  }

  dom.refresh.addEventListener("click", load);
  [dom.lab, dom.variant, dom.role].forEach((control) => control.addEventListener("change", load));
  runDom.refresh.addEventListener("click", loadRunRecords);
  [runDom.lab, runDom.role, runDom.result].forEach((control) => control.addEventListener("change", loadRunRecords));
  load();
  loadRunRecords();
})();
