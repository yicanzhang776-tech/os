"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeSettings } = require("./desktop-core");

function createSettingsStore(filePath, fileSystem = fs) {
  let settings = normalizeSettings();

  function read() {
    try {
      settings = normalizeSettings(JSON.parse(fileSystem.readFileSync(filePath, "utf8")));
    } catch (_) {
      settings = normalizeSettings();
    }
    return settings;
  }

  function write(next) {
    settings = normalizeSettings({ ...settings, ...next });
    const directory = path.dirname(filePath);
    const temporary = `${filePath}.tmp`;
    fileSystem.mkdirSync(directory, { recursive: true });
    fileSystem.writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    fileSystem.renameSync(temporary, filePath);
    return settings;
  }

  return Object.freeze({ current: () => settings, read, write });
}

module.exports = { createSettingsStore };
