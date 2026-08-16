"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  UBUNTU_OPENSBI_FIRMWARE,
  createQemuArguments,
  resolveOpenSbiFirmware
} = require("./qemu-firmware");

test("OPENSBI_FIRMWARE has highest priority when it names an existing file", () => {
  const configured = "/opt/opensbi/custom-fw_jump.bin";
  const checked = [];
  const firmware = resolveOpenSbiFirmware({
    environment: { OPENSBI_FIRMWARE: configured },
    isFile(candidate) {
      checked.push(candidate);
      return candidate === configured;
    }
  });

  assert.equal(firmware, configured);
  assert.deepEqual(checked, [configured]);
});

test("an invalid OPENSBI_FIRMWARE fails without checking or using a fallback", () => {
  const configured = "/missing/custom-fw_jump.bin";
  const checked = [];

  assert.throws(() => resolveOpenSbiFirmware({
    environment: { OPENSBI_FIRMWARE: configured },
    isFile(candidate) {
      checked.push(candidate);
      return false;
    }
  }), /OPENSBI_FIRMWARE must reference an existing firmware file/);
  assert.deepEqual(checked, [configured]);
});

test("the Ubuntu fw_jump path is selected automatically when available", () => {
  const firmware = resolveOpenSbiFirmware({
    environment: {},
    isFile: (candidate) => candidate === UBUNTU_OPENSBI_FIRMWARE
  });

  assert.equal(firmware, UBUNTU_OPENSBI_FIRMWARE);
});

test("QEMU default firmware is the final fallback", () => {
  const firmware = resolveOpenSbiFirmware({
    environment: {},
    isFile: () => false
  });

  assert.equal(firmware, "default");
});

test("the resolved firmware is used as the final QEMU -bios argument", () => {
  const firmware = "/opt/opensbi/fw_jump.bin";
  const kernel = "/workspace/target/riscv64/debug/ai-os-kernel";

  assert.deepEqual(createQemuArguments({ firmware, kernel }), [
    "-machine", "virt",
    "-nographic",
    "-bios", firmware,
    "-kernel", kernel
  ]);
});
