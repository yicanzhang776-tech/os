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
    "Use at most once per student request for the current Lab, progress, branch, workspace, or Git-change status. If request evidence lists get_context as already used, reuse its trustedContext snapshot and never call get_context again; the orchestrator independently checks context consistency. One call is usually sufficient for a context-only question.",
    {}
  ),
  functionSchema(
    "get_run_result",
    "Use first after trusted context to inspect how the latest or specified run finished, especially for runtime symptoms such as boot failure, no output, stuck execution, panic, exception, QEMU or OpenSBI behavior, or where execution stopped. Read one bounded run summary before event, diff, or source evidence; do not reread it.",
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
    "get_qemu_events",
    "Use after get_run_result for runtime symptoms to inspect where execution stopped, the last observed stage, or real panic, trap, QEMU, OpenSBI, and handoff evidence before reading diffs or source. Read bounded events from one run. An empty successful event list is valid evidence and must not be queried again.",
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
    "get_code_diff",
    "Use when a student asks about recent changes or why changed code no longer works. For runtime symptoms, use it only after run and QEMU event evidence remain insufficient. Inspect only the necessary bounded teaching-code difference from the approved starter baseline.",
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
    "read_code",
    "Use for a named file, function, or current implementation. For runtime symptoms, use only after run, QEMU event, and relevant diff evidence remain insufficient. Read one most relevant bounded location first, reassess after every result, and do not batch speculative reads; four calls is a safety ceiling, not a target.",
    {
      path: { type: "string", minLength: 1, maxLength: 1000 },
      startLine: { type: "integer", minimum: 1 },
      endLine: { type: "integer", minimum: 1 },
      maxBytes: { type: "integer", minimum: 1, maximum: 64 * 1024 }
    },
    ["path"]
  ),
  functionSchema(
    "run_test",
    "Use exactly once only when a student asks to run or verify the current experiment. Establish the trusted Lab and variant with get_context first when they are not already returned evidence, then start one approved teaching test in a later turn. Never batch this action with read tools; after it starts report status and runId without polling in the same request.",
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
