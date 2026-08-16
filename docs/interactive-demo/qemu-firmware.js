"use strict";

const fs = require("node:fs");

const UBUNTU_OPENSBI_FIRMWARE =
  "/usr/lib/riscv64-linux-gnu/opensbi/generic/fw_jump.bin";

function isRegularFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch (_) {
    return false;
  }
}

function resolveOpenSbiFirmware(options = {}) {
  const environment = options.environment || process.env;
  const isFile = options.isFile || isRegularFile;

  if (Object.prototype.hasOwnProperty.call(environment, "OPENSBI_FIRMWARE")) {
    const configured = environment.OPENSBI_FIRMWARE;
    if (typeof configured !== "string" || configured.length === 0 || !isFile(configured)) {
      throw new Error("OPENSBI_FIRMWARE must reference an existing firmware file.");
    }
    return configured;
  }

  if (isFile(UBUNTU_OPENSBI_FIRMWARE)) return UBUNTU_OPENSBI_FIRMWARE;
  return "default";
}

function createQemuArguments({ firmware, kernel }) {
  if (typeof firmware !== "string" || !firmware) {
    throw new TypeError("A resolved OpenSBI firmware value is required.");
  }
  if (typeof kernel !== "string" || !kernel) {
    throw new TypeError("A kernel path is required.");
  }
  return ["-machine", "virt", "-nographic", "-bios", firmware, "-kernel", kernel];
}

module.exports = Object.freeze({
  UBUNTU_OPENSBI_FIRMWARE,
  createQemuArguments,
  resolveOpenSbiFirmware
});
