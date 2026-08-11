"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const feedback = require("../docs/interactive-demo/feedback.js");
const adminModel = require("../docs/feedback-admin/admin-model.js");
const runAdminModel = require("../docs/feedback-admin/run-admin-model.js");
const { createRunRecord } = require("../docs/interactive-demo/run-history.js");
const runSubmission = require("../docs/interactive-demo/run-submission.js");
const {
  canonicalHash
} = require("./feedback-server.js");
const {
  createFeedbackAdminService,
  normalizeFilters,
  normalizeRunFilters,
  parseArgs,
  readStoredRecords,
  readStoredRunRecords,
  requestHasLocalHost
} = require("./feedback-admin-server.js");

function completeInput(context, overrides = {}) {
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
    mostHelpful: "知识地图帮助我理解调用链。",
    stillConfusing: "Trap 返回仍需练习。",
    suggestion: "增加一次失败演示。",
    includeContext: true,
    ...overrides
  };
}

function storedRecord(options = {}) {
  const lab = options.lab || "lab2";
  const variant = options.variant || "starter";
  const context = {
    branch: `${lab}-${variant}`,
    lab,
    variant,
    commit: "abcd1234"
  };
  const record = feedback.buildFeedbackRecord(
    completeInput(context, { role: options.role || "student", suggestion: options.suggestion }),
    context,
    {
      now: new Date(options.createdAt || "2026-08-11T01:02:03Z"),
      idSuffix: options.suffix || "ADMIN"
    }
  );
  return {
    storageVersion: 1,
    protocol: feedback.FEEDBACK_SUBMIT_PROTOCOL,
    receiptId: `RCPT-${options.suffix || "ADMIN"}`,
    receivedAt: "2026-08-11T01:03:00.000Z",
    contentHash: canonicalHash(record),
    feedback: record
  };
}

function storedRunRecord(options = {}) {
  const lab = options.lab || "lab2";
  const role = options.role || "starter";
  const internal = createRunRecord({
    id: options.runId || `${lab}-${role}-admin-run`,
    context: { branch: `${lab}-${role}`, commit: "abcdef1234567890", lab, variant: role },
    events: [
      { protocol: "os-demo.event/v1", lab, step: "start", status: "running", detail: "start", source: "tagged", sequence: 1, timestamp: 1000 },
      { protocol: "os-demo.event/v1", lab, step: options.result === "todo" ? "task-1-todo" : "pass", status: options.result === "todo" ? "todo" : "pass", detail: "result", source: "tagged", sequence: 2, timestamp: 1200 }
    ],
    lifecycle: { buildResult: "success", runResult: "finished", completed: true },
    startedAt: 1000,
    endedAt: 1600,
    exitCode: 0
  });
  const run = runSubmission.sanitizeRunRecordForSubmission(internal);
  const feedbackId = options.feedbackId || null;
  return {
    storageVersion: 1,
    protocol: runSubmission.RUN_SUBMIT_PROTOCOL,
    receiptId: `RUN-RCPT-${options.suffix || "ADMIN"}`,
    receivedAt: "2026-08-11T01:04:00.000Z",
    contentHash: canonicalHash({ run, feedbackId }),
    feedbackId,
    run
  };
}

async function writeJsonl(dataDir, records) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dataDir, "feedback.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8"
  );
}

async function writeRunJsonl(dataDir, records) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  if (!records.length) return;
  await fs.promises.writeFile(
    path.join(dataDir, "runs.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8"
  );
}

async function request(base, pathname) {
  const response = await fetch(`${base}${pathname}`);
  return { response, text: await response.text() };
}

async function withAdmin(records, callback, runRecords = []) {
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "os-feedback-admin-test-"));
  await writeJsonl(dataDir, records);
  await writeRunJsonl(dataDir, runRecords);
  const service = createFeedbackAdminService({
    port: 0,
    dataDir,
    now: () => new Date("2026-08-11T02:00:00Z")
  });
  const address = await service.listen();
  try {
    await callback({ base: `http://127.0.0.1:${address.port}`, address, dataDir, service });
  } finally {
    await service.close();
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
}

