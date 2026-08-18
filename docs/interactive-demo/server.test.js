"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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

test("server wires interactive and agent runs through one shared lifecycle boundary", () => {
  const source = fs.readFileSync(serverPath, "utf8");
  assert.match(source, /const \{ createAgentApi \} = require\("\.\/agent\/api"\)/);
  assert.match(source, /const \{ createAgentLoop \} = require\("\.\/agent\/agent-loop"\)/);
  assert.match(source, /const \{ createKnowledgeRetriever \} = require\("\.\/agent\/knowledge-retriever"\)/);
  assert.match(source, /const \{ createArkModelClient, isTrustedModelClientError \} = require\("\.\/agent\/model-client"\)/);
  assert.match(source, /const \{ createProductionAgentHandler \} = require\("\.\/agent\/model-handler"\)/);
  assert.match(source, /const arkModelClient = createArkModelClient\(\{[\s\S]*?fetchImpl: globalThis\.fetch,[\s\S]*?apiKeyProvider: \(\) => process\.env\.ARK_API_KEY,[\s\S]*?baseUrl: process\.env\.ARK_BASE_URL,[\s\S]*?model: process\.env\.ARK_MODEL/);
  assert.match(source, /diagnosticSink: process\.env\.OS_TUTOR_DEBUG_AGENT === "1"[\s\S]*?\? writeAgentModelDiagnostic[\s\S]*?: null/);
  assert.match(source, /function writeAgentModelDiagnostic\(event\) \{[\s\S]*?JSON\.stringify\(event\)/);
  assert.match(source, /const knowledgeRetriever = createKnowledgeRetriever\(\)/);
  assert.match(source, /const agentLoop = createAgentLoop\(\{[\s\S]*?model: arkModelClient,[\s\S]*?toolDispatch: agentToolDispatch,[\s\S]*?readContext: readWorkspaceContext,[\s\S]*?retrieveKnowledge: knowledgeRetriever\.retrieveKnowledge,[\s\S]*?isTrustedModelError: isTrustedModelClientError/);
  assert.match(source, /const handleAgentRequest = createProductionAgentHandler\(\{ agentLoop \}\)/);
  assert.match(source, /const agentApi = createAgentApi\(\{[\s\S]*?expectedOrigin: `http:\/\/\$\{host\}:\$\{port\}`,[\s\S]*?readWorkspaceContext,[\s\S]*?handleAgentRequest/);
  assert.match(source, /const taskLock = new SharedTaskLock\(\)/);
  assert.match(source, /const runLifecycle = new RunLifecycleManager\(\{[\s\S]*?taskLock,/);
  assert.match(source, /const runTestTool = createRunTestTool\(\{[\s\S]*?readPreflight: readLinuxPreflight,[\s\S]*?startApprovedRun: startAgentApprovedRun/);
  assert.match(source, /const agentToolDispatch = Object\.freeze\(\{[\s\S]*?get_context: getContextTool,[\s\S]*?read_code: readCodeTool,[\s\S]*?get_qemu_events: getQemuEventsTool,[\s\S]*?get_run_result: getRunResultTool,[\s\S]*?get_code_diff: getCodeDiffTool,[\s\S]*?run_test: runTestTool/);
  assert.match(source, /function startAgentApprovedRun\([\s\S]*?startKernelRun\(\{[\s\S]*?taskKind: "agent-test"/);
  assert.match(source, /requestPath === "\/api\/run"[\s\S]*?startKernelRun\(\{ taskKind: "interactive-run" \}\)/);
  assert.match(source, /activeTask\?\.kind === "agent-test"\) runLifecycle\.stop\(\)/);

  const agentRouteStart = source.indexOf('if (requestPath === "/api/agent")');
  const contextRouteStart = source.indexOf('if (requestPath === "/api/context"', agentRouteStart);
  const agentRoute = source.slice(agentRouteStart, contextRouteStart);
  assert.ok(agentRouteStart >= 0 && contextRouteStart > agentRouteStart);
  assert.match(agentRoute, /agentApi\.handleHttpRequest\(\{[\s\S]*?method: request\.method,[\s\S]*?headers: request\.headers,[\s\S]*?body: request/);
  assert.match(agentRoute, /writeJson\(response, result\.statusCode, result\.body, result\.headers\)/);
  assert.doesNotMatch(agentRoute, /taskLock|runLifecycle|startKernelRun|spawn|exec|agentToolDispatch/);

  const runRouteStart = source.indexOf('if (requestPath === "/api/run"');
  const stopRouteStart = source.indexOf('if (requestPath === "/api/stop"', runRouteStart);
  const runRoute = source.slice(runRouteStart, stopRouteStart);
  assert.ok(runRouteStart >= 0 && stopRouteStart > runRouteStart);
  assert.match(runRoute, /writeJson\(response, 202, \{[\s\S]*?ok: true,[\s\S]*?protocol: EVENT_PROTOCOL,[\s\S]*?context: currentContext,[\s\S]*?target: rustTarget/);
  assert.doesNotMatch(runRoute, /\brunId\s*:/);
  assert.match(runRoute, /errorCode: "run_busy"/);

  const agentRunnerStart = source.indexOf("function startAgentApprovedRun");
  const stopRunStart = source.indexOf("function stopRun", agentRunnerStart);
  const agentRunner = source.slice(agentRunnerStart, stopRunStart);
  assert.doesNotMatch(agentRunner, /\bspawn(?:Sync)?\s*\(/);
  assert.doesNotMatch(agentRunner, /\.acquire\s*\(/);
  assert.doesNotMatch(agentRunner, /terminateChildProcess/);
});

test("bridge serves the learning map and turns serial evidence into WebSocket events", {
  timeout: 10000
}, async (t) => {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const childEnv = { ...process.env, OS_DEMO_BRANCH: "lab5-starter" };
  delete childEnv.ARK_API_KEY;
  delete childEnv.ARK_BASE_URL;
  delete childEnv.ARK_MODEL;
  delete childEnv.ARK_LIVE_TEST;
  delete childEnv.OS_TUTOR_DEBUG_AGENT;
  const child = spawn(process.execPath, [serverPath, "--stdin", "--port", String(port)], {
    cwd: repoDir,
    env: childEnv,
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

  for (const asset of [
    "workspace.css",
    "theme-atlas.css",
    "ui-shell-state.js",
    "ui-shell.js",
    "agent-chat-state.js",
    "agent.html",
    "agent-page.css",
    "agent-page.js",
    "agent-entry-state.js",
    "agent-pet.js",
    "assets/kernel-buddy.png"
  ]) {
    const assetResponse = await fetch(`${url}/${asset}`);
    assert.equal(assetResponse.status, 200, `${asset} should be served by the local bridge`);
    assert.ok((await assetResponse.arrayBuffer()).byteLength > 20, `${asset} should not be empty`);
  }

  const retiredSignalTheme = await fetch(`${url}/theme-signal.css`);
  assert.equal(retiredSignalTheme.status, 404);

  const mascotAsset = await fetch(`${url}/assets/kernel-buddy.png`);
  assert.equal(mascotAsset.headers.get("content-type"), "image/png");
  const unlistedMascot = await fetch(`${url}/assets/kernel-buddy-preview.png`);
  assert.equal(unlistedMascot.status, 404);

  const getAgent = await fetch(`${url}/api/agent`);
  assert.equal(getAgent.status, 405);
  assert.equal(getAgent.headers.get("allow"), "POST");
  const getAgentBody = await getAgent.json();
  assert.equal(getAgentBody.contractVersion, "os-tutor.agent/v1");
  assert.equal(getAgentBody.error.code, "method_not_allowed");

  const missingOrigin = await fetch(`${url}/api/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" })
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).error.code, "origin_not_allowed");

  const wrongOrigin = await fetch(`${url}/api/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:8888"
    },
    body: JSON.stringify({ message: "hello" })
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await wrongOrigin.json()).error.code, "origin_not_allowed");

  const authorized = await fetch(`${url}/api/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: url,
      authorization: "Bearer browser-secret"
    },
    body: JSON.stringify({ message: "hello" })
  });
  assert.equal(authorized.status, 403);
  const authorizedBody = await authorized.json();
  assert.equal(authorizedBody.error.code, "authorization_not_allowed");
  assert.doesNotMatch(JSON.stringify(authorizedBody), /Bearer|browser-secret/);

  const malformed = await fetch(`${url}/api/agent`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: "{"
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "invalid_json");

  const oversized = await fetch(`${url}/api/agent`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ message: "x".repeat(17000) })
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "request_too_large");

  const notConfigured = await fetch(`${url}/api/agent`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", origin: url },
    body: JSON.stringify({ message: "为什么 Lab5 没有切换任务？" })
  });
  assert.equal(notConfigured.status, 503);
  const notConfiguredBody = await notConfigured.json();
  assert.equal(notConfiguredBody.contractVersion, "os-tutor.agent/v1");
  assert.equal(notConfiguredBody.ok, false);
  assert.equal(notConfiguredBody.error.code, "model_not_configured");
  assert.equal(notConfiguredBody.meta.branch, "lab5-starter");
  assert.equal(notConfiguredBody.meta.lab, "lab5");
  assert.equal(notConfiguredBody.meta.variant, "starter");

  const contextResponse = await fetch(`${url}/api/context`);
  assert.equal(contextResponse.status, 200);
  const contextBody = await contextResponse.json();
  assert.equal(contextBody.protocol, "os-demo.event/v1");
  assert.equal(contextBody.context.branch, "lab5-starter");
  assert.deepEqual(contextBody.agent, {
    contractVersion: "os-tutor.agent/v1",
    configured: false,
    provider: "volcengine-ark-agent-plan",
    model: "ark-code-latest",
    remoteStore: true
  });
  assert.doesNotMatch(JSON.stringify(contextBody), /ARK_API_KEY|authorization|Bearer/i);

  const rejectedRun = await fetch(`${url}/api/run`, {
    method: "POST",
    headers: { origin: "http://not-local.invalid" }
  });
  assert.equal(rejectedRun.status, 403);
  assert.deepEqual(await rejectedRun.json(), { ok: false, error: "Origin is not local." });

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
  assert.match(html, /确定性规则检查/);
  assert.match(html, /运行错误诊断/);
  assert.match(html, /AI 教学助教/);
  assert.match(html, /诊断只使用本地构建结果、结构化事件和稳定输出/);
  assert.match(html, /id="diagnostics-summary"/);
  assert.match(html, /id="diagnostics-list"/);
  assert.match(html, /完整时间线与分支差异/);
  assert.match(html, /事件状态/);
  assert.match(html, /事件来源/);
  assert.match(html, /关键词搜索/);
  assert.match(html, /0\.5×/);
  assert.match(html, /4×/);
  assert.match(html, /第一个失败事件/);
  assert.match(html, /第一个分支差异/);
  assert.match(html, /键盘：空格播放\/暂停/);
  assert.match(html, /导出 JSON/);
  assert.match(html, /导出 Markdown/);
  assert.match(html, /导入 JSON/);
  assert.match(html, /只在当前浏览器处理，不上传文件，也不会切换 Git 分支/);
  assert.match(html, /starter \/ solution 对比/);
  assert.match(html, /教学评价与反馈/);
  assert.match(html, /提交教学评价/);
  assert.match(html, /feedback-service-url/);
  assert.doesNotMatch(html, /前往 GitLab 确认提交/);
  assert.doesNotMatch(html, /这套实验是否真的帮助了你/);
  assert.match(html, /当前实验教学评价五题/);
  assert.match(html, /补充反馈/);
  assert.match(html, /事件—代码—知识联动/);
  assert.match(html, /starter 最终状态/);
  assert.match(html, /发生变化的状态/);
  assert.match(html, /事件序列差异（保留原有比较）/);
  assert.match(html, /<script src="feedback-questions\.js"><\/script>[\s\S]*<script src="feedback\.js"><\/script>[\s\S]*<script src="event-catalog\.js"><\/script>[\s\S]*<script src="prediction-model\.js"><\/script>[\s\S]*<script src="state-model\.js"><\/script>[\s\S]*<script src="state-diff\.js"><\/script>[\s\S]*<script src="run-history\.js"><\/script>[\s\S]*<script src="run-transfer\.js"><\/script>[\s\S]*<script src="timeline-controller\.js"><\/script>[\s\S]*<script src="diagnostics\.js"><\/script>[\s\S]*<script src="app\.js"><\/script>/);

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

  const runTransferModule = await fetch(`${url}/run-transfer.js`);
  assert.equal(runTransferModule.status, 200);
  assert.match(await runTransferModule.text(), /os-demo\.run\/v1/);

  const timelineControllerModule = await fetch(`${url}/timeline-controller.js`);
  assert.equal(timelineControllerModule.status, 200);
  const timelineControllerSource = await timelineControllerModule.text();
  assert.match(timelineControllerSource, /createTimelineController/);
  assert.match(timelineControllerSource, /visibleEventIndexes/);

  const diagnosticsModule = await fetch(`${url}/diagnostics.js`);
  assert.equal(diagnosticsModule.status, 200);
  const diagnosticsSource = await diagnosticsModule.text();
  assert.match(diagnosticsSource, /function diagnose\(value = \{\}\)/);
  assert.match(diagnosticsSource, /window\.OsDiagnostics = api/);

  const presentationModule = await fetch(`${url}/presentation-mode.js`);
  assert.equal(presentationModule.status, 200);
  const presentationSource = await presentationModule.text();
  assert.match(presentationSource, /function loadPresentationState\(storage, search/);
  assert.match(presentationSource, /window\.OsPresentationMode = api/);

  const appModule = await fetch(`${url}/app.js`);
  assert.equal(appModule.status, 200);
  const appSource = await appModule.text();
  assert.match(appSource, /function handleTimelineShortcut\(event\)/);
  assert.match(appSource, /event\.key === "ArrowLeft"/);
  assert.match(appSource, /event\.key === "ArrowRight"/);
  assert.match(appSource, /for \(let eventIndex = 0; eventIndex <= nextIndex; eventIndex \+= 1\)/);
  assert.match(appSource, /target\.closest\("input, textarea, select, button, a, \[tabindex\], \[contenteditable\]"\)/);
  assert.match(appSource, /const replaying = Boolean\(state\.replay\.run\)/);
  assert.match(appSource, /if \(message\.type === "console"\)/);
  assert.match(appSource, /captureRunOutput\(message\)/);
  assert.match(appSource, /if \(!state\.replay\.run\) appendConsole\(message\)/);
  assert.match(appSource, /if \(!state\.replay\.run\) applyRuntimeEvent\(message\)/);
  assert.match(appSource, /window\.OsDiagnostics\.diagnose\(input\)/);
  assert.match(appSource, /function renderPreflightDiagnostics\(result\)/);
  assert.match(appSource, /function setPresentationMode\(enabled, options = \{\}\)/);
  assert.match(appSource, /function restorePresentationView\(\)/);
  assert.match(appSource, /if \(presentationEnabled\(\)\) \{/);

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

  const legacyPanicPromise = waitForMessage(
    socket,
    (message) => message.type === "telemetry" && message.step === "panic"
  );
  child.stdin.write("[Lab2] kernel panic\n");
  const legacyPanic = await legacyPanicPromise;
  assert.equal(legacyPanic.lab, "lab5");
  assert.equal(legacyPanic.status, "fail");
  assert.equal(legacyPanic.raw, "[Lab2] kernel panic");

  const idleStop = await fetch(`${url}/api/stop`, { method: "POST" });
  assert.equal(idleStop.status, 409);
  socket.close();
});
