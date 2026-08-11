"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRunRecord } = require("./run-history");
const { exportRun } = require("./run-transfer");
const {
  EVENT_PROTOCOL,
  MAX_EVENTS,
  RUN_SCHEMA_VERSION,
  RUN_SUBMIT_PROTOCOL,
  createRunSubmissionEnvelope,
  previewRunSubmission,
  sanitizeRunRecordForSubmission,
  submitRunRecord
} = require("./run-submission");

function event(step = "stvec-installed", status = "running", sequence = 1) {
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

function internalRun(options = {}) {
  const role = options.role || "solution";
  const lab = options.lab || "lab2";
  const pass = options.pass !== false;
  const events = options.events || [
    { ...event("stvec-installed", "running", 1), lab },
    { ...event(pass ? "pass" : "stvec-missing", pass ? "pass" : "todo", 2), lab }
  ];
  return createRunRecord({
    id: options.id || `${lab}-${role}-run`,
    context: {
      branch: options.branch || `${lab}-${role}`,
      commit: "abcdef1234567890",
      lab,
      variant: role,
      variantLabel: role
    },
    prediction: {
      version: 2,
      expectedBuild: "success",
      expectedRun: pass ? "complete" : "todo",
      expectedEvents: [`${lab}:${events[0].step}`],
      expectedPass: pass,
      reasoning: "根据当前分支和结构化事件作出预测。",
      branch: options.branch || `${lab}-${role}`,
      commit: "abcdef1234567890",
      lab
    },
    events,
    stableOutput: ["this complete serial log must not be submitted"],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 2500,
    exitCode: 0,
    error: options.error || ""
  });
}

test("legal run submission keeps stable protocols and only allowed fields", () => {
  const envelope = createRunSubmissionEnvelope(internalRun(), { feedbackId: "FDBK-123" });
  assert.equal(envelope.protocol, RUN_SUBMIT_PROTOCOL);
  assert.equal(envelope.run.schemaVersion, RUN_SCHEMA_VERSION);
  assert.equal(envelope.run.protocol, EVENT_PROTOCOL);
  assert.equal(envelope.run.events.length, 2);
  assert.equal(envelope.feedbackId, "FDBK-123");
  assert.equal(Object.hasOwn(envelope.run, "stableOutput"), false);
  assert.equal(Object.hasOwn(envelope.run, "terminalLog"), false);
  assert.equal(Object.hasOwn(envelope.run, "sourceCode"), false);
});

test("preview lists sent and excluded fields without performing a request", () => {
  let requests = 0;
  globalThis.fetch = () => { requests += 1; };
  const preview = previewRunSubmission(internalRun());
  assert.equal(preview.eventCount, 2);
  assert.equal(preview.durationMs, 1500);
  assert.match(preview.excludedFields.join(" "), /源代码|终端|访问令牌/);
  assert.equal(requests, 0);
  delete globalThis.fetch;
});

test("explicit consent is required before the network function is called", async () => {
  let requests = 0;
  await assert.rejects(
    submitRunRecord(internalRun(), {
      serviceUrl: "http://127.0.0.1:8890",
      fetchImpl: async () => { requests += 1; }
    }),
    (error) => error.code === "consent_required"
  );
  assert.equal(requests, 0);
});

test("successful and duplicate receipts preserve the same runId for retry", async () => {
  const run = internalRun();
  for (const status of ["created", "duplicate"]) {
    const receipt = await submitRunRecord(run, {
      consent: true,
      serviceUrl: "http://127.0.0.1:8890",
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.run.runId, run.id);
        return new Response(JSON.stringify({
          ok: true,
          status,
          runId: run.id,
          receiptId: "RUN-RCPT-ONE",
          receivedAt: "2026-08-11T03:00:00.000Z"
        }), { status: status === "created" ? 201 : 200 });
      }
    });
    assert.equal(receipt.status, status);
    assert.equal(receipt.runId, run.id);
  }
});

