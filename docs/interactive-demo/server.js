"use strict";

// Dependency-free local bridge:
// current Git branch + build/QEMU output -> normalized teaching events -> browser.
// The server only listens on loopback and never sends experiment output online.

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
  EVENT_PROTOCOL,
  normalizeTeachingEvent,
  parseBranchContext,
  parseKernelLine
} = require("./protocol");

const publicDir = __dirname;
const repoDir = path.resolve(__dirname, "..", "..");
const runKernelOnStart = process.argv.includes("--run");
const readSerialFromStdin = process.argv.includes("--stdin");
const portFlag = process.argv.indexOf("--port");
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 8888;
const host = "127.0.0.1";
const rustTarget = process.env.OS_DEMO_TARGET || "riscv64gc-unknown-none-elf";
const cargoCommand = process.env.CARGO || "cargo";
const qemuCommand = process.env.QEMU || "qemu-system-riscv64";
const clients = new Set();
const eventHistory = [];
const consoleHistory = [];
const staticAssets = new Map();
const staticAssetNames = [
  "index.html",
  "styles.css",
  "feedback-questions.js",
  "feedback.js",
  "event-catalog.js",
  "prediction-model.js",
  "state-model.js",
  "state-diff.js",
  "run-history.js",
  "app.js"
];
let sequence = 0;
let currentChild = null;
let runPromise = null;
let activeRunContext = null;
let activeRunId = null;
let activeRunStartedAt = null;
let activeBuildResult = null;
let activeQemuResult = null;
let stopRequested = false;
let currentContext = readWorkspaceContext();
let runState = {
  phase: "idle",
  running: false,
  detail: "等待运行当前分支",
  timestamp: Date.now()
};
let lastEventKey = "";
let lastEventTime = 0;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be an integer from 1 to 65535.");
}

for (const asset of staticAssetNames) {
  staticAssets.set(asset, fs.readFileSync(path.join(publicDir, asset)));
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function gitValue(args, fallback) {
  const result = spawnSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return fallback;
  return result.stdout.trim() || fallback;
}

function readWorkspaceContext() {
  const branch = process.env.OS_DEMO_BRANCH
    || gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const commit = gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  return { ...parseBranchContext(branch), commit };
}

function createRunId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function commandCheck(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoDir,
    encoding: "utf8",
    windowsHide: true
  });
  const detail = String(result.stdout || result.stderr || result.error?.message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return {
    name,
    ok: !result.error && result.status === 0,
    detail: detail || (result.status === 0 ? "available" : `exit ${result.status}`)
  };
}

function readLinuxPreflight() {
  const checks = [
    commandCheck("git", "git", ["rev-parse", "--is-inside-work-tree"]),
    commandCheck("cargo", cargoCommand, ["--version"]),
    commandCheck("Rust target", process.env.RUSTC || "rustc", ["--print", "target-libdir", "--target", rustTarget]),
    commandCheck("QEMU", qemuCommand, ["--version"])
  ];
  return {
    ok: checks.every((check) => check.ok),
    target: rustTarget,
    checks
  };
}

function sendWebSocketMessage(socket, message) {
  const payload = Buffer.from(JSON.stringify(message));
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    throw new Error("Teaching event payload is unexpectedly large.");
  }
  socket.write(Buffer.concat([header, payload]));
}

function broadcast(message) {
  for (const socket of clients) {
    if (!socket.destroyed) sendWebSocketMessage(socket, message);
  }
}

function setRunState(phase, detail, extra = {}) {
  runState = {
    phase,
    running: ["building", "running", "stopping"].includes(phase),
    detail,
    timestamp: Date.now(),
    ...extra
  };
  broadcast({ type: "run-state", state: runState });
}

function publishConsole(line, channel) {
  const clean = String(line || "").replace(/\r/g, "").trim();
  if (!clean) return;
  const item = {
    type: "console",
    line: clean.slice(0, 500),
    channel,
    timestamp: Date.now()
  };
  consoleHistory.push(item);
  if (consoleHistory.length > 60) consoleHistory.shift();
  broadcast(item);
}

