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

  dom.refresh.addEventListener("click", load);
  [dom.lab, dom.variant, dom.role].forEach((control) => control.addEventListener("change", load));
  load();
})();
