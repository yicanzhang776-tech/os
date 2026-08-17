"use strict";

// Dependency-free local bridge:
// current Git branch + build/QEMU output -> normalized teaching events -> browser.
// The browser bridge is loopback-only; the Agent route may send bounded results
// from the six server-owned teaching tools to the configured model service.

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
const { createAgentApi } = require("./agent/api");
const { createAgentLoop } = require("./agent/agent-loop");
const { createArkModelClient, isTrustedModelClientError } = require("./agent/model-client");
const { createProductionAgentHandler } = require("./agent/model-handler");
const {
  createGetCodeDiffTool,
  createGetContextTool,
  createGetQemuEventsTool,
  createGetRunResultTool,
  createReadCodeTool,
  createRunTestTool
} = require("./agent/tools");
const { getApprovedTest } = require("./agent/test-registry");
const {
  DEFAULT_RUN_TIMEOUTS,
  RunLifecycleManager,
  RunStore,
  SharedTaskLock,
  isLegacyLab2Panic,
  resolveLegacyPanicEvent,
  terminateChildProcess
} = require("./agent/run-store");

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
  "workspace.css",
  "theme-atlas.css",
  "feedback-questions.js",
  "feedback.js",
  "event-catalog.js",
  "prediction-model.js",
  "state-model.js",
  "state-diff.js",
  "run-history.js",
  "run-transfer.js",
  "run-submission.js",
  "ui-shell-state.js",
  "ui-shell.js",
  "agent-client.js",
  "agent-chat-state.js",
  "agent-entry-state.js",
  "agent-pet.js",
  "agent.html",
  "agent-page.css",
  "agent-page.js",
  "agent-panel.js",
  "timeline-controller.js",
  "diagnostics.js",
  "presentation-mode.js",
  "app.js",
  "assets/kernel-buddy.png"
];
let sequence = 0;
let currentChild = null;
let runPromise = null;
let currentContext = readWorkspaceContext();
const runStore = new RunStore();
const taskLock = new SharedTaskLock();
let runState = {
  phase: "idle",
  running: false,
  detail: "等待运行当前分支",
  timestamp: Date.now()
};
let lastEventKey = "";
let lastEventTime = 0;
const getContextTool = createGetContextTool({
  repoDir,
  target: rustTarget,
  readWorkspaceContext,
  getTaskSnapshot: readCurrentTaskSnapshot
});
const readCodeTool = createReadCodeTool({ repoDir, readWorkspaceContext });
const getQemuEventsTool = createGetQemuEventsTool({ readWorkspaceContext, runStore });
const getRunResultTool = createGetRunResultTool({ readWorkspaceContext, runStore });
const getCodeDiffTool = createGetCodeDiffTool({ repoDir, readWorkspaceContext });
const runLifecycle = new RunLifecycleManager({
  store: runStore,
  taskLock,
  timeouts: DEFAULT_RUN_TIMEOUTS,
  onRunStarted: handleRunStarted,
  onRunUpdated: handleRunUpdated,
  onRunCompleted: handleRunCompleted
});
const runTestTool = createRunTestTool({
  readWorkspaceContext,
  readPreflight: readLinuxPreflight,
  startApprovedRun: startAgentApprovedRun
});
const agentToolDispatch = Object.freeze({
  get_context: getContextTool,
  read_code: readCodeTool,
  get_qemu_events: getQemuEventsTool,
  get_run_result: getRunResultTool,
  get_code_diff: getCodeDiffTool,
  run_test: runTestTool
});
const arkModelClient = createArkModelClient({
  fetchImpl: globalThis.fetch,
  apiKeyProvider: () => process.env.ARK_API_KEY,
  baseUrl: process.env.ARK_BASE_URL,
  model: process.env.ARK_MODEL,
  diagnosticSink: process.env.OS_TUTOR_DEBUG_AGENT === "1"
    ? writeAgentModelDiagnostic
    : null
});
const agentLoop = createAgentLoop({
  model: arkModelClient,
  toolDispatch: agentToolDispatch,
  readContext: readWorkspaceContext,
  isTrustedModelError: isTrustedModelClientError
});
const handleAgentRequest = createProductionAgentHandler({ agentLoop });
const agentApi = createAgentApi({
  expectedOrigin: `http://${host}:${port}`,
  readWorkspaceContext,
  handleAgentRequest
});

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
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
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

