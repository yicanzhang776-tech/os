(function () {
  "use strict";

  const api = window.OsTeachingAgentClient;
  const chat = window.OsTeachingAgentChatState;
  if (!api || !chat) return;

  const form = document.getElementById("agent-form");
  const consent = document.getElementById("agent-consent");
  const disclosure = document.querySelector(".agent-consent-disclosure");
  const message = document.getElementById("agent-message");
  const submit = document.getElementById("agent-submit");
  const retry = document.getElementById("agent-retry");
  const copy = document.getElementById("agent-copy");
  const clear = document.getElementById("agent-clear");
  const answer = document.getElementById("agent-answer");
  const thread = document.getElementById("agent-thread");
  const empty = document.getElementById("agent-empty");
  const count = document.getElementById("agent-character-count");
  const status = document.getElementById("agent-status");
  const context = document.getElementById("agent-context");
  const model = document.getElementById("agent-model-status");
  if (!form || !consent || !message || !submit || !retry || !copy || !clear || !answer || !thread || !empty || !count || !status || !context || !model) return;

  function sessionStore() { try { return window.sessionStorage; } catch (_) { return null; } }
  function setStatus(text, state) { status.textContent = text; status.dataset.status = state || "idle"; }
  function messageId(role) { return `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
  let transcript = chat.loadTranscript(sessionStore());
  let busy = false;
  const requestGate = chat.createRequestGate();

  function latestAssistant() {
    return [...transcript].reverse().find((item) => item.role === "assistant" && item.status === "complete") || null;
  }

  function renderTranscript() {
    const rows = new Map([...thread.children].map((row) => [row.dataset.messageId, row]));
    const messageIds = new Set(transcript.map((item) => item.id));
    for (const row of [...thread.children]) {
      if (!messageIds.has(row.dataset.messageId)) row.remove();
    }
    for (const item of transcript) {
      let row = rows.get(item.id);
      const isNew = !row;
      if (!row) {
        row = document.createElement("li");
        row.className = `agent-message agent-message-${item.role}`;
        row.dataset.messageId = item.id;
        const label = document.createElement("span");
        label.className = "agent-message-label";
        label.textContent = item.role === "user" ? "你" : "助教";
        const content = document.createElement(item.role === "assistant" ? "pre" : "p");
        row.append(label, content);
      }
      row.dataset.status = item.status;
      const content = row.lastElementChild;
      if (content.textContent !== item.content) content.textContent = item.content;
      if (isNew) thread.append(row);
    }
    empty.hidden = transcript.length > 0;
    retry.disabled = busy || !chat.lastRetryablePrompt(transcript);
    copy.disabled = busy || !latestAssistant();
    answer.scrollTop = answer.scrollHeight;
  }

  function persist() {
    chat.saveTranscript(sessionStore(), transcript);
    renderTranscript();
  }

  function replaceLastUserStatus(nextStatus) {
    let replaced = false;
    transcript = transcript.map((item, index) => {
      if (replaced || item.role !== "user") return item;
      const hasLaterUser = transcript.slice(index + 1).some((candidate) => candidate.role === "user");
      if (hasLaterUser) return item;
      replaced = true;
      return { ...item, status: nextStatus };
    });
  }

  function updateCharacterCount() {
    count.textContent = `${message.value.length} / ${api.MAX_AGENT_MESSAGE_LENGTH}`;
  }

  function setBusy(value) {
    busy = value === true;
    submit.disabled = busy;
    message.disabled = busy;
    renderTranscript();
  }

  async function loadContext() {
    try {
      const response = await fetch("/api/context", { headers: { accept: "application/json" } });
      const body = await response.json();
      context.textContent = `${body.context?.branch || "unknown"} · ${body.context?.lab || "未定位 Lab"} · ${body.context?.variant || "custom"}`;
      model.textContent = body.agent?.configured ? `${body.agent.model} 已配置` : `${body.agent?.model || "ark-code-latest"} 未配置`;
      model.dataset.configured = String(body.agent?.configured === true);
    } catch (_) {
      context.textContent = "当前上下文暂不可用";
      model.textContent = "模型配置状态未知";
    }
  }

  async function sendPrompt(rawPrompt) {
    if (busy) return;
    if (!consent.checked || !api.hasAgentConsent(sessionStore())) {
      disclosure.open = true;
      setStatus(api.agentErrorMessage("consent_required"), "error");
      consent.focus();
      return;
    }
    let prompt;
    try { prompt = api.validateAgentMessage(rawPrompt); }
    catch (error) { setStatus(api.agentErrorMessage(error?.code), "error"); message.focus(); return; }

    transcript = chat.appendMessage(transcript, {
      id: messageId("user"), role: "user", content: prompt, status: "pending"
    });
    message.value = "";
    updateCharacterCount();
    persist();
    setBusy(true);
    setStatus("正在结合当前实验的受限证据分析…", "busy");
    const requestToken = requestGate.begin();
    try {
      const result = await api.requestAgent(prompt);
      if (!requestGate.isCurrent(requestToken)) return;
      replaceLastUserStatus("complete");
      transcript = chat.appendMessage(transcript, {
        id: messageId("assistant"), role: "assistant", content: result.answer, status: "complete"
      });
      setStatus("回答完成。请用代码和运行证据验证建议。", "success");
    } catch (error) {
      if (!requestGate.isCurrent(requestToken)) return;
      replaceLastUserStatus("failed");
      transcript = chat.appendMessage(transcript, {
        id: messageId("assistant"), role: "assistant", content: api.agentErrorMessage(error?.code), status: "failed"
      });
      setStatus(api.agentErrorMessage(error?.code), "error");
    } finally {
      if (requestGate.isCurrent(requestToken)) {
        setBusy(false);
        persist();
      }
    }
  }

  consent.checked = api.hasAgentConsent(sessionStore());
  disclosure.open = !consent.checked;
  renderTranscript();
  updateCharacterCount();

  consent.addEventListener("change", () => {
    if (consent.checked && !api.saveAgentConsent(sessionStore())) {
      consent.checked = false;
      setStatus("浏览器阻止了会话级同意记录，当前无法发送问题。", "error");
    } else if (consent.checked) {
      disclosure.open = false;
      setStatus("数据边界已确认，可以发送问题。", "idle");
    }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); sendPrompt(message.value); });
  message.addEventListener("input", updateCharacterCount);
  message.addEventListener("keydown", (event) => {
    if (chat.isAgentSubmitShortcut(event)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.querySelectorAll("[data-agent-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      message.value = button.dataset.agentPrompt;
      updateCharacterCount();
      message.focus();
    });
  });
  retry.addEventListener("click", () => {
    const prompt = chat.lastRetryablePrompt(transcript);
    if (prompt) sendPrompt(prompt);
  });
  copy.addEventListener("click", async () => {
    const latest = latestAssistant();
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(latest.content);
      setStatus("已复制最近一条助教回答。", "success");
    } catch (_) {
      setStatus("浏览器未允许复制，请手动选择回答文本。", "error");
    }
  });
  clear.addEventListener("click", () => {
    requestGate.invalidate();
    transcript = [];
    chat.clearTranscript(sessionStore());
    setBusy(false);
    setStatus("已清空当前会话显示。", "idle");
  });
  loadContext();
})();
