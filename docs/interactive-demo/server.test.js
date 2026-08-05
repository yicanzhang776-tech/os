"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");
const { spawn } = require("node:child_process");

const serverPath = path.join(__dirname, "server.js");
const repoDir = path.resolve(__dirname, "..", "..");

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function waitForHealth(url, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return response.json();
    } catch (_) {
      // The child may still be binding its loopback port.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Bridge did not become healthy.\n${stderr()}`);
}

function waitForMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for a WebSocket teaching event."));
    }, 3000);
    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    }
    socket.addEventListener("message", onMessage);
  });
}

test("bridge serves the learning map and turns serial evidence into WebSocket events", {
  timeout: 10000
}, async (t) => {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverPath, "--stdin", "--port", String(port)], {
    cwd: repoDir,
    env: { ...process.env, OS_DEMO_BRANCH: "lab5-starter" },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let childStderr = "";
  child.stderr.on("data", (chunk) => {
    childStderr += chunk;
  });
  t.after(() => {
    if (!child.killed) child.kill();
  });

  const health = await waitForHealth(url, () => childStderr);
  assert.equal(health.ok, true);
  assert.equal(health.context.branch, "lab5-starter");
  assert.equal(health.context.lab, "lab5");
  assert.equal(health.context.variant, "starter");
  assert.equal(health.protocol, "os-demo.event/v1");
  assert.equal(health.target, "riscv64gc-unknown-none-elf");

  const page = await fetch(url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /OS实验可视化展示/);
  assert.match(html, /停止当前运行/);
  assert.match(html, /先预测，再运行/);
  assert.match(html, /预计构建结果/);
  assert.match(html, /预计运行结果/);
  assert.match(html, /预计出现的关键事件/);
  assert.match(html, /预计最终 PASS 标志/);
  assert.match(html, /预测与实际对照/);
  assert.match(html, /预测正确/);
  assert.match(html, /预测遗漏/);
  assert.match(html, /实际未出现/);
  assert.match(html, /结果相反/);
  assert.match(html, /额外关键事件/);
  assert.match(html, /无法判断/);
  assert.match(html, /不计算成绩，也不进行排名/);
  assert.match(html, /完整时间线与分支差异/);
  assert.match(html, /starter \/ solution 对比/);
  assert.match(html, /教学评价与反馈/);
  assert.match(html, /前往 GitLab 确认提交/);
  assert.doesNotMatch(html, /这套实验是否真的帮助了你/);
  assert.match(html, /当前实验教学评价五题/);
  assert.match(html, /补充反馈/);
  assert.match(html, /事件—代码—知识联动/);
  assert.match(html, /starter 最终状态/);
  assert.match(html, /发生变化的状态/);
  assert.match(html, /事件序列差异（保留原有比较）/);
  assert.match(html, /<script src="feedback-questions\.js"><\/script>[\s\S]*<script src="feedback\.js"><\/script>[\s\S]*<script src="event-catalog\.js"><\/script>[\s\S]*<script src="prediction-model\.js"><\/script>[\s\S]*<script src="state-model\.js"><\/script>[\s\S]*<script src="state-diff\.js"><\/script>[\s\S]*<script src="run-history\.js"><\/script>[\s\S]*<script src="app\.js"><\/script>/);

  const feedbackQuestions = await fetch(`${url}/feedback-questions.js`);
  assert.equal(feedbackQuestions.status, 200);
  assert.match(await feedbackQuestions.text(), /Lab7 · 设备与简化文件系统教学评价/);

  const feedbackModule = await fetch(`${url}/feedback.js`);
  assert.equal(feedbackModule.status, 200);
  assert.match(await feedbackModule.text(), /buildFeedbackMarkdown/);

  const eventCatalogModule = await fetch(`${url}/event-catalog.js`);
  assert.equal(eventCatalogModule.status, 200);
  assert.match(await eventCatalogModule.text(), /resolveEventKnowledge/);

  const predictionModelModule = await fetch(`${url}/prediction-model.js`);
  assert.equal(predictionModelModule.status, 200);
  assert.match(await predictionModelModule.text(), /comparePrediction/);

  const stateModelModule = await fetch(`${url}/state-model.js`);
  assert.equal(stateModelModule.status, 200);
  assert.match(await stateModelModule.text(), /computeState/);

  const stateDiffModule = await fetch(`${url}/state-diff.js`);
  assert.equal(stateDiffModule.status, 200);
  assert.match(await stateDiffModule.text(), /diffStates/);

  const runHistoryModule = await fetch(`${url}/run-history.js`);
  assert.equal(runHistoryModule.status, 200);
  assert.match(await runHistoryModule.text(), /compareRuns/);

  const preflight = await fetch(`${url}/api/preflight`).then((response) => response.json());
  assert.equal(preflight.target, "riscv64gc-unknown-none-elf");
  assert.equal(Array.isArray(preflight.checks), true);
  assert.deepEqual(preflight.checks.map((check) => check.name), ["git", "cargo", "Rust target", "QEMU"]);

  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const historyPromise = waitForMessage(socket, (message) => message.type === "history");
  const history = await historyPromise;
  assert.equal(history.context.branch, "lab5-starter");

  const telemetryPromise = waitForMessage(
    socket,
    (message) => message.type === "telemetry" && message.step === "scheduler-ready"
  );
  child.stdin.write("[Lab5] scheduler initialized\n");
  const telemetry = await telemetryPromise;
  assert.equal(telemetry.lab, "lab5");
  assert.equal(telemetry.status, "running");
  assert.equal(telemetry.source, "console");
  assert.equal(telemetry.protocol, "os-demo.event/v1");
  assert.match(telemetry.runId, /^external-/);

  const idleStop = await fetch(`${url}/api/stop`, { method: "POST" });
  assert.equal(idleStop.status, 409);
  socket.close();
});