function publishTelemetry(parsed, rawLine) {
  const normalized = normalizeTeachingEvent(parsed);
  if (!normalized) return;
  const now = Date.now();
  const key = `${normalized.lab}:${normalized.step}:${normalized.status}`;
  if (key === lastEventKey && now - lastEventTime < 250) return;
  lastEventKey = key;
  lastEventTime = now;
  sequence += 1;

  const item = {
    type: "telemetry",
    ...normalized,
    raw: rawLine,
    branch: activeRunContext?.branch || currentContext.branch,
    commit: activeRunContext?.commit || currentContext.commit,
    runId: activeRunId || `external-${process.pid}`,
    sequence,
    timestamp: now
  };
  eventHistory.push(item);
  if (eventHistory.length > 512) eventHistory.shift();
  broadcast(item);
}

function inspectKernelLine(line, channel = "serial") {
  const clean = String(line || "").replace(/\r/g, "").trim();
  if (!clean) return;
  publishConsole(clean, channel);
  const parsed = parseKernelLine(clean);
  if (parsed) publishTelemetry(parsed, clean);
}

function bridgeTextStream(stream) {
  let remainder = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    remainder += chunk;
    const lines = remainder.split("\n");
    remainder = lines.pop();
    lines.forEach((line) => inspectKernelLine(line, "stdin"));
  });
  stream.on("end", () => inspectKernelLine(remainder, "stdin"));
}

function streamProcess(command, args, label, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoDir,
      windowsHide: true
    });
    currentChild = child;
    const remainder = { stdout: "", stderr: "" };

    const consume = (source, chunk) => {
      const text = chunk.toString();
      process[source].write(text);
      remainder[source] += text;
      const lines = remainder[source].split("\n");
      remainder[source] = lines.pop();
      for (const line of lines) {
        if (options.parseKernel) inspectKernelLine(line, source);
        else publishConsole(line, options.channel || label.toLowerCase());
      }
    };

    child.stdout.on("data", (chunk) => consume("stdout", chunk));
    child.stderr.on("data", (chunk) => consume("stderr", chunk));
    child.on("error", (error) => {
      currentChild = null;
      reject(new Error(`${label} could not start: ${error.message}`));
    });
    child.on("close", (code) => {
      for (const source of ["stdout", "stderr"]) {
        if (!remainder[source]) continue;
        if (options.parseKernel) inspectKernelLine(remainder[source], source);
        else publishConsole(remainder[source], options.channel || label.toLowerCase());
      }
      currentChild = null;
      resolve(code);
    });
  });
}

async function runQemuAndBridge() {
  currentContext = readWorkspaceContext();
  activeRunContext = currentContext;
  activeRunId = createRunId();
  activeRunStartedAt = Date.now();
  activeBuildResult = null;
  activeQemuResult = null;
  sequence = 0;
  eventHistory.length = 0;
  consoleHistory.length = 0;
  lastEventKey = "";
  broadcast({
    type: "run-start",
    protocol: EVENT_PROTOCOL,
    runId: activeRunId,
    context: activeRunContext,
    timestamp: activeRunStartedAt
  });

  setRunState("building", `正在构建 ${activeRunContext.branch}`, {
    branch: activeRunContext.branch,
    runId: activeRunId,
    target: rustTarget
  });
  console.log(`[demo] Building branch ${activeRunContext.branch}...`);
  const buildCode = await streamProcess(
    cargoCommand,
    ["build", "-p", "ai-os-kernel", "--target", rustTarget, "--color", "never"],
    "cargo",
    { channel: "build" }
  );
  if (stopRequested) {
    finishStoppedRun();
    return;
  }
  if (buildCode !== 0) {
    activeBuildResult = "failure";
    throw new Error(`cargo build failed with exit code ${buildCode}.`);
  }
  activeBuildResult = "success";

  const kernel = path.join(
    repoDir,
    "target",
    rustTarget,
    "debug",
    "ai-os-kernel"
  );
  setRunState("running", `QEMU 正在运行 ${activeRunContext.branch}`, {
    branch: activeRunContext.branch,
    runId: activeRunId,
    target: rustTarget,
    buildResult: activeBuildResult,
    runResult: "running"
  });
  console.log("[demo] Starting QEMU; serial output is now forwarded to the browser.");
  const qemuCode = await streamProcess(
    qemuCommand,
    ["-machine", "virt", "-nographic", "-bios", "default", "-kernel", kernel],
    "QEMU",
    { parseKernel: true, channel: "serial" }
  );
  if (stopRequested) {
    finishStoppedRun();
    return;
  }

  activeQemuResult = qemuCode === 0 ? "finished" : "failure";

  setRunState("finished", `QEMU 已退出（code ${qemuCode}）`, {
    branch: activeRunContext.branch,
    exitCode: qemuCode,
    runId: activeRunId,
    buildResult: activeBuildResult,
    runResult: activeQemuResult
  });
  broadcast({
    type: "run-end",
    protocol: EVENT_PROTOCOL,
    runId: activeRunId,
    context: activeRunContext,
    exitCode: qemuCode,
    buildResult: activeBuildResult,
    runResult: activeQemuResult,
    startedAt: activeRunStartedAt,
    timestamp: Date.now()
  });
  console.log(`[demo] QEMU exited with code ${qemuCode}.`);
  activeRunContext = null;
  activeRunId = null;
  activeRunStartedAt = null;
  activeBuildResult = null;
  activeQemuResult = null;
}

