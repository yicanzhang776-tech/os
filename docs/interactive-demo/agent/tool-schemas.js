"use strict";

const { APPROVED_TEST_IDS } = require("./test-registry");

const LABS = ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"];
const RUN_LABS = ["p0", ...LABS];
const EVENT_STATUSES = ["running", "todo", "pass", "fail"];

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function functionSchema(name, description, properties, required = []) {
  return {
    type: "function",
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false
    }
  };
}

const TOOL_SCHEMAS = deepFreeze([
  functionSchema(
    "get_context",
    "Read the current trusted teaching workspace context.",
    {}
  ),
  functionSchema(
    "read_code",
    "Read a bounded range from an allowed teaching source file.",
    {
      path: { type: "string", minLength: 1, maxLength: 1000 },
      startLine: { type: "integer", minimum: 1 },
      endLine: { type: "integer", minimum: 1 },
      maxBytes: { type: "integer", minimum: 1, maximum: 64 * 1024 }
    },
    ["path"]
  ),
  functionSchema(
    "get_qemu_events",
    "Read bounded teaching events from an existing run.",
    {
      runId: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        pattern: "^[A-Za-z0-9._:-]+$"
      },
      lab: { type: "string", enum: RUN_LABS },
      status: { type: "string", enum: EVENT_STATUSES },
      sequenceStart: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      sequenceEnd: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      includeRaw: { type: "boolean" }
    }
  ),
  functionSchema(
    "get_run_result",
    "Read the bounded result summary for an existing run.",
    {
      runId: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        pattern: "^[A-Za-z0-9._:-]+$"
      },
      lab: { type: "string", enum: RUN_LABS },
      includeDiagnostics: { type: "boolean" }
    }
  ),
  functionSchema(
    "get_code_diff",
    "Inspect a bounded teaching-code difference from the approved baseline.",
    {
      lab: { type: "string", enum: LABS },
      paths: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { type: "string", minLength: 1, maxLength: 1000 }
      },
      contextLines: { type: "integer", minimum: 0, maximum: 5 },
      maxLines: { type: "integer", minimum: 1, maximum: 800 }
    }
  ),
  functionSchema(
    "run_test",
    "Start one approved teaching test for the current trusted Lab context.",
    {
      testId: { type: "string", enum: [...APPROVED_TEST_IDS] },
      lab: { type: "string", enum: LABS }
    },
    ["testId", "lab"]
  )
]);

const TOOL_SCHEMA_NAMES = Object.freeze(TOOL_SCHEMAS.map((schema) => schema.name));

module.exports = {
  TOOL_SCHEMAS,
  TOOL_SCHEMA_NAMES
};
