(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const AGENT_CONTRACT_VERSION = "os-tutor.agent/v1";
  const AGENT_CONFIG_CONTRACT_VERSION = "os-tutor.agent-config/v1";
  const AGENT_HANDOFF_CONTRACT_VERSION = "os-tutor.agent-handoff/v1";
  const AGENT_CONSENT_KEY = "os-teaching-agent-consent-v1";
  const MAX_AGENT_MESSAGE_LENGTH = 4000;
  const ERROR_MESSAGES = Object.freeze({
    message_required: "请输入要讨论的问题。",
    message_too_long: "问题最多 4000 个字符，请精简后重试。",
    model_not_configured: "请先在页面上激活本地模型服务。",
    model_auth_failed: "模型服务认证失败，请重新输入有效的 Key。",
    model_rate_limited: "模型服务当前请求较多，请稍后再试。",
    model_timeout: "模型服务响应超时，请稍后重试。",
    model_request_failed: "模型服务拒绝了本次请求，请稍后重试。",
    model_upstream_error: "模型服务暂时异常，请稍后重试。",
    model_unavailable: "暂时无法连接模型服务，请检查网络后重试。",
    context_changed: "提问期间分支或提交发生变化，请确认当前实验后重新提问。",
    context_unavailable: "暂时无法读取当前实验上下文，请刷新页面后重试。",
    agent_protocol_error: "模型没有遵循教学工具协议，请换一种问法后重试。",
    agent_loop_limit: "工具调用达到安全上限，请缩小问题范围后重试。",
    agent_deadline_exceeded: "工具分析超过时间限制，请稍后重试。",
    agent_tool_output_too_large: "本次教学证据过多，请缩小文件或问题范围。",
    invalid_api_key: "Key 格式无效，请检查后重新输入。",
    config_unavailable: "暂时无法更新本地模型配置，请确认 Node 服务仍在运行。",
    handoff_unavailable: "桌宠带来的问题已过期或已被读取，请重新提交。",
    handoff_invalid: "桌宠转交的问题无效，请重新提交。",
    handoff_capacity: "待处理的问题较多，请稍后重新提交。",
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
  function validateConfigResponse(response, body) {
    if (!response?.ok
      || body?.ok !== true
      || body.contractVersion !== AGENT_CONFIG_CONTRACT_VERSION
      || typeof body.data?.configured !== "boolean"
      || !["none", "environment", "session"].includes(body.data?.credentialSource)
      || typeof body.data?.provider !== "string"
      || typeof body.data?.model !== "string") {
      throw new AgentClientError(typeof body?.error?.code === "string"
        ? body.error.code
        : "config_unavailable");
    }
    return Object.freeze({
      configured: body.data.configured,
      credentialSource: body.data.credentialSource,
      provider: body.data.provider,
      model: body.data.model
    });
  }
  async function requestAgentConfig(method, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new AgentClientError("config_unavailable");
    const request = { method, headers: { accept: "application/json" }, cache: "no-store" };
    if (method === "POST") {
      if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
        throw new AgentClientError("invalid_api_key");
      }
      request.headers["content-type"] = "application/json; charset=utf-8";
      request.body = JSON.stringify({ apiKey: options.apiKey.trim() });
    }
    let response;
    try {
      response = await fetchImpl("/api/agent/config", request);
    } catch (_) {
      throw new AgentClientError("config_unavailable");
    }
    let body;
    try { body = await response.json(); } catch (_) {
      throw new AgentClientError("config_unavailable");
    }
    return validateConfigResponse(response, body);
  }
  function getAgentConfig(options = {}) {
    return requestAgentConfig("GET", options);
  }
  function configureAgentKey(apiKey, options = {}) {
    return requestAgentConfig("POST", { ...options, apiKey });
  }
  function clearAgentKey(options = {}) {
    return requestAgentConfig("DELETE", options);
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
  async function consumeAgentHandoff(token, options = {}) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(token)) {
      throw new AgentClientError("handoff_invalid");
    }
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new AgentClientError("handoff_unavailable");
    let response;
    try {
      response = await fetchImpl("/api/agent/handoff/consume", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ token })
      });
    } catch (_) { throw new AgentClientError("handoff_unavailable"); }
    let body;
    try { body = await response.json(); } catch (_) { throw new AgentClientError("handoff_unavailable"); }
    if (!response.ok || body?.ok !== true) {
      throw new AgentClientError(typeof body?.error?.code === "string" ? body.error.code : "handoff_unavailable");
    }
    if (body.contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION || typeof body.data?.message !== "string") {
      throw new AgentClientError("handoff_invalid");
    }
    return validateAgentMessage(body.data.message);
  }
  return Object.freeze({ AGENT_CONFIG_CONTRACT_VERSION, AGENT_CONSENT_KEY, AGENT_CONTRACT_VERSION, AGENT_HANDOFF_CONTRACT_VERSION, AgentClientError, MAX_AGENT_MESSAGE_LENGTH, agentErrorMessage, clearAgentKey, configureAgentKey, consumeAgentHandoff, getAgentConfig, hasAgentConsent, requestAgent, saveAgentConsent, validateAgentMessage });
});