function finishStoppedRun() {
  const context = activeRunContext || currentContext;
  const runId = activeRunId;
  const stoppedRunResult = activeBuildResult === "success" ? "stopped" : null;
  setRunState("stopped", `已停止 ${context.branch}`, {
    branch: context.branch,
    buildResult: activeBuildResult,
    runResult: stoppedRunResult
  });
  broadcast({
    type: "run-end",
    protocol: EVENT_PROTOCOL,
    runId,
    context,
    stopped: true,
    exitCode: null,
    buildResult: activeBuildResult,
    runResult: stoppedRunResult,
    startedAt: activeRunStartedAt,
    timestamp: Date.now()
  });
  console.log(`[demo] Stopped run for ${context.branch}.`);
  activeRunContext = null;
  activeRunId = null;
  activeRunStartedAt = null;
  activeBuildResult = null;
  activeQemuResult = null;
}

function startRun() {
  if (runPromise) return false;
  stopRequested = false;
  runPromise = runQemuAndBridge()
    .catch((error) => {
      if (stopRequested) {
        finishStoppedRun();
        return;
      }
      const branch = activeRunContext?.branch || currentContext.branch;
      if (activeBuildResult !== "success") activeBuildResult = "failure";
      else activeQemuResult = "failure";
      console.error(`[demo] ${error.message}`);
      setRunState("error", error.message, {
        branch,
        buildResult: activeBuildResult,
        runResult: activeQemuResult
      });
      broadcast({
        type: "run-error",
        protocol: EVENT_PROTOCOL,
        runId: activeRunId,
        context: activeRunContext || currentContext,
        message: error.message,
        buildResult: activeBuildResult,
        runResult: activeQemuResult,
        branch,
        startedAt: activeRunStartedAt,
        timestamp: Date.now()
      });
      activeRunContext = null;
      activeRunId = null;
      activeRunStartedAt = null;
      activeBuildResult = null;
      activeQemuResult = null;
    })
    .finally(() => {
      runPromise = null;
    });
  return true;
}

function stopRun() {
  if (!runPromise) return false;
  stopRequested = true;
  const branch = activeRunContext?.branch || currentContext.branch;
  setRunState("stopping", `正在停止 ${branch}`, { branch, runId: activeRunId });
  if (currentChild && !currentChild.killed) currentChild.kill();
  return true;
}

function refreshBranchContext() {
  const next = readWorkspaceContext();
  if (next.branch === currentContext.branch && next.commit === currentContext.commit) return;

  const previous = currentContext;
  currentContext = next;
  if (!runPromise) {
    eventHistory.length = 0;
    consoleHistory.length = 0;
    sequence = 0;
  }
  broadcast({
    type: "branch-change",
    context: currentContext,
    previous,
    protocol: EVENT_PROTOCOL,
    activeRunBranch: activeRunContext?.branch || null,
    timestamp: Date.now()
  });
  if (!runPromise) {
    setRunState("idle", `已切换到 ${currentContext.branch}，等待运行`, {
      branch: currentContext.branch
    });
  }
  console.log(`[demo] Workspace branch changed: ${previous.branch} -> ${currentContext.branch}`);
}

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(value));
}

function requestHasLocalOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}:${port}`;
}

function isInsideRepo(candidate) {
  const relative = path.relative(repoDir, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const server = http.createServer((request, response) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  } catch (_) {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (requestPath === "/health") {
    writeJson(response, 200, {
      ok: true,
      protocol: EVENT_PROTOCOL,
      target: rustTarget,
      clients: clients.size,
      context: currentContext,
      runState
    });
    return;
  }

  if (requestPath === "/api/context" && request.method === "GET") {
    writeJson(response, 200, {
      protocol: EVENT_PROTOCOL,
      target: rustTarget,
      context: currentContext,
      runState
    });
    return;
  }

  if (requestPath === "/api/preflight" && request.method === "GET") {
    writeJson(response, 200, readLinuxPreflight());
    return;
  }

  if (requestPath === "/api/run" && request.method === "POST") {
    if (!requestHasLocalOrigin(request)) {
      writeJson(response, 403, { ok: false, error: "Origin is not local." });
      return;
    }
    const preflight = readLinuxPreflight();
    if (!preflight.ok) {
      const missing = preflight.checks.filter((check) => !check.ok).map((check) => check.name).join(", ");
      writeJson(response, 412, {
        ok: false,
        error: `Linux run preflight failed: ${missing}.`,
        preflight
      });
      return;
    }
    if (!startRun()) {
      writeJson(response, 409, { ok: false, error: "A build or QEMU run is already active." });
      return;
    }
    writeJson(response, 202, {
      ok: true,
      protocol: EVENT_PROTOCOL,
      context: currentContext,
      target: rustTarget
    });
    return;
  }

  if (requestPath === "/api/stop" && request.method === "POST") {
    if (!requestHasLocalOrigin(request)) {
      writeJson(response, 403, { ok: false, error: "Origin is not local." });
      return;
    }
    if (!stopRun()) {
      writeJson(response, 409, { ok: false, error: "No build or QEMU run is active." });
      return;
    }
    writeJson(response, 202, { ok: true });
    return;
  }

  if (requestPath.startsWith("/source/")) {
    const sourcePath = path.resolve(repoDir, requestPath.slice("/source/".length));
    if (!isInsideRepo(sourcePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.stat(sourcePath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      });
      fs.createReadStream(sourcePath).pipe(response);
    });
    return;
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405).end("Method not allowed");
    return;
  }

  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const asset = staticAssets.get(relativePath);
  if (!asset) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[path.extname(relativePath)] || "application/octet-stream"
  });
  if (request.method === "HEAD") response.end();
  else response.end(asset);
});

server.on("upgrade", (request, socket) => {
  if (request.url !== "/ws" || !request.headers["sec-websocket-key"]) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));
  clients.add(socket);
  sendWebSocketMessage(socket, {
    type: "history",
    protocol: EVENT_PROTOCOL,
    context: currentContext,
    runState,
    activeRun: activeRunId ? {
      runId: activeRunId,
      context: activeRunContext,
      startedAt: activeRunStartedAt
    } : null,
    events: eventHistory,
    console: consoleHistory
  });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.on("data", (chunk) => {
    if ((chunk[0] & 0x0f) === 0x08) socket.end();
  });
});

const branchTimer = setInterval(refreshBranchContext, 1200);
branchTimer.unref();

server.listen(port, host, () => {
  console.log(`[demo] Open http://${host}:${port} for the live teaching view.`);
  console.log(`[demo] Tracking branch ${currentContext.branch} (${currentContext.variantLabel}).`);
  if (readSerialFromStdin) {
    console.log("[demo] Reading serial lines from standard input.");
    bridgeTextStream(process.stdin);
  }
  if (runKernelOnStart) startRun();
});

function shutdown() {
  clearInterval(branchTimer);
  if (currentChild && !currentChild.killed) currentChild.kill();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
