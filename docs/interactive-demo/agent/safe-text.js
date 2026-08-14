"use strict";

const { TextDecoder } = require("node:util");

function classifySafeUtf8Text(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return { ok: false, code: "binary_file", message: "The file is not safe text." };
  }
  if (buffer.includes(0)) {
    return { ok: false, code: "binary_file", message: "The file contains binary data." };
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_) {
    return { ok: false, code: "invalid_utf8", message: "The file is not valid UTF-8 text." };
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return { ok: false, code: "binary_file", message: "The file contains binary data." };
  }
  return { ok: true, text };
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/\bBearer\s+[^\s,;]+/gi, "[REDACTED]")
    .replace(
      /\b(?:ghp_[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_-]+|glpat-[A-Za-z0-9_-]+|sk-(?:proj-)?[A-Za-z0-9_-]+)\b/gi,
      "[REDACTED]"
    )
    .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g, "[REDACTED]")
    .replace(/(^|\s)\/(?:[^/\s]+\/)+[^\s]*/g, "$1[REDACTED]")
    .replace(/\b(?:api[_-]?key|access[_-]?token|secret|password)=\S+/gi, "[REDACTED]")
    .replace(/\b[A-Z][A-Z0-9_]{1,63}=\S+/g, "[REDACTED]");
}

module.exports = { classifySafeUtf8Text, redactSensitiveText };
