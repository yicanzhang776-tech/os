"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { compareRuns, createRunRecord, loadRuns, saveRun } = require("./run-history");
const { resolveEventKnowledge } = require("./event-catalog");
const {
  EVENT_PROTOCOL,
  MAX_EVENTS,
  MAX_IMPORT_BYTES,
  RUN_SCHEMA_VERSION,
  buildRunMarkdown,
  exportRun,
  importRunJson,
  parseRunJson,
  serializeRunJson
} = require("./run-transfer");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

function event(step, status = "running", sequence = 1) {
  return {
    protocol: EVENT_PROTOCOL,
    lab: "lab2",
    step,
    status,
    detail: `evidence for ${step}`,
    source: "tagged",
    sequence,
    timestamp: 1000 + sequence
  };
}

function run(variant = "solution", id = `lab2-${variant}-run`) {
  const solution = variant === "solution";
  const events = solution
    ? [event("stvec-installed", "running", 1), event("breakpoint-handled", "running", 2), event("pass", "pass", 3)]
    : [event("stvec-missing", "todo", 1), event("breakpoint-missing", "todo", 2)];
  return createRunRecord({
    id,
    context: {
      branch: `lab2-${variant}`,
      commit: "abc1234",
      lab: "lab2",
      variant,
      variantLabel: variant
    },
    prediction: {
      version: 2,
      expectedBuild: "success",
      expectedRun: solution ? "complete" : "todo",
      expectedEvents: solution
        ? ["lab2:stvec-installed", "lab2:breakpoint-handled"]
        : ["lab2:stvec-missing", "lab2:breakpoint-missing"],
      expectedPass: solution,
      reasoning: "根据当前分支的真实 Trap 教学标记作出预测。",
      branch: `lab2-${variant}`,
      commit: "abc1234",
      lab: "lab2"
    },
    events,
    stableOutput: ["[Lab2] trap: breakpoint exception"],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
}

test("JSON export uses the stable os-demo.run/v1 schema", () => {
  const data = exportRun(run(), 3000);
  assert.equal(data.schemaVersion, RUN_SCHEMA_VERSION);
  assert.equal(data.protocol, EVENT_PROTOCOL);
  assert.equal(data.runId, "lab2-solution-run");
  assert.equal(data.branch, "lab2-solution");
  assert.equal(data.commit, "abc1234");
  assert.equal(data.lab, "lab2");
  assert.equal(data.role, "solution");
  assert.equal(data.startTime, "1970-01-01T00:00:01.000Z");
  assert.equal(data.endTime, "1970-01-01T00:00:02.000Z");
  assert.equal(data.events.length, 3);
  assert.deepEqual(data.stableOutput, ["[Lab2] trap: breakpoint exception"]);
  assert.equal(data.finalResult, "pass");
  assert.equal(data.prediction.expectedRun, "complete");
  assert.equal(data.predictionComparison.overall, "consistent");
  assert.doesNotThrow(() => JSON.parse(serializeRunJson(run(), 3000)));

  const missingTime = run("solution", "missing-time");
  missingTime.events[0].timestamp = null;
  const exportedMissingTime = exportRun(missingTime, 3000);
  assert.equal(exportedMissingTime.events[0].timestamp, null);
  assert.equal(importRunJson(JSON.stringify(exportedMissingTime)).record.events[0].timestamp, null);
  assert.deepEqual(importRunJson(JSON.stringify(data)).record.stableOutput, data.stableOutput);
});

test("Markdown export summarizes prediction, events and comparison", () => {
  const markdown = buildRunMarkdown(run());
  assert.match(markdown, /# OS 实验运行总结/);
  assert.match(markdown, /os-demo\.run\/v1/);
  assert.match(markdown, /## 学生预测/);
  assert.match(markdown, /lab2:stvec-installed/);
  assert.match(markdown, /## 预测与实际对照/);
  assert.match(markdown, /预测一致/);
  assert.match(markdown, /不会由页面自动上传/);
});

test("imported records can be saved, replayed and compared", () => {
  const starter = importRunJson(serializeRunJson(run("starter"))).record;
  const solution = importRunJson(serializeRunJson(run("solution"))).record;
  const local = memoryStorage();
  saveRun(local, starter);
  saveRun(local, solution);
  const loaded = loadRuns(local);
  const comparison = compareRuns(
    loaded.find((item) => item.context.variant === "starter"),
    loaded.find((item) => item.context.variant === "solution")
  );
  assert.equal(loaded.length, 2);
  assert.equal(comparison.lab, "lab2");
  assert.ok(comparison.starterOnly > 0);
  assert.ok(comparison.solutionOnly > 0);
  assert.equal(resolveEventKnowledge(solution.events[0]).known, true);
});

test("corrupt JSON is rejected with an explicit error", () => {
  assert.throws(
    () => parseRunJson("{not-json"),
    (error) => error.code === "invalid_json" && /有效 JSON/.test(error.message)
  );
});

test("oversized files and runs over 512 events are rejected", () => {
  assert.throws(
    () => parseRunJson(" ".repeat(MAX_IMPORT_BYTES + 1)),
    (error) => error.code === "file_too_large"
  );
  const data = exportRun(run());
  data.events = Array.from({ length: MAX_EVENTS + 1 }, (_, index) => event("stvec-installed", "running", index + 1));
  assert.throws(
    () => parseRunJson(JSON.stringify(data)),
    (error) => error.code === "too_many_events" && /512/.test(error.message)
  );
});

test("unknown schema and event protocol versions are rejected", () => {
  const schema = exportRun(run());
  schema.schemaVersion = "os-demo.run/v2";
  assert.throws(
    () => parseRunJson(JSON.stringify(schema)),
    (error) => error.code === "unsupported_schema" && /os-demo\.run\/v1/.test(error.message)
  );

  const protocol = exportRun(run());
  protocol.events[0].protocol = "os-demo.event/v0";
  assert.throws(
    () => parseRunJson(JSON.stringify(protocol)),
    (error) => error.code === "unsupported_event_protocol" && /第 1 个事件/.test(error.message)
  );
});

test("duplicate runId supports overwrite or a generated local ID", () => {
  const source = serializeRunJson(run());
  const existingRuns = [run()];
  assert.throws(
    () => importRunJson(source, { existingRuns }),
    (error) => error.code === "duplicate_run_id" && /覆盖或生成新 ID/.test(error.message)
  );
  const overwritten = importRunJson(source, { existingRuns, duplicateStrategy: "overwrite" });
  assert.equal(overwritten.action, "overwritten");
  assert.equal(overwritten.record.id, "lab2-solution-run");

  const renamed = importRunJson(source, { existingRuns, duplicateStrategy: "new-id", now: 12345 });
  assert.equal(renamed.action, "renamed");
  assert.equal(renamed.originalRunId, "lab2-solution-run");
  assert.notEqual(renamed.record.id, "lab2-solution-run");
  assert.match(renamed.record.id, /^lab2-solution-run-import-/);
});

test("malicious strings are treated as text and sensitive local values are removed", () => {
  const data = exportRun(run());
  const malicious = "<script>globalThis.__runImportExecuted=true</script> C:\\Users\\Alice glpat-abcdefghijklmnop";
  data.branch = malicious;
  data.prediction.branch = malicious;
  data.events[0].detail = malicious;
  data.stableOutput = [malicious];
  globalThis.__runImportExecuted = false;

  const imported = parseRunJson(JSON.stringify(data));
  const serialized = JSON.stringify(imported);
  assert.equal(globalThis.__runImportExecuted, false);
  assert.doesNotMatch(serialized, /<script>|Alice|glpat-abcdefghijklmnop/);
  assert.match(serialized, /已移除HTML/);
  assert.match(serialized, /本地用户/);
  assert.match(serialized, /已移除访问令牌/);
  delete globalThis.__runImportExecuted;
});
