(function () {
  "use strict";

  const api = window.OsTeachingAgentClient;
  const chat = window.OsTeachingAgentChatState;
  const entry = window.OsTeachingAgentEntryState;
  const form = document.getElementById("agent-page-form");
  const message = document.getElementById("agent-page-message");
  const submit = document.getElementById("agent-page-submit");
  const clear = document.getElementById("agent-page-clear");
  const newQuestion = document.getElementById("agent-page-new");
  const thread = document.getElementById("agent-page-thread");
  const history = document.getElementById("agent-page-history");
  const lab = document.getElementById("agent-page-lab");
  const status = document.getElementById("agent-page-status");
  const service = document.querySelector(".agent-page-service");
  const serviceStatus = document.getElementById("agent-service-status");
  const configForm = document.getElementById("agent-config-form");
  const apiKey = document.getElementById("agent-api-key");
  const configSubmit = document.getElementById("agent-config-submit");
  const configChange = document.getElementById("agent-config-change");
  const configClear = document.getElementById("agent-config-clear");
  const keyVisibility = document.getElementById("agent-key-visibility");
  if (!api || !chat || !entry || !form || !message || !submit || !clear
    || !newQuestion || !thread || !history || !lab || !status || !service
    || !serviceStatus || !configForm || !apiKey || !configSubmit
    || !configChange || !configClear || !keyVisibility) return;

  function sessionStore() {
    try { return window.sessionStorage; } catch (_) { return null; }
  }

  function messageId(role) {
    return `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  const requestGate = chat.createRequestGate();
  let transcript = chat.loadTranscript(sessionStore());
  let busy = false;
  let configBusy = true;
  let agentConfig = Object.freeze({ configured: false, credentialSource: "none" });
  let pendingConsentPrompt = null;

  const composerActions = form.querySelector(".agent-page-composer-actions");
  const actionGroup = composerActions?.querySelector("div");
  if (!composerActions || !actionGroup) return;

  const characterCount = document.createElement("span");
  characterCount.className = "agent-page-character-count";
  characterCount.setAttribute("aria-live", "off");
  composerActions.insertBefore(characterCount, actionGroup);

  const consentPanel = document.createElement("section");
  consentPanel.className = "agent-page-consent";
  consentPanel.hidden = true;
  consentPanel.setAttribute("aria-label", "数据告知");
  const consentCopy = document.createElement("p");
  consentCopy.textContent = "将发送当前问题、当前实验标识和少量结构化运行事件。不会发送聊天历史、完整源码、终端日志、密钥或本地绝对路径。";
  const consentButton = document.createElement("button");
  consentButton.type = "button";
  consentButton.className = "agent-page-consent-action";
  consentButton.textContent = "同意并发送";
  consentPanel.append(consentCopy, consentButton);
  form.insertBefore(consentPanel, message);

  function createAction(id, label) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.textContent = label;
    return button;
  }

  const copyLatest = createAction("agent-page-copy", "复制回答");
  const retry = createAction("agent-page-retry", "重试");
  actionGroup.insertBefore(copyLatest, clear);
  actionGroup.insertBefore(retry, clear);

  function setPageState(nextState, text) {
    document.documentElement.setAttribute("data-agent-state", nextState);
    status.dataset.status = nextState;
    status.textContent = text;
  }

  function updateCharacterCount() {
    characterCount.textContent = `${message.value.length} / ${api.MAX_AGENT_MESSAGE_LENGTH}`;
  }

  function latestAssistant() {
    return [...transcript].reverse().find((item) => item.role === "assistant" && item.status === "complete") || null;
  }

  function replaceLatestUserStatus(nextStatus) {
    const index = transcript.findLastIndex((item) => item.role === "user");
    if (index < 0) return;
    transcript = transcript.map((item, itemIndex) => itemIndex === index ? { ...item, status: nextStatus } : item);
  }

  function makeEmptyState() {
    const empty = document.createElement("li");
    empty.className = "agent-page-empty";
    const title = document.createElement("strong");
    title.textContent = "从一条可验证的问题开始";
    const copy = document.createElement("span");
    copy.textContent = "描述你看到的现象、预期结果和已经检查过的证据，小内核会给出下一步调试路径。";
    empty.append(title, copy);
    return empty;
  }

  async function copyAnswer(content) {
    try {
      await navigator.clipboard.writeText(content);
      setPageState("idle", "已复制助教回答。请结合代码和运行证据继续验证。");
    } catch (_) {
      setPageState("error", "浏览器未允许复制，请手动选择回答文本。");
    }
  }

  function createMessageRow(item) {
    const row = document.createElement("li");
    row.id = `agent-row-${item.id}`;
    row.className = "agent-page-message";
    row.dataset.messageId = item.id;
    row.dataset.role = item.role;
    row.dataset.status = item.status;

    const label = document.createElement("span");
    label.className = "agent-page-message-label";
    label.textContent = item.role === "user" ? "你" : "小内核助教";
    const body = document.createElement("p");
    body.className = "agent-page-message-content";
    body.textContent = item.content;
    row.append(label, body);

    if (item.role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "agent-page-message-actions";
      if (item.status === "complete") {
        const copy = createAction("", "复制");
        copy.removeAttribute("id");
        copy.addEventListener("click", () => copyAnswer(item.content));
        actions.append(copy);
      } else if (item.status === "failed") {
        const retryButton = createAction("", "重试这个问题");
        retryButton.removeAttribute("id");
        retryButton.addEventListener("click", retryLatest);
        actions.append(retryButton);
      }
      if (actions.childElementCount > 0) row.append(actions);
    }
    return row;
  }

  function renderHistory() {
    history.replaceChildren();
    const userMessages = transcript.filter((item) => item.role === "user");
    if (userMessages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "agent-page-history-empty";
      empty.textContent = "提问后会在这里生成定位记录";
      history.append(empty);
      return;
    }
    for (const [index, item] of userMessages.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${String(index + 1).padStart(2, "0")}  ${item.content}`;
      button.title = item.content;
      button.addEventListener("click", () => document.getElementById(`agent-row-${item.id}`)?.scrollIntoView({ block: "center" }));
      history.append(button);
    }
  }

  function renderTranscript(options = {}) {
    thread.replaceChildren();
    if (transcript.length === 0) thread.append(makeEmptyState());
    else for (const item of transcript) thread.append(createMessageRow(item));
    renderHistory();
    retry.disabled = busy || !chat.lastRetryablePrompt(transcript);
    copyLatest.disabled = busy || !latestAssistant();
    if (options.scrollToEnd && thread.lastElementChild) {
      thread.lastElementChild.scrollIntoView({ block: "nearest" });
    }
  }

  function persist(options) {
    chat.saveTranscript(sessionStore(), transcript);
    renderTranscript(options);
  }

  function setBusy(nextBusy) {
    busy = nextBusy === true;
    message.disabled = busy || configBusy || !agentConfig.configured;
    submit.disabled = busy || configBusy || !agentConfig.configured;
    consentButton.disabled = busy;
    clear.disabled = false;
    retry.disabled = busy || !chat.lastRetryablePrompt(transcript);
    copyLatest.disabled = busy || !latestAssistant();
  }

  function renderAgentConfig(options = {}) {
    const configured = agentConfig.configured === true;
    const source = agentConfig.credentialSource;
    service.dataset.configured = String(configured);
    configForm.hidden = configured && options.showForm !== true;
    configChange.hidden = !configured || !configForm.hidden;
    configClear.hidden = source !== "session";
    configSubmit.disabled = configBusy;
    configChange.disabled = configBusy;
    configClear.disabled = configBusy;
    apiKey.disabled = configBusy;
    keyVisibility.disabled = configBusy;
    if (configBusy) serviceStatus.textContent = options.status || "正在检查本地配置…";
    else if (options.status) serviceStatus.textContent = options.status;
    else if (configured) {
      const sourceLabel = source === "session" ? "本次服务进程" : "启动环境变量";
      serviceStatus.textContent = `${agentConfig.model} · ${sourceLabel}已激活`;
    } else {
      serviceStatus.textContent = "尚未激活 · 输入 Key 后即可提问";
    }
    setBusy(busy);
  }

  async function loadAgentConfig() {
    configBusy = true;
    renderAgentConfig();
    try {
      agentConfig = await api.getAgentConfig();
      configBusy = false;
      renderAgentConfig();
    } catch (error) {
      agentConfig = Object.freeze({ configured: false, credentialSource: "none" });
      configBusy = false;
      renderAgentConfig({ status: api.agentErrorMessage(error?.code) });
      setPageState("error", api.agentErrorMessage(error?.code));
    }
  }

  async function configureAgent(event) {
    event.preventDefault();
    if (configBusy) return;
    configBusy = true;
    renderAgentConfig({ showForm: true, status: "正在激活当前 Node 服务进程…" });
    try {
      agentConfig = await api.configureAgentKey(apiKey.value);
      apiKey.value = "";
      apiKey.type = "password";
      keyVisibility.textContent = "显示";
      keyVisibility.setAttribute("aria-label", "显示 Key");
      configBusy = false;
      renderAgentConfig({ status: `${agentConfig.model} · 已在当前服务进程中激活` });
      setPageState("idle", "模型服务已激活，可以发送问题。Key 不会写入本地文件。");
      message.focus();
    } catch (error) {
      configBusy = false;
      renderAgentConfig({ showForm: true, status: api.agentErrorMessage(error?.code) });
      setPageState("error", api.agentErrorMessage(error?.code));
      apiKey.focus();
    }
  }

  async function clearConfiguredKey() {
    if (configBusy) return;
    configBusy = true;
    renderAgentConfig({ status: "正在清除本次服务进程中的 Key…" });
    try {
      agentConfig = await api.clearAgentKey();
      configBusy = false;
      renderAgentConfig({ status: agentConfig.configured
        ? `${agentConfig.model} · 已恢复启动环境变量配置`
        : "本次 Key 已清除 · 停止服务后不会留下凭据" });
      setPageState("idle", agentConfig.configured
        ? "已恢复使用启动环境变量中的模型配置。"
        : "已清除本次 Key，模型请求已停用。");
    } catch (error) {
      configBusy = false;
      renderAgentConfig({ status: api.agentErrorMessage(error?.code) });
      setPageState("error", api.agentErrorMessage(error?.code));
    }
  }

  function requestConsent(prompt) {
    pendingConsentPrompt = prompt;
    consentPanel.hidden = false;
    setPageState("error", api.agentErrorMessage("consent_required"));
    consentButton.focus();
  }

  async function loadContext() {
    try {
      const response = await fetch("/api/context", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("context_unavailable");
      const body = await response.json();
      const context = body?.context || {};
      lab.textContent = `${context.lab || "未知 Lab"} / ${context.variant || "custom"} / ${context.branch || "unknown"}`;
    } catch (_) {
      lab.textContent = "当前上下文暂不可用";
    }
  }

  async function sendPrompt(rawPrompt, options = {}) {
    if (busy) return;
    let prompt;
    try {
      prompt = api.validateAgentMessage(rawPrompt);
    } catch (error) {
      setPageState("error", api.agentErrorMessage(error?.code));
      if (error?.code === "model_auth_failed" || error?.code === "model_not_configured") {
        agentConfig = Object.freeze({ ...agentConfig, configured: false });
        renderAgentConfig({ showForm: true, status: api.agentErrorMessage(error.code) });
      }
      message.focus();
      return;
    }

    if (!options.consentGranted && !api.hasAgentConsent(sessionStore())) {
      requestConsent(prompt);
      return;
    }

    pendingConsentPrompt = null;
    consentPanel.hidden = true;
    transcript = chat.appendMessage(transcript, {
      id: messageId("user"), role: "user", content: prompt, status: "pending"
    });
    message.value = "";
    updateCharacterCount();
    persist({ scrollToEnd: true });
    setBusy(true);
    setPageState("sending", "正在结合当前实验的受限证据分析…");
    const requestToken = requestGate.begin();

    try {
      const result = await api.requestAgent(prompt);
      if (!requestGate.isCurrent(requestToken)) return;
      replaceLatestUserStatus("complete");
      transcript = chat.appendMessage(transcript, {
        id: messageId("assistant"), role: "assistant", content: result.answer, status: "complete"
      });
      setPageState("idle", "回答完成。请结合代码和运行证据验证建议。");
    } catch (error) {
      if (!requestGate.isCurrent(requestToken)) return;
      replaceLatestUserStatus("failed");
      transcript = chat.appendMessage(transcript, {
        id: messageId("assistant"), role: "assistant", content: api.agentErrorMessage(error?.code), status: "failed"
      });
      setPageState("error", api.agentErrorMessage(error?.code));
    } finally {
      if (requestGate.isCurrent(requestToken)) {
        setBusy(false);
        persist({ scrollToEnd: true });
      }
    }
  }

  function retryLatest() {
    const prompt = chat.lastRetryablePrompt(transcript);
    if (prompt) sendPrompt(prompt);
  }

  function clearConversation() {
    requestGate.invalidate();
    transcript = [];
    pendingConsentPrompt = null;
    chat.clearTranscript(sessionStore());
    thread.replaceChildren();
    thread.append(makeEmptyState());
    message.value = "";
    consentPanel.hidden = true;
    setBusy(false);
    updateCharacterCount();
    renderHistory();
    setPageState("idle", "已清空当前浏览器会话记录。");
    message.focus();
  }

  consentButton.addEventListener("click", () => {
    if (!api.saveAgentConsent(sessionStore())) {
      setPageState("error", "浏览器阻止了会话级同意记录，当前无法发送问题。");
      return;
    }
    const prompt = pendingConsentPrompt;
    consentPanel.hidden = true;
    setPageState("idle", "数据边界已确认，可以发送问题。");
    if (prompt) sendPrompt(prompt, { consentGranted: true });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendPrompt(message.value);
  });
  message.addEventListener("input", updateCharacterCount);
  message.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  retry.addEventListener("click", retryLatest);
  copyLatest.addEventListener("click", () => {
    const latest = latestAssistant();
    if (latest) copyAnswer(latest.content);
  });
  clear.addEventListener("click", clearConversation);
  newQuestion.addEventListener("click", () => {
    message.focus();
    form.scrollIntoView({ block: "end" });
  });
  configForm.addEventListener("submit", configureAgent);
  configChange.addEventListener("click", () => {
    renderAgentConfig({ showForm: true, status: "输入新的 Key 将替换当前进程内凭据。" });
    apiKey.focus();
  });
  configClear.addEventListener("click", clearConfiguredKey);
  keyVisibility.addEventListener("click", () => {
    const reveal = apiKey.type === "password";
    apiKey.type = reveal ? "text" : "password";
    keyVisibility.textContent = reveal ? "隐藏" : "显示";
    keyVisibility.setAttribute("aria-label", reveal ? "隐藏 Key" : "显示 Key");
    apiKey.focus();
  });

  document.documentElement.setAttribute("data-agent-state", "idle");
  renderTranscript();
  updateCharacterCount();
  loadContext();
  loadAgentConfig().then(() => {
    const pendingPrompt = entry.consumePendingPrompt(sessionStore());
    if (!pendingPrompt) return;
    if (agentConfig.configured) {
      api.saveAgentConsent(sessionStore());
      sendPrompt(pendingPrompt, { consentGranted: true });
      return;
    }
    message.value = pendingPrompt;
    updateCharacterCount();
    setPageState("error", "问题已带到助教页，请先激活本地模型服务。");
    apiKey.focus();
  });
})();