function readCurrentTaskSnapshot() {
  const task = taskLock.getActiveTask();
  const activeRun = runStore.getActiveRun();
  const running = Boolean(task);
  return {
    running,
    kind: running ? task.kind : null,
    phase: running ? runState.phase : "idle",
    runId: running ? task.runId : null,
    startedAt: running ? activeRun?.startedAt || task.startedAt : null,
    canStop: running
  };
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
  const activeRun = runStore.getActiveRun();
  if (activeRun) runStore.recordOutput(activeRun.runId, item.line);
  broadcast(item);
}

function publishTelemetry(parsed, rawLine) {
  const activeRun = runStore.getActiveRun();
  const contextualRun = activeRun || { lab: currentContext.lab, activeObservedLab: null };
  const attributed = resolveLegacyPanicEvent(parsed, rawLine, contextualRun);
  const normalized = normalizeTeachingEvent(attributed);
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
    raw: String(rawLine || "").slice(0, 500),
    branch: activeRun?.branch || currentContext.branch,
    commit: activeRun?.commit || currentContext.commit,
    runId: activeRun?.runId || `external-${process.pid}`,
    sequence,
    timestamp: now
  };
  eventHistory.push(item);
  if (eventHistory.length > 512) eventHistory.shift();
  if (activeRun) {
    runStore.recordEvent(activeRun.runId, item, {
      observeLab: !isLegacyLab2Panic(rawLine)
    });
  }
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

function processStartError(label, error) {
  const failure = new Error(`${label} could not start: ${error?.message || "unknown error"}`);
  failure.code = "process_start_failed";
  return failure;
}

