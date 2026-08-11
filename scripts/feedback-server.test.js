"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const feedback = require("../docs/interactive-demo/feedback.js");
const {
  FEEDBACK_SUBMIT_PROTOCOL
} = feedback;
const { createRunRecord } = require("../docs/interactive-demo/run-history.js");
const runSubmission = require("../docs/interactive-demo/run-submission.js");
const {
  MAX_BODY_BYTES,
  MAX_RUN_BODY_BYTES,
  createFeedbackService
} = require("./feedback-server.js");

function completeInput(context = {}, overrides = {}) {
  const questionSet = feedback.getQuestionSet(context);
  return {
    type: "evaluation",
    role: "student",
    osExperience: "learning",
    beforeUnderstanding: 2,
    afterUnderstanding: 4,
    outcome: "somewhat_better",
    questionSetId: questionSet.id,
    branchAnswers: Object.fromEntries(questionSet.questions.map((question) => [question.id, 4])),
    helpfulAreas: ["theory", "connections"],
    mostHelpful: "知识地图让我看清了实验之间的联系。",
    stillConfusing: "Trap 的切换过程还不够熟悉。",
    suggestion: "希望增加一次失败示例。",
    includeContext: true,
    ...overrides
  };
}

function validRecord(overrides = {}) {
  const context = { branch: "lab2-starter", lab: "lab2", variant: "starter", commit: "abcd1234" };
  return {
    ...feedback.buildFeedbackRecord(completeInput(context), context, {
      now: new Date("2026-08-11T01:02:03Z"), idSuffix: "SERVER"
    }),
    ...overrides
  };
}

function envelope(record = validRecord()) {
  return { protocol: FEEDBACK_SUBMIT_PROTOCOL, feedback: record };
}

function validRun(overrides = {}) {
  const internal = createRunRecord({
    id: overrides.id || "lab2-solution-run",
    context: { branch: "lab2-solution", commit: "abcdef123456", lab: "lab2", variant: "solution" },
    prediction: {
      version: 2,
      expectedBuild: "success",
      expectedRun: "complete",
      expectedEvents: ["lab2:stvec-installed"],
      expectedPass: true,
      reasoning: "根据结构化事件预测。",
      branch: "lab2-solution",
      commit: "abcdef123456",
      lab: "lab2"
    },
    events: [
      { protocol: "os-demo.event/v1", lab: "lab2", step: "stvec-installed", status: "running", detail: "stvec ready", source: "tagged", sequence: 1, timestamp: 1001 },
      { protocol: "os-demo.event/v1", lab: "lab2", step: "pass", status: "pass", detail: "pass", source: "tagged", sequence: 2, timestamp: 1002 }
    ],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 2000,
    exitCode: 0
  });
  const run = runSubmission.sanitizeRunRecordForSubmission(internal);
  return { ...run, ...overrides, runId: overrides.id || run.runId };
}

function runEnvelope(run = validRun(), feedbackId = "FDBK-LINK") {
  return { protocol: runSubmission.RUN_SUBMIT_PROTOCOL, feedbackId, run };
}

async function request(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  return { response, body, text };
}

async function withService(options, callback) {
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "os-feedback-test-"));
  const service = createFeedbackService({
    host: "127.0.0.1",
    port: 0,
    dataDir,
    inviteCode: "classroom-demo",
    now: () => new Date("2026-08-11T01:03:00Z"),
    randomUUID: () => "12345678-1234-1234-1234-123456789abc",
    ...options
  });
  const address = await service.listen();
  try {
    await callback({
      base: `http://127.0.0.1:${address.port}`,
      dataDir,
      dataFile: service.dataFile,
      service
    });
  } finally {
    await service.close();
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
}

function postOptions(body, extraHeaders = {}) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Feedback-Invite": "classroom-demo",
      ...extraHeaders
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  };
}

test("health reports service status without feedback or invite data", async () => {
  await withService({}, async ({ base }) => {
    const { response, body, text } = await request(base, "/health");
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body, { ok: true });
    assert.doesNotMatch(text, /classroom-demo|suggestion|feedbackId/);
  });
});

test("a valid submission is written once and returns a stable receipt", async () => {
  await withService({}, async ({ base, dataFile }) => {
    const first = await request(base, "/api/feedback", postOptions(envelope()));
    assert.equal(first.response.status, 201);
    assert.equal(first.body.status, "created");
    assert.equal(first.body.feedbackId, validRecord().id);
    assert.equal(first.body.receiptId, "RCPT-12345678123412341234");
    assert.equal(first.body.receivedAt, "2026-08-11T01:03:00.000Z");
    const lines = (await fs.promises.readFile(dataFile, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).feedback.schemaVersion, 2);
  });
});

