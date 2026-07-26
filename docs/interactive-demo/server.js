"use strict";

// Dependency-free local bridge: QEMU serial output -> WebSocket -> browser.
// It only listens on loopback, so the demo remains local to the student's PC.

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const publicDir = __dirname;
const repoDir = path.resolve(__dirname, "..", "..");
const runKernel = process.argv.includes("--run");
const readSerialFromStdin = process.argv.includes("--stdin");
const portFlag = process.argv.indexOf("--port");
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 4173;
const host = "127.0.0.1";
const clients = new Set();
const eventHistory = [];
let sequence = 0;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be an integer from 1 to 65535.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

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
    throw new Error("Telemetry payload is unexpectedly large.");
  }
  socket.write(Buffer.concat([header, payload]));
}

function broadcast(message) {
  for (const socket of clients) {
    if (!socket.destroyed) sendWebSocketMessage(socket, message);
  }
}

function publishTelemetry(lab, step) {
  sequence += 1;
  const event = { type: "telemetry", lab, step, sequence, timestamp: Date.now() };
  eventHistory.push(event);
  if (eventHistory.length > 32) eventHistory.shift();
  broadcast(event);
}

function inspectKernelLine(line) {
  const clean = line.replace(/\r/g, "").trim();
  const match = clean.match(/^\[OS_DEMO\]\s+lab=([a-z0-9-]+)\s+step=([a-z0-9-]+)$/i);
  if (match) publishTelemetry(match[1].toLowerCase(), match[2].toLowerCase());
}

function bridgeTextStream(stream) {
  let remainder = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    remainder += chunk;
    const lines = remainder.split("\n");
    remainder = lines.pop();
    lines.forEach(inspectKernelLine);
  });
  stream.on("end", () => inspectKernelLine(remainder));
}

function streamProcess(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoDir, windowsHide: true });
    const remainder = { stdout: "", stderr: "" };
    const consume = (source, chunk) => {
      const text = chunk.toString();
      process[source].write(text);
      remainder[source] += text;
      const lines = remainder[source].split("\n");
      remainder[source] = lines.pop();
      lines.forEach(inspectKernelLine);
    };
    child.stdout.on("data", (chunk) => consume("stdout", chunk));
    child.stderr.on("data", (chunk) => consume("stderr", chunk));
    child.on("error", (error) => reject(new Error(`${label} could not start: ${error.message}`)));
    child.on("close", (code) => {
      inspectKernelLine(remainder.stdout);
      inspectKernelLine(remainder.stderr);
      resolve(code);
    });
  });
}

async function runQemuAndBridge() {
  sequence = 0;
  eventHistory.length = 0;
  broadcast({ type: "run-start", timestamp: Date.now() });
  console.log("[demo] Building the RISC-V kernel...");
  const buildCode = await streamProcess(process.env.CARGO || "cargo", ["build", "-p", "ai-os-kernel"], "cargo");
  if (buildCode !== 0) throw new Error(`cargo build failed with exit code ${buildCode}.`);

  const kernel = path.join(repoDir, "target", "riscv64gc-unknown-none-elf", "debug", "ai-os-kernel");
  console.log("[demo] Starting QEMU; serial telemetry is now forwarded to the browser.");
  const qemuCode = await streamProcess(
    process.env.QEMU || "qemu-system-riscv64",
    ["-machine", "virt", "-nographic", "-bios", "default", "-kernel", kernel],
    "QEMU"
  );
  broadcast({ type: "run-end", exitCode: qemuCode, timestamp: Date.now() });
  console.log(`[demo] QEMU exited with code ${qemuCode}.`);
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
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }

  if (requestPath.startsWith("/source/")) {
    const sourcePath = path.resolve(repoDir, requestPath.slice("/source/".length));
    if (!sourcePath.startsWith(`${repoDir}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.stat(sourcePath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      fs.createReadStream(sourcePath).pipe(response);
    });
    return;
  }

  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relativePath);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== publicDir) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(response);
  });
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
  sendWebSocketMessage(socket, { type: "history", events: eventHistory });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.on("data", (chunk) => {
    if ((chunk[0] & 0x0f) === 0x08) socket.end();
  });
});

server.listen(port, host, async () => {
  console.log(`[demo] Open http://${host}:${port} for the live teaching view.`);
  if (readSerialFromStdin) {
    console.log("[demo] Reading tagged serial lines from standard input.");
    bridgeTextStream(process.stdin);
  }
  if (!runKernel) return;
  try {
    await runQemuAndBridge();
  } catch (error) {
    console.error(`[demo] ${error.message}`);
    broadcast({ type: "run-error", message: error.message, timestamp: Date.now() });
  }
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