function streamProcess(command, args, label, options = {}) {
  let child = null;
  let settled = false;
  let resolvePromise;
  let rejectPromise;
  const remainder = { stdout: "", stderr: "" };
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const finish = (error, code = null) => {
    if (settled) return;
    settled = true;
    if (currentChild === child) currentChild = null;
    if (error) rejectPromise(error);
    else resolvePromise(code);
  };
  const consume = (source, chunk) => {
    if (settled) return;
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

  try {
    child = spawn(command, args, {
      cwd: repoDir,
      detached: process.platform !== "win32",
      windowsHide: true
    });
    currentChild = child;
    child.stdout?.on("data", (chunk) => consume("stdout", chunk));
    child.stderr?.on("data", (chunk) => consume("stderr", chunk));
    child.once("error", (error) => finish(processStartError(label, error)));
    child.once("close", (code) => {
      if (settled) return;
      for (const source of ["stdout", "stderr"]) {
        if (!remainder[source]) continue;
        if (options.parseKernel) inspectKernelLine(remainder[source], source);
        else publishConsole(remainder[source], options.channel || label.toLowerCase());
      }
      finish(null, code);
    });
  } catch (error) {
    finish(processStartError(label, error));
  }

  return {
    promise,
    terminate(reason) {
      if (settled) return false;
      terminateChildProcess(child);
      const error = new Error(`The ${label} process was terminated (${reason}).`);
      error.code = "process_terminated";
      finish(error);
      return true;
    }
  };
}

function contextForRun(run) {
  return run.context || {
    branch: run.branch,
    commit: run.commit,
    lab: run.lab,
    variant: run.variant
  };
}

function handleRunStarted(run) {
  sequence = 0;
  eventHistory.length = 0;
  consoleHistory.length = 0;
  lastEventKey = "";
  broadcast({
    type: "run-start",
    protocol: EVENT_PROTOCOL,
    runId: run.runId,
    context: contextForRun(run),
    timestamp: run.startedAt
  });
}

function handleRunUpdated(run, transition) {
  if (transition === "build-running") {
    setRunState("building", `正在构建 ${run.branch}`, {
      branch: run.branch,
      runId: run.runId,
      target: run.target,
      buildResult: "running",
      runResult: "not-started"
    });
    console.log(`[demo] Building branch ${run.branch}...`);
  }
  if (transition === "qemu-running") {
    setRunState("running", `QEMU 正在运行 ${run.branch}`, {
      branch: run.branch,
      runId: run.runId,
      target: run.target,
      buildResult: run.build.status,
      runResult: "running"
    });
    console.log("[demo] Starting QEMU; serial output is now forwarded to the browser.");
  }
}

function handleRunCompleted(run) {
  const context = contextForRun(run);
  const qemuStarted = run.qemu.status !== "not-started";
  const runResult = qemuStarted
    ? run.qemu.status
    : run.timedOut ? "timeout" : run.manuallyStopped ? null : run.qemu.status;
  const message = {
    protocol: EVENT_PROTOCOL,
    runId: run.runId,
    context,
    stopped: run.manuallyStopped,
    timedOut: run.timedOut,
    exitCode: run.qemu.exitCode,
    buildResult: run.build.status,
    runResult,
    finalResult: run.finalResult,
    message: run.error?.message || "",
    startedAt: run.startedAt,
    timestamp: run.endedAt,
    durationMs: run.durationMs,
    eventCount: run.eventCount
  };

  if (run.manuallyStopped) {
    setRunState("stopped", `已停止 ${run.branch}`, {
      branch: run.branch,
      runId: run.runId,
      buildResult: run.build.status,
      runResult
    });
    broadcast({ type: "run-end", ...message });
    console.log(`[demo] Stopped run for ${run.branch}.`);
    return;
  }
  if (run.timedOut) {
    setRunState("error", `运行超时：${run.error?.message || "timeout"}`, {
      branch: run.branch,
      runId: run.runId,
      buildResult: run.build.status,
      runResult: "timeout"
    });
    broadcast({ type: "run-end", ...message });
    console.error(`[demo] ${run.error?.message || "Run timed out."}`);
    return;
  }
  if (["finished", "qemu-failure"].includes(run.finalResult)) {
    setRunState("finished", `QEMU 已退出（code ${run.qemu.exitCode}）`, {
      branch: run.branch,
      exitCode: run.qemu.exitCode,
      runId: run.runId,
      buildResult: run.build.status,
      runResult
    });
    broadcast({ type: "run-end", ...message });
    console.log(`[demo] QEMU exited with code ${run.qemu.exitCode}.`);
    return;
  }

  setRunState("error", run.error?.message || "The run failed.", {
    branch: run.branch,
    runId: run.runId,
    buildResult: run.build.status,
    runResult
  });
  broadcast({ type: "run-error", ...message });
  console.error(`[demo] ${run.error?.message || "The run failed."}`);
}

function startKernelRun(options = {}) {
  const taskKind = options.taskKind;
  if (!["interactive-run", "agent-test"].includes(taskKind)) {
    throw new TypeError("A server-owned taskKind is required.");
  }
  if (taskKind === "agent-test"
    && (!options.approvedTest
      || getApprovedTest(options.approvedTest.testId) !== options.approvedTest
      || options.approvedTest.runner !== "kernel-build-qemu")) {
    throw new TypeError("An approved registry test is required.");
  }
  if (taskKind === "agent-test"
    && (!options.context
      || typeof options.context !== "object"
      || options.context.branch !== options.approvedTest.branchPolicy.branch
      || options.context.lab !== options.approvedTest.lab
      || options.context.variant !== options.approvedTest.variant
      || typeof options.context.commit !== "string"
      || !options.context.commit)) {
    throw new TypeError("A verified approved-test context is required.");
  }

  currentContext = taskKind === "agent-test"
    ? { ...options.context }
    : readWorkspaceContext();
  const runId = createRunId();
  const startedAt = Date.now();
  const kernel = path.join(repoDir, "target", rustTarget, "debug", "ai-os-kernel");
  const started = runLifecycle.start({
    runId,
    taskKind,
    branch: currentContext.branch,
    commit: currentContext.commit,
    lab: currentContext.lab,
    variant: currentContext.variant,
    target: rustTarget,
    context: currentContext,
    startedAt
  }, {
    build: () => streamProcess(
      cargoCommand,
      ["build", "-p", "ai-os-kernel", "--target", rustTarget, "--color", "never"],
      "cargo",
      { channel: "build" }
    ),
    qemu: () => streamProcess(
      qemuCommand,
      ["-machine", "virt", "-nographic", "-bios", "default", "-kernel", kernel],
      "QEMU",
      { parseKernel: true, channel: "serial" }
    )
  });
  if (!started.started) {
    return {
      started: false,
      runId: null,
      startedAt: null,
      activeTask: started.activeTask
    };
  }

  const trackedPromise = started.promise.finally(() => {
    if (runPromise === trackedPromise) runPromise = null;
  });
  runPromise = trackedPromise;
  return {
    started: true,
    runId,
    startedAt,
    activeTask: started.activeTask
  };
}

function startAgentApprovedRun({ approvedTest, context }) {
  return startKernelRun({
    taskKind: "agent-test",
    approvedTest,
    context
  });
}

function stopRun() {
  const activeRun = runStore.getActiveRun();
  if (!activeRun || !runLifecycle.stop()) return false;
  setRunState("stopping", `正在停止 ${activeRun.branch}`, {
    branch: activeRun.branch,
    runId: activeRun.runId
  });
  return true;
}

function refreshBranchContext() {
  const next = readWorkspaceContext();
  if (next.branch === currentContext.branch && next.commit === currentContext.commit) return;

  const previous = currentContext;
  currentContext = next;
  const activeTask = taskLock.getActiveTask();
  if (activeTask?.kind === "agent-test") runLifecycle.stop();
  if (!taskLock.getActiveTask()) {
    eventHistory.length = 0;
    consoleHistory.length = 0;
    sequence = 0;
  }
  broadcast({
    type: "branch-change",
    context: currentContext,
    previous,
    protocol: EVENT_PROTOCOL,
    activeRunBranch: runStore.getActiveRun()?.branch || null,
    timestamp: Date.now()
  });
  if (!taskLock.getActiveTask()) {
    setRunState("idle", `已切换到 ${currentContext.branch}，等待运行`, {
      branch: currentContext.branch
    });
  }
  console.log(`[demo] Workspace branch changed: ${previous.branch} -> ${currentContext.branch}`);
}

function writeJson(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(value));
}

