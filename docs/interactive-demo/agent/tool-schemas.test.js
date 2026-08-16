"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { APPROVED_TEST_IDS } = require("./test-registry");
const { TOOL_SCHEMAS, TOOL_SCHEMA_NAMES } = require("./tool-schemas");

const EXPECTED_NAMES = [
  "get_context",
  "read_code",
  "get_qemu_events",
  "get_run_result",
  "get_code_diff",
  "run_test"
];

function schema(name) {
  return TOOL_SCHEMAS.find((entry) => entry.name === name);
}

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

test("exports exactly the six production tool schema names", () => {
  assert.deepEqual(TOOL_SCHEMA_NAMES, EXPECTED_NAMES);
  assert.deepEqual(TOOL_SCHEMAS.map((entry) => entry.name), EXPECTED_NAMES);
  assert.equal(new Set(TOOL_SCHEMA_NAMES).size, 6);
});

test("uses strict object parameter schemas without provider strict mode", () => {
  for (const entry of TOOL_SCHEMAS) {
    assert.equal(entry.type, "function", entry.name);
    assert.equal(typeof entry.description, "string", entry.name);
    assert.equal(entry.description.length > 0, true, entry.name);
    assert.equal(entry.parameters.type, "object", entry.name);
    assert.equal(entry.parameters.additionalProperties, false, entry.name);
    assert.equal(Object.hasOwn(entry, "strict"), false, entry.name);
  }
});

test("descriptions guide minimal natural-language tool selection", () => {
  assert.match(schema("get_context").description, /current Lab, progress, branch, workspace/);
  assert.match(schema("get_context").description, /usually sufficient/);
  assert.match(schema("read_code").description, /named file, function, or current implementation/);
  assert.match(schema("read_code").description, /avoid unrelated context, diff, run, or event tools/);
  assert.match(schema("get_code_diff").description, /recent changes/);
  assert.match(schema("get_run_result").description, /latest or specified run/);
  assert.match(schema("get_run_result").description, /do not reread it/);
  assert.match(schema("get_qemu_events").description, /where execution stopped/);
  assert.match(schema("get_qemu_events").description, /empty successful event list is a valid result/);
  assert.match(schema("run_test").description, /exactly once/);
  assert.match(schema("run_test").description, /trusted Lab and variant with get_context first/);
  assert.match(schema("run_test").description, /Never batch this action with read tools/);
  assert.match(schema("run_test").description, /report status and runId without polling/);
});

test("matches the existing get_context and read_code input contracts", () => {
  assert.deepEqual(schema("get_context").parameters.properties, {});
  assert.deepEqual(schema("get_context").parameters.required, []);

  const readCode = schema("read_code").parameters;
  assert.deepEqual(Object.keys(readCode.properties), [
    "path", "startLine", "endLine", "maxBytes"
  ]);
  assert.deepEqual(readCode.required, ["path"]);
  assert.equal(readCode.properties.path.maxLength, 1000);
  assert.equal(readCode.properties.startLine.minimum, 1);
  assert.equal(readCode.properties.endLine.minimum, 1);
  assert.equal(readCode.properties.maxBytes.maximum, 64 * 1024);
});

test("matches existing run observation input contracts", () => {
  const events = schema("get_qemu_events").parameters.properties;
  assert.deepEqual(Object.keys(events), [
    "runId", "lab", "status", "sequenceStart", "sequenceEnd", "limit", "includeRaw"
  ]);
  assert.deepEqual(events.lab.enum, ["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  assert.deepEqual(events.status.enum, ["running", "todo", "pass", "fail"]);
  assert.equal(events.limit.maximum, 100);

  const result = schema("get_run_result").parameters.properties;
  assert.deepEqual(Object.keys(result), ["runId", "lab", "includeDiagnostics"]);
  assert.deepEqual(result.lab.enum, events.lab.enum);
});

test("matches the existing get_code_diff input contract", () => {
  const diff = schema("get_code_diff").parameters.properties;
  assert.deepEqual(Object.keys(diff), ["lab", "paths", "contextLines", "maxLines"]);
  assert.deepEqual(diff.lab.enum, ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  assert.equal(diff.paths.minItems, 1);
  assert.equal(diff.paths.maxItems, 20);
  assert.equal(diff.paths.items.maxLength, 1000);
  assert.equal(diff.contextLines.minimum, 0);
  assert.equal(diff.contextLines.maximum, 5);
  assert.equal(diff.maxLines.minimum, 1);
  assert.equal(diff.maxLines.maximum, 800);
});

test("derives the run_test enum from APPROVED_TEST_IDS", () => {
  const runTest = schema("run_test").parameters;
  assert.deepEqual(runTest.required, ["testId", "lab"]);
  assert.deepEqual(runTest.properties.testId.enum, APPROVED_TEST_IDS);
  assert.notEqual(runTest.properties.testId.enum, APPROVED_TEST_IDS);
  assert.deepEqual(runTest.properties.lab.enum,
    ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
});

test("deep-freezes the registry and every nested schema value", () => {
  assertDeepFrozen(TOOL_SCHEMAS);
  assertDeepFrozen(TOOL_SCHEMA_NAMES);
  assert.throws(() => TOOL_SCHEMAS.push({}), TypeError);
  assert.throws(() => TOOL_SCHEMAS.pop(), TypeError);
  assert.throws(() => { TOOL_SCHEMAS[0].name = "shell"; }, TypeError);
  assert.throws(() => { TOOL_SCHEMAS[0].parameters.additionalProperties = true; }, TypeError);
  assert.throws(() => { TOOL_SCHEMAS[1].parameters.properties.path.type = "number"; }, TypeError);
  assert.throws(() => schema("run_test").parameters.properties.testId.enum.push("custom"),
    TypeError);
});

test("contains capability-only metadata and no write or hosted tool schema", () => {
  const serialized = JSON.stringify(TOOL_SCHEMAS);
  assert.doesNotMatch(serialized, /standard answer|reference answer|solution source|hidden path/i);
  assert.doesNotMatch(serialized, /apply_patch|write_file|delete_file|web_search|computer|terminal/i);
  assert.doesNotMatch(serialized, /git\s+(?:add|commit|push|switch|checkout|reset)/i);
  assert.equal(TOOL_SCHEMA_NAMES.some((name) => /shell|network|write|patch|git/i.test(name)), false);
});
