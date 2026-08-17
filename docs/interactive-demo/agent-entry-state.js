(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsTeachingAgentEntryState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const AGENT_ENTRY_KEY = "os-teaching-agent-pending-prompt-v1";
  const MAX_AGENT_MESSAGE_LENGTH = 4000;

  function validateLocally(value) {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error("message_required");
    const message = value.trim();
    if (message.length > MAX_AGENT_MESSAGE_LENGTH) throw new Error("message_too_long");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message)) throw new Error("invalid_message");
    return message;
  }

  function validate(value) {
    const clientValidator = root?.OsTeachingAgentClient?.validateAgentMessage;
    return typeof clientValidator === "function" ? clientValidator(value) : validateLocally(value);
  }

  function hasStorageMethods(storage, methods) {
    return storage !== null && storage !== undefined && methods.every((method) => typeof storage[method] === "function");
  }

  function savePendingPrompt(storage, value) {
    try {
      if (!hasStorageMethods(storage, ["setItem", "getItem"])) return false;
      const message = validate(value);
      const encoded = JSON.stringify({ message });
      storage.setItem(AGENT_ENTRY_KEY, encoded);
      return storage.getItem(AGENT_ENTRY_KEY) === encoded;
    } catch (_) {
      return false;
    }
  }

  function consumePendingPrompt(storage) {
    try {
      if (!hasStorageMethods(storage, ["getItem", "removeItem"])) return null;
      const raw = storage.getItem(AGENT_ENTRY_KEY);
      storage.removeItem(AGENT_ENTRY_KEY);
      if (!raw) return null;
      return validate(JSON.parse(raw)?.message);
    } catch (_) {
      try { if (hasStorageMethods(storage, ["removeItem"])) storage.removeItem(AGENT_ENTRY_KEY); } catch (_) {}
      return null;
    }
  }

  function clearPendingPrompt(storage) {
    try {
      if (!hasStorageMethods(storage, ["removeItem"])) return false;
      storage.removeItem(AGENT_ENTRY_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ AGENT_ENTRY_KEY, savePendingPrompt, consumePendingPrompt, clearPendingPrompt });
});
