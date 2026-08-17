(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentChatState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const AGENT_TRANSCRIPT_KEY = "os-teaching-agent-transcript-v1";
  const MAX_TRANSCRIPT_MESSAGES = 20;
  const ROLE_LIMITS = Object.freeze({ user: 4000, assistant: 12000 });
  const STATUSES = Object.freeze(["pending", "complete", "failed"]);

  function cleanText(value, limit) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return "";
    return text.slice(0, limit);
  }

  function normalizeMessage(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const role = candidate.role === "user" || candidate.role === "assistant" ? candidate.role : null;
    if (!role) return null;
    const id = cleanText(candidate.id, 80);
    const content = cleanText(candidate.content, ROLE_LIMITS[role]);
    const status = STATUSES.includes(candidate.status) ? candidate.status : "complete";
    if (!id || !content) return null;
    return Object.freeze({ id, role, content, status });
  }

  function normalizeTranscript(candidate) {
    if (!Array.isArray(candidate)) return [];
    return candidate
      .map(normalizeMessage)
      .filter(Boolean)
      .slice(-MAX_TRANSCRIPT_MESSAGES);
  }

  function appendMessage(transcript, message) {
    const normalized = normalizeMessage(message);
    if (!normalized) throw new Error("invalid_agent_message");
    return Object.freeze([...normalizeTranscript(transcript), normalized].slice(-MAX_TRANSCRIPT_MESSAGES));
  }

  function lastRetryablePrompt(transcript) {
    const normalized = normalizeTranscript(transcript);
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const message = normalized[index];
      if (message.role !== "user") continue;
      const answered = normalized.slice(index + 1).some((item) => item.role === "assistant" && item.status === "complete");
      return message.status === "failed" || !answered ? message.content : null;
    }
    return null;
  }

  function loadTranscript(storage) {
    try {
      const raw = storage?.getItem(AGENT_TRANSCRIPT_KEY);
      return raw ? normalizeTranscript(JSON.parse(raw)) : [];
    } catch (_) {
      return [];
    }
  }

  function saveTranscript(storage, transcript) {
    try {
      storage?.setItem(AGENT_TRANSCRIPT_KEY, JSON.stringify(normalizeTranscript(transcript)));
      return typeof storage?.getItem === "function";
    } catch (_) {
      return false;
    }
  }

  function clearTranscript(storage) {
    try {
      storage?.removeItem(AGENT_TRANSCRIPT_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function createRequestGate() {
    let generation = 0;
    return Object.freeze({
      begin() {
        generation += 1;
        return generation;
      },
      invalidate() {
        generation += 1;
      },
      isCurrent(token) {
        return token === generation;
      }
    });
  }

  function isAgentSubmitShortcut(event = {}) {
    return event.key === "Enter"
      && (event.ctrlKey === true || event.metaKey === true)
      && event.isComposing !== true
      && event.keyCode !== 229;
  }

  return Object.freeze({
    AGENT_TRANSCRIPT_KEY,
    MAX_TRANSCRIPT_MESSAGES,
    appendMessage,
    clearTranscript,
    createRequestGate,
    isAgentSubmitShortcut,
    lastRetryablePrompt,
    loadTranscript,
    normalizeTranscript,
    saveTranscript
  });
});
