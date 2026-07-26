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

  const page = await fetch(url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /OS 学习地图/);
  assert.match(html, /停止当前运行/);

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

  const idleStop = await fetch(`${url}/api/stop`, { method: "POST" });
  assert.equal(idleStop.status, 409);
  socket.close();
});