test("invalid JSON and an incorrect content type are rejected", async () => {
  await withService({}, async ({ base }) => {
    const invalid = await request(base, "/api/feedback", postOptions("{broken"));
    assert.equal(invalid.response.status, 400);
    const wrongType = await request(base, "/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-Feedback-Invite": "classroom-demo" },
      body: JSON.stringify(envelope())
    });
    assert.equal(wrongType.response.status, 415);
  });
});

test("unknown protocol, schema and missing fields are rejected", async () => {
  await withService({}, async ({ base }) => {
    const protocol = await request(base, "/api/feedback", postOptions({ protocol: "unknown", feedback: validRecord() }));
    assert.equal(protocol.response.status, 400);
    const schema = await request(base, "/api/feedback", postOptions(envelope(validRecord({ schemaVersion: 99 }))));
    assert.equal(schema.response.status, 422);
    const missing = validRecord();
    delete missing.branchQuestionSet;
    const incomplete = await request(base, "/api/feedback", postOptions(envelope(missing)));
    assert.equal(incomplete.response.status, 422);
  });
});

test("an incorrect invite code is rejected", async () => {
  await withService({}, async ({ base }) => {
    const result = await request(base, "/api/feedback", postOptions(envelope(), {
      "X-Feedback-Invite": "wrong"
    }));
    assert.equal(result.response.status, 403);
    assert.match(result.body.error, /Invite code/);
  });
});

test("request bodies over 32 KiB are rejected", async () => {
  await withService({}, async ({ base }) => {
    const result = await request(base, "/api/feedback", postOptions("x".repeat(MAX_BODY_BYTES + 1)));
    assert.equal(result.response.status, 413);
  });
});

test("CORS preflight allows the visualization origins and rejects other origins", async () => {
  await withService({}, async ({ base }) => {
    const allowed = await request(base, "/api/feedback", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:8888" }
    });
    assert.equal(allowed.response.status, 204);
    assert.equal(allowed.response.headers.get("access-control-allow-origin"), "http://127.0.0.1:8888");
    assert.match(allowed.response.headers.get("access-control-allow-headers"), /X-Feedback-Invite/);
    const denied = await request(base, "/api/feedback", {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example" }
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.response.headers.get("access-control-allow-origin"), null);
  });
});

test("same id and content is duplicate while changed content is conflict", async () => {
  await withService({}, async ({ base, dataFile }) => {
    const first = await request(base, "/api/feedback", postOptions(envelope()));
    const duplicate = await request(base, "/api/feedback", postOptions(envelope()));
    assert.equal(first.body.status, "created");
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.body.status, "duplicate");
    assert.equal(duplicate.body.receiptId, first.body.receiptId);
    assert.equal((await fs.promises.readFile(dataFile, "utf8")).trim().split("\n").length, 1);

    const changed = validRecord({ suggestion: "同一编号下不同的改进建议。" });
    const conflict = await request(base, "/api/feedback", postOptions(envelope(changed)));
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.status, "conflict");
  });
});

test("malicious HTML, local paths and access tokens are sanitized again by the server", async () => {
  await withService({}, async ({ base, dataFile }) => {
    const malicious = validRecord({
      suggestion: '<script>run()</script><iframe src="bad"></iframe><img onload="bad()" src="javascript:x"> glpat-abcdefghijk /home/student/private'
    });
    const result = await request(base, "/api/feedback", postOptions(envelope(malicious)));
    assert.equal(result.response.status, 201);
    const stored = await fs.promises.readFile(dataFile, "utf8");
    assert.doesNotMatch(stored, /<script|<iframe|onload|javascript:|abcdefghijk|\/home\/student/i);
    assert.match(stored, /已过滤|已隐藏凭据|\$HOME/);
  });
});

test("rate limiting applies per source", async () => {
  await withService({ rateLimit: { maximum: 2, windowMs: 60_000 } }, async ({ base }) => {
    const first = await request(base, "/api/feedback", postOptions(envelope()));
    const second = await request(base, "/api/feedback", postOptions(envelope()));
    const third = await request(base, "/api/feedback", postOptions(envelope()));
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 200);
    assert.equal(third.response.status, 429);
  });
});

test("JSONL write failure never returns success", async () => {
  const fileApi = {
    ...fs.promises,
    appendFile: async () => { throw new Error("disk full"); }
  };
  await withService({ fileApi }, async ({ base }) => {
    const result = await request(base, "/api/feedback", postOptions(envelope()));
    assert.equal(result.response.status, 500);
    assert.equal(result.body.ok, false);
  });
});