function writeAgentModelDiagnostic(event) {
  process.stderr.write(`[agent-debug] ${JSON.stringify(event)}\n`);
}

function requestHasLocalOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}:${port}`;
}

function isInsideRepo(candidate) {
  const relative = path.relative(repoDir, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const server = http.createServer(async (request, response) => {
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

  if (requestPath === "/api/agent") {
    const result = await agentApi.handleHttpRequest({
      method: request.method,
      headers: request.headers,
      body: request
    });
    writeJson(response, result.statusCode, result.body, result.headers);
    return;
  }

  if (requestPath === "/api/context" && request.method === "GET") {
    const toolResult = agentToolDispatch.get_context({});
    if (toolResult.ok) {
      currentContext = {
        branch: toolResult.data.branch,
        commit: toolResult.data.commit,
        lab: toolResult.data.lab,
        stageIndex: toolResult.data.stageIndex,
        variant: toolResult.data.variant,
        variantLabel: toolResult.data.variantLabel,
        expectedBranch: toolResult.data.expectedBranch
      };
    }
    writeJson(response, 200, {
      protocol: EVENT_PROTOCOL,
      target: rustTarget,
      context: currentContext,
      runState,
      workspace: toolResult.ok ? toolResult.data.workspace : null,
      task: toolResult.ok ? toolResult.data.task : readCurrentTaskSnapshot(),
      contextError: toolResult.ok ? null : toolResult.error,
      agent: arkModelClient.getCapabilities()
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
    const started = startKernelRun({ taskKind: "interactive-run" });
    if (!started.started) {
      writeJson(response, 409, {
        ok: false,
        error: "A build or QEMU run is already active.",
        errorCode: "run_busy"
      });
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
  const activeRun = runStore.getActiveRun();
  sendWebSocketMessage(socket, {
    type: "history",
    protocol: EVENT_PROTOCOL,
    context: currentContext,
    runState,
    activeRun: activeRun ? {
      runId: activeRun.runId,
      context: contextForRun(activeRun),
      startedAt: activeRun.startedAt
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
  if (runKernelOnStart) startKernelRun({ taskKind: "interactive-run" });
});

function shutdown() {
  clearInterval(branchTimer);
  runLifecycle.stop();
  if (currentChild && !currentChild.killed) terminateChildProcess(currentChild);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
