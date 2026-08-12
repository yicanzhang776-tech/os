(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const AGENT_CONTRACT_VERSION = "os-tutor.agent/v1";
  const AGENT_CONSENT_KEY = "os-teaching-agent-consent-v1";
  const MAX_AGENT_MESSAGE_LENGTH = 4000;
  const ERROR_MESSAGES = Object.freeze({
    message_required: "请输入要讨论的问题。",
    message_too_long: "问题最多 4000 个字符，请精简后重试。",
    model_not_configured: "教学助教尚未配置模型服务，请联系教师配置后重试。",
    model_auth_failed: "模型服务认证失败，请联系教师检查服务端配置。",
    model_rate_limited: "模型服务当前请求较多，请稍后再试。",
    model_timeout: "模型服务响应超时，请稍后重试。",
    model_request_failed: "模型服务拒绝了本次请求，请稍后重试。",
    model_upstream_error: "模型服务暂时异常，请稍后重试。",
    model_unavailable: "暂时无法连接模型服务，请检查网络后重试。",
    context_changed: "提问期间分支或提交发生变化，请确认当前实验后重新提问。",
    context_unavailable: "暂时无法读取当前实验上下文，请刷新页面后重试。",
    run_busy: "已有构建或 QEMU 任务运行中，请等待完成后重试。",
    consent_required: "请先阅读数据告知并明确同意。",
    invalid_agent_response: "教学助教返回了无法识别的结果，请稍后重试。",
    request_failed: "教学助教请求未完成，请稍后重试。"
  });
  class AgentClientError extends Error {
    constructor(code) { super(agentErrorMessage(code)); this.name = "AgentClientError"; this.code = code; }
  }
  function agentErrorMessage(code) { return ERROR_MESSAGES[code] || ERROR_MESSAGES.request_failed; }
  function validateAgentMessage(value) {
    if (typeof value !== "string" || value.trim().length === 0) throw new AgentClientError("message_required");
    const message = value.trim();
    if (message.length > MAX_AGENT_MESSAGE_LENGTH) throw new AgentClientError("message_too_long");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message)) throw new AgentClientError("request_failed");
    return message;
  }
  function hasAgentConsent(storage) {
    try { return storage?.getItem(AGENT_CONSENT_KEY) === "accepted"; } catch (_) { return false; }
  }
  function saveAgentConsent(storage) {
    try { storage?.setItem(AGENT_CONSENT_KEY, "accepted"); return storage?.getItem(AGENT_CONSENT_KEY) === "accepted"; } catch (_) { return false; }
  }
  async function requestAgent(value, options = {}) {
    const message = validateAgentMessage(value);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new AgentClientError("request_failed");
    let response;
    try {
      response = await fetchImpl("/api/agent", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ message }) });
    } catch (_) { throw new AgentClientError("model_unavailable"); }
    let body;
    try { body = await response.json(); } catch (_) { throw new AgentClientError("invalid_agent_response"); }
    if (!response.ok || body?.ok !== true) throw new AgentClientError(typeof body?.error?.code === "string" ? body.error.code : "request_failed");
    if (body.contractVersion !== AGENT_CONTRACT_VERSION || typeof body.data?.answer !== "string" || body.data.answer.trim().length === 0) {
      throw new AgentClientError("invalid_agent_response");
    }
    return Object.freeze({ answer: body.data.answer, meta: body.meta && typeof body.meta === "object" ? { ...body.meta } : {} });
  }
  return Object.freeze({ AGENT_CONSENT_KEY, AGENT_CONTRACT_VERSION, AgentClientError, MAX_AGENT_MESSAGE_LENGTH, agentErrorMessage, hasAgentConsent, requestAgent, saveAgentConsent, validateAgentMessage });
});