test("corrupt schema, event protocol, missing run id and more than 512 events are rejected", () => {
  const schema = exportRun(internalRun());
  schema.schemaVersion = "os-demo.run/v2";
  assert.throws(() => sanitizeRunRecordForSubmission(schema), (error) => error.code === "unsupported_schema");

  const protocol = exportRun(internalRun());
  protocol.events[0].protocol = "os-demo.event/v0";
  assert.throws(
    () => sanitizeRunRecordForSubmission(protocol),
    (error) => error.code === "unsupported_event_protocol"
  );

  const missing = exportRun(internalRun());
  missing.runId = "";
  assert.throws(() => sanitizeRunRecordForSubmission(missing), (error) => error.code === "invalid_run");

  const excessive = exportRun(internalRun());
  excessive.events = Array.from({ length: MAX_EVENTS + 1 }, (_, index) => event("stvec-installed", "running", index));
  assert.throws(() => sanitizeRunRecordForSubmission(excessive), (error) => error.code === "too_many_events");
});

test("code, logs, paths, tokens and dangerous HTML are removed from submissions", () => {
  const data = exportRun(internalRun({ error: "<b>bad</b> /home/alice/private glpat-abcdefghijk" }));
  data.rawOutput = "SECRET TERMINAL";
  data.terminalLog = "SECRET TERMINAL";
  data.serialOutput = "SECRET SERIAL";
  data.stdout = "SECRET STDOUT";
  data.stderr = "SECRET STDERR";
  data.sourceCode = "fn secret() {}";
  data.fileContent = "private source";
  data.commandLine = "cargo run --token secret";
  data.environment = { PASSWORD: "secret" };
  data.Cookie = "session=secret";
  data.Authorization = "Bearer secret";
  data.token = "github_pat_abcdefghijklmnopqrstuvwxyz";
  data.password = "secret";
  data.prediction.reasoning = '<img src=x onerror="run()"> C:\\Users\\Alice github_pat_abcdefghijklmnopqrstuvwxyz';
  data.events[0].detail = '<script>run()</script> /home/alice/private Authorization: Bearer secret';

  globalThis.__runSubmissionExecuted = false;
  const clean = sanitizeRunRecordForSubmission(data);
  const serialized = JSON.stringify(clean);
  assert.equal(globalThis.__runSubmissionExecuted, false);
  assert.doesNotMatch(serialized, /SECRET|fn secret|private source|onerror|<script|Alice|alice|github_pat_|glpat-|Bearer secret/i);
  assert.doesNotMatch(serialized, /rawOutput|terminalLog|serialOutput|stdout|stderr|sourceCode|fileContent|commandLine|environment|Cookie|Authorization|password/);
  delete globalThis.__runSubmissionExecuted;
});

test("all 17 teaching branch contexts remain valid submission contexts", () => {
  const branches = [
    ["main", "p0", "custom"],
    ["interactive-demo-learning-map", "p0", "custom"],
    ["p0-minimal-qemu-baseline", "p0", "custom"],
    ...Array.from({ length: 7 }, (_, index) => [
      [`lab${index + 1}-starter`, `lab${index + 1}`, "starter"],
      [`lab${index + 1}-solution`, `lab${index + 1}`, "solution"]
    ]).flat()
  ];
  assert.equal(branches.length, 17);
  for (const [branch, lab, role] of branches) {
    const run = internalRun({ branch, lab, role });
    const clean = sanitizeRunRecordForSubmission(run);
    assert.equal(clean.branch, branch);
    assert.equal(clean.lab, lab);
    assert.equal(clean.role, role);
  }
});

test("starter TODO remains TODO and solution PASS still requires structured PASS evidence", () => {
  const starter = sanitizeRunRecordForSubmission(internalRun({ role: "starter", pass: false }));
  const solutionWithoutPass = sanitizeRunRecordForSubmission(internalRun({
    role: "solution",
    pass: false,
    events: [event("stvec-installed", "running", 1)]
  }));
  const solutionWithPass = sanitizeRunRecordForSubmission(internalRun({ role: "solution", pass: true }));
  assert.equal(starter.finalResult, "todo");
  assert.notEqual(solutionWithoutPass.finalResult, "pass");
  assert.equal(solutionWithPass.finalResult, "pass");
  assert.equal(solutionWithPass.events.some((item) => item.step === "pass" && item.status === "pass"), true);
});