function rawRequest(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/",
      method: "GET",
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

test("admin filters records and calculates five-question statistics", () => {
  const records = [
    storedRecord({ suffix: "ONE" }),
    storedRecord({ lab: "lab4", variant: "solution", role: "teacher", suffix: "TWO" })
  ];
  const filtered = adminModel.filterRecords(records, { lab: "lab2", variant: "starter", role: "student" });
  assert.equal(filtered.length, 1);
  const summary = adminModel.summarizeRecords(filtered);
  assert.equal(summary.count, 1);
  assert.equal(summary.questions.length, 5);
  assert.ok(summary.questions.every((question) => question.average === 4));
  assert.equal(summary.comments.length, 1);
});

test("JSON, CSV and Markdown exports contain filtered feedback without executable markup", () => {
  const records = [storedRecord({ suffix: "EXPORT", suggestion: "<img src=x onerror=alert(1)> =cmd" })];
  const json = adminModel.exportJson(records, new Date("2026-08-11T02:00:00Z"));
  const csv = adminModel.exportCsv(records);
  const markdown = adminModel.exportMarkdown(records, new Date("2026-08-11T02:00:00Z"));
  assert.equal(JSON.parse(json).protocol, "os-demo.feedback.export/v1");
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /feedbackId/);
  assert.match(markdown, /OS 教学实验评价汇总/);
  assert.doesNotMatch(json, /onerror|alert\(/i);
  assert.doesNotMatch(markdown, /onerror|alert\(/i);
});

test("admin server serves local assets, filtered records and three export formats", async () => {
  const records = [
    storedRecord({ suffix: "LOCAL" }),
    storedRecord({ lab: "lab4", variant: "solution", role: "teacher", suffix: "OTHER" })
  ];
  await withAdmin(records, async ({ base }) => {
    const page = await request(base, "/");
    assert.equal(page.response.status, 200);
    assert.match(page.text, /OS 教学评价本地查看/);
    assert.match(page.response.headers.get("content-security-policy"), /default-src 'self'/);

    const filtered = await request(base, "/api/feedback?lab=lab2&variant=starter&role=student");
    assert.equal(filtered.response.status, 200);
    assert.equal(JSON.parse(filtered.text).count, 1);

    const json = await request(base, "/api/export.json?lab=lab2");
    const csv = await request(base, "/api/export.csv?lab=lab2");
    const markdown = await request(base, "/api/export.md?lab=lab2");
    assert.equal(JSON.parse(json.text).count, 1);
    assert.match(csv.response.headers.get("content-type"), /text\/csv/);
    assert.match(markdown.text, /评价数量：1/);
  });
});

test("admin server rejects external Host headers and cannot bind publicly", async () => {
  assert.throws(() => parseArgs(["--host", "0.0.0.0"]), /127\.0\.0\.1/);
  await withAdmin([], async ({ address }) => {
    const result = await rawRequest(address.port, { Host: "feedback.example.com" });
    assert.equal(result.status, 403);
    assert.match(result.body, /localhost only/);
  });
});

test("invalid filters and damaged JSONL records degrade safely", async () => {
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "os-feedback-admin-lines-"));
  try {
    const good = storedRecord({ suffix: "GOOD" });
    await fs.promises.writeFile(
      path.join(dataDir, "feedback.jsonl"),
      `{broken}\n${JSON.stringify(good)}\n${JSON.stringify({ storageVersion: 7 })}\n`,
      "utf8"
    );
    const records = await readStoredRecords(path.join(dataDir, "feedback.jsonl"));
    assert.equal(records.length, 1);
    assert.throws(() => normalizeFilters(new URLSearchParams("lab=lab99")), /Unknown Lab/);
  } finally {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test("admin browser renderer uses textContent and never innerHTML", async () => {
  const source = await fs.promises.readFile(path.join(__dirname, "..", "docs", "feedback-admin", "app.js"), "utf8");
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.equal(requestHasLocalHost({ headers: { host: "127.0.0.1:8891" } }), true);
  assert.equal(requestHasLocalHost({ headers: { host: "example.com" } }), false);
});

test("run admin model filters records and resolves event names and knowledge from the catalog", () => {
  const records = [
    storedRunRecord({ runId: "starter-one", role: "starter", result: "todo", suffix: "ONE" }),
    storedRunRecord({ runId: "solution-two", role: "solution", result: "pass", suffix: "TWO", feedbackId: "FDBK-TWO" })
  ];
  const filtered = runAdminModel.filterRunRecords(records, { lab: "lab2", role: "solution", result: "pass" });
  assert.equal(filtered.length, 1);
  const summary = runAdminModel.summarizeRun(filtered[0]);
  assert.equal(summary.runId, "solution-two");
  assert.equal(summary.commit, "abcdef123456");
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.feedbackId, "FDBK-TWO");
  assert.ok(summary.events.every((event) => event.name && event.knowledge));
  assert.equal(summary.events[1].deltaMs, 200);
});

test("run admin JSON, CSV and Markdown exports remain text-only summaries", () => {
  const stored = storedRunRecord({ runId: "export-run", suffix: "EXPORT" });
  stored.run.events[0].detail = "<img src=x onerror=run()>";
  const json = runAdminModel.exportRunJson([stored], new Date("2026-08-11T02:00:00Z"));
  const csv = runAdminModel.exportRunCsv([stored]);
  const markdown = runAdminModel.exportRunMarkdown([stored], new Date("2026-08-11T02:00:00Z"));
  assert.equal(JSON.parse(json).protocol, "os-demo.run.collection/v1");
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /runId/);
  assert.match(markdown, /OS 实验自愿提交运行记录汇总/);
  assert.doesNotMatch(markdown, /<img|onerror|run\(\)/i);
});

test("admin server serves run filters, timeline data and three run export formats", async () => {
  const runs = [
    storedRunRecord({ runId: "starter-run", role: "starter", result: "todo", suffix: "START" }),
    storedRunRecord({ runId: "solution-run", role: "solution", result: "pass", suffix: "SOL" })
  ];
  await withAdmin([], async ({ base }) => {
    const page = await request(base, "/");
    assert.match(page.text, /学生自愿提交的实验运行记录/);

    const filtered = await request(base, "/api/run-records?lab=lab2&runRole=solution&result=pass");
    assert.equal(filtered.response.status, 200);
    const body = JSON.parse(filtered.text);
    assert.equal(body.count, 1);
    assert.equal(body.records[0].run.runId, "solution-run");

    const json = await request(base, "/api/runs/export.json?runRole=starter");
    const csv = await request(base, "/api/runs/export.csv?runRole=starter");
    const markdown = await request(base, "/api/runs/export.md?runRole=starter");
    assert.equal(JSON.parse(json.text).count, 1);
    assert.match(csv.response.headers.get("content-type"), /text\/csv/);
    assert.match(markdown.text, /starter-run/);
  }, runs);
});

test("damaged run JSONL and invalid run filters degrade safely", async () => {
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "os-run-admin-lines-"));
  try {
    const good = storedRunRecord({ runId: "good-run", suffix: "GOOD" });
    await fs.promises.writeFile(
      path.join(dataDir, "runs.jsonl"),
      `{broken}\n${JSON.stringify(good)}\n${JSON.stringify({ storageVersion: 9 })}\n`,
      "utf8"
    );
    const records = await readStoredRunRecords(path.join(dataDir, "runs.jsonl"));
    assert.equal(records.length, 1);
    assert.throws(() => normalizeRunFilters(new URLSearchParams("result=excellent")), /Unknown run result/);
  } finally {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});
