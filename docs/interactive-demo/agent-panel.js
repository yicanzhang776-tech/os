(function () {
  "use strict";
  const api = window.OsTeachingAgentClient;
  if (!api) return;
  const form = document.getElementById("agent-form");
  const consent = document.getElementById("agent-consent");
  const message = document.getElementById("agent-message");
  const submit = document.getElementById("agent-submit");
  const clear = document.getElementById("agent-clear");
  const answer = document.getElementById("agent-answer");
  const status = document.getElementById("agent-status");
  const context = document.getElementById("agent-context");
  const model = document.getElementById("agent-model-status");
  if (!form || !consent || !message || !submit || !clear || !answer || !status || !context || !model) return;
  function sessionStore() { try { return window.sessionStorage; } catch (_) { return null; } }
  function setStatus(text, state) { status.textContent = text; status.dataset.status = state || "idle"; }
  async function loadContext() {
    try {
      const response = await fetch("/api/context", { headers: { accept: "application/json" } });
      const body = await response.json();
      context.textContent = `${body.context?.branch || "unknown"} · ${body.context?.lab || "未定位 Lab"} · ${body.context?.variant || "custom"}`;
      model.textContent = body.agent?.configured ? `${body.agent.model} 已配置` : `${body.agent?.model || "ark-code-latest"} 未配置`;
      model.dataset.configured = String(body.agent?.configured === true);
    } catch (_) { context.textContent = "当前上下文暂不可用"; model.textContent = "模型配置状态未知"; }
  }
  consent.checked = api.hasAgentConsent(sessionStore());
  consent.addEventListener("change", () => {
    if (consent.checked && !api.saveAgentConsent(sessionStore())) {
      consent.checked = false;
      setStatus("浏览器阻止了会话级同意记录，当前无法发送问题。", "error");
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!consent.checked || !api.hasAgentConsent(sessionStore())) { setStatus(api.agentErrorMessage("consent_required"), "error"); consent.focus(); return; }
    submit.disabled = true; answer.textContent = ""; setStatus("正在请求教学助教分析受限证据……", "busy");
    try {
      const result = await api.requestAgent(message.value);
      answer.textContent = result.answer;
      setStatus("回答完成。模型建议仅作学习提示，请用代码和运行证据验证。", "success");
    } catch (error) { setStatus(api.agentErrorMessage(error?.code), "error"); }
    finally { submit.disabled = false; }
  });
  clear.addEventListener("click", () => { answer.textContent = ""; setStatus("已清空当前显示。", "idle"); });
  loadContext();
})();