test("a legal run record is stored separately with an idempotent receipt", async () => {
  await withService({}, async ({ base, dataFile, service }) => {
    const first = await request(base, "/api/run-record", postOptions(runEnvelope()));
    const duplicate = await request(base, "/api/run-record", postOptions(runEnvelope()));
    assert.equal(first.response.status, 201);
    assert.equal(first.body.status, "created");
    assert.equal(first.body.runId, "lab2-solution-run");
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.body.status, "duplicate");
    assert.equal(duplicate.body.receiptId, first.body.receiptId);
    const runLines = (await fs.promises.readFile(service.runDataFile, "utf8")).trim().split("\n");
    assert.equal(runLines.length, 1);
    assert.equal(JSON.parse(runLines[0]).protocol, runSubmission.RUN_SUBMIT_PROTOCOL);
    await assert.rejects(fs.promises.access(dataFile));
  });
});

test("same runId with different content is conflict and never overwrites", async () => {
  await withService({}, async ({ base, service }) => {
    const first = await request(base, "/api/run-record", postOptions(runEnvelope()));
    const changed = validRun();
    changed.error = "different sanitized evidence";
    const conflict = await request(base, "/api/run-record", postOptions(runEnvelope(changed)));
    assert.equal(first.response.status, 201);
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.status, "conflict");
    assert.equal((await fs.promises.readFile(service.runDataFile, "utf8")).trim().split("\n").length, 1);
  });
});

test("run endpoint rejects unknown protocols, missing IDs, too many events and oversized bodies", async () => {
  await withService({}, async ({ base }) => {
    const submitProtocol = await request(base, "/api/run-record", postOptions({
      protocol: "os-demo.run.submit/v2",
      run: validRun()
    }));
    assert.equal(submitProtocol.response.status, 400);

    const eventProtocol = validRun();
    eventProtocol.events[0].protocol = "os-demo.event/v0";
    const incompatible = await request(base, "/api/run-record", postOptions(runEnvelope(eventProtocol)));
    assert.equal(incompatible.response.status, 422);
    assert.equal(incompatible.body.code, "unsupported_event_protocol");

    const missingId = validRun();
    missingId.runId = "";
    const missing = await request(base, "/api/run-record", postOptions(runEnvelope(missingId)));
    assert.equal(missing.response.status, 422);

    const excessive = validRun();
    excessive.events = Array.from({ length: 513 }, (_, index) => ({
      protocol: "os-demo.event/v1", lab: "lab2", step: "stvec-installed", status: "running",
      detail: "event", source: "tagged", sequence: index, timestamp: index
    }));
    const tooMany = await request(base, "/api/run-record", postOptions(runEnvelope(excessive)));
    assert.equal(tooMany.response.status, 422);
    assert.equal(tooMany.body.code, "too_many_events");

    const oversized = await request(base, "/api/run-record", postOptions("x".repeat(MAX_RUN_BODY_BYTES + 1)));
    assert.equal(oversized.response.status, 413);
  });
});

test("run records are sanitized again and a run JSONL write failure returns no success", async () => {
  await withService({}, async ({ base, service }) => {
    const malicious = validRun();
    malicious.events[0].detail = '<script>run()</script> /home/student/private glpat-abcdefghijk';
    malicious.rawOutput = "complete log";
    malicious.sourceCode = "fn secret() {}";
    const result = await request(base, "/api/run-record", postOptions(runEnvelope(malicious)));
    assert.equal(result.response.status, 201);
    const stored = await fs.promises.readFile(service.runDataFile, "utf8");
    assert.doesNotMatch(stored, /<script|student|glpat-|complete log|fn secret/i);
  });

  const fileApi = {
    ...fs.promises,
    appendFile: async () => { throw new Error("disk full"); }
  };
  await withService({ fileApi }, async ({ base }) => {
    const result = await request(base, "/api/run-record", postOptions(runEnvelope()));
    assert.equal(result.response.status, 500);
    assert.equal(result.body.ok, false);
  });
});

test("the public feedback port never serves the teacher admin page", async () => {
  await withService({}, async ({ base }) => {
    assert.equal((await request(base, "/")).response.status, 404);
    assert.equal((await request(base, "/admin")).response.status, 404);
    assert.equal((await request(base, "/api/export.json")).response.status, 404);
    assert.equal((await request(base, "/api/run-records")).response.status, 404);
  });
});
