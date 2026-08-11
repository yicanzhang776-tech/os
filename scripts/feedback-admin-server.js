"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  exportCsv,
  exportJson,
  exportMarkdown,
  filterRecords
} = require("../docs/feedback-admin/admin-model.js");
const {
  exportRunCsv,
  exportRunJson,
  exportRunMarkdown,
  filterRunRecords
} = require("../docs/feedback-admin/run-admin-model.js");
const { parseStoredLine, parseStoredRunLine } = require("./feedback-server.js");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8891;
const DEFAULT_DATA_DIR = "feedback-data";
const publicDir = path.resolve(__dirname, "..", "docs", "feedback-admin");
const assetNames = ["index.html", "styles.css", "admin-model.js", "run-admin-model.js", "app.js"];

function parseInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function parseArgs(argv = []) {
  const result = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    dataDir: path.resolve(DEFAULT_DATA_DIR)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--host", "--port", "--data"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    index += 1;
    if (flag === "--host") result.host = value;
    if (flag === "--port") result.port = parseInteger(value, "--port", 1, 65535);
    if (flag === "--data") result.dataDir = path.resolve(value);
  }
  if (result.host !== DEFAULT_HOST) {
    throw new Error("The feedback admin page must listen on 127.0.0.1 only.");
  }
  return result;
}

function requestHasLocalHost(request) {
  const host = String(request.headers.host || "").toLowerCase();
  return /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)
    || /^\[::1\](?::\d+)?$/.test(host);
}

function writeJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": payload.length,
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(payload);
}

function writeText(response, statusCode, body, contentType, filename) {
  const payload = Buffer.from(body);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Disposition": filename ? `attachment; filename="${filename}"` : "inline",
    "Content-Length": payload.length,
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff"
  });
  response.end(payload);
}

function normalizeFilters(searchParams) {
  const allowedLabs = new Set(["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  const allowedVariants = new Set(["starter", "solution", "baseline", "main", "demo"]);
  const allowedRoles = new Set(["student", "teacher", "assistant", "learner"]);
  const lab = searchParams.get("lab") || "all";
  const variant = searchParams.get("variant") || "all";
  const role = searchParams.get("role") || "all";
  if (lab !== "all" && !allowedLabs.has(lab)) throw new Error("Unknown Lab filter.");
  if (variant !== "all" && !allowedVariants.has(variant)) throw new Error("Unknown variant filter.");
  if (role !== "all" && !allowedRoles.has(role)) throw new Error("Unknown role filter.");
  return { lab, variant, role };
}

function normalizeRunFilters(searchParams) {
  const allowedLabs = new Set(["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  const allowedRoles = new Set(["starter", "solution", "custom"]);
  const allowedResults = new Set(["pass", "todo", "fail", "timeout", "finished", "stopped"]);
  const lab = searchParams.get("lab") || "all";
  const role = searchParams.get("runRole") || "all";
  const result = searchParams.get("result") || "all";
  if (lab !== "all" && !allowedLabs.has(lab)) throw new Error("Unknown Lab filter.");
  if (role !== "all" && !allowedRoles.has(role)) throw new Error("Unknown run role filter.");
  if (result !== "all" && !allowedResults.has(result)) throw new Error("Unknown run result filter.");
  return { lab, role, result };
}

async function readStoredRecords(dataFile, fileApi = fs.promises) {
  let content = "";
  try {
    content = await fileApi.readFile(dataFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return content.split(/\r?\n/).filter(Boolean).map(parseStoredLine).filter(Boolean);
}

async function readStoredRunRecords(dataFile, fileApi = fs.promises) {
  let content = "";
  try {
    content = await fileApi.readFile(dataFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return content.split(/\r?\n/).filter(Boolean).map(parseStoredRunLine).filter(Boolean);
}

function createFeedbackAdminService(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  if (host !== DEFAULT_HOST) throw new Error("Feedback admin host must be 127.0.0.1.");
  if (port !== 0) parseInteger(port, "port", 1, 65535);
  const dataDir = path.resolve(options.dataDir || DEFAULT_DATA_DIR);
  const dataFile = path.join(dataDir, "feedback.jsonl");
  const runDataFile = path.join(dataDir, "runs.jsonl");
  const fileApi = options.fileApi || fs.promises;
  const now = options.now || (() => new Date());
  const staticAssets = new Map(assetNames.map((name) => [
    name,
    fs.readFileSync(path.join(publicDir, name))
  ]));
  staticAssets.set(
    "event-catalog.js",
    fs.readFileSync(path.resolve(__dirname, "..", "docs", "interactive-demo", "event-catalog.js"))
  );
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  };

  const server = http.createServer(async (request, response) => {
    if (!requestHasLocalHost(request)) {
      writeJson(response, 403, { ok: false, error: "The admin page is available on localhost only." });
      return;
    }
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeJson(response, 405, { ok: false, error: "Method not allowed." });
      return;
    }
    if (requestUrl.pathname === "/health") {
      writeJson(response, 200, { ok: true, service: "os-demo-feedback-admin", localOnly: true });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      const runRoute = requestUrl.pathname === "/api/run-records"
        || requestUrl.pathname.startsWith("/api/runs/export.");
      if (runRoute) {
        let filters;
        try {
          filters = normalizeRunFilters(requestUrl.searchParams);
        } catch (error) {
          writeJson(response, 400, { ok: false, error: error.message });
          return;
        }
        let records;
        try {
          records = filterRunRecords(await readStoredRunRecords(runDataFile, fileApi), filters);
        } catch (_) {
          writeJson(response, 500, { ok: false, error: "Run record data could not be read." });
          return;
        }
        if (requestUrl.pathname === "/api/run-records") {
          writeJson(response, 200, { ok: true, count: records.length, records });
          return;
        }
        if (requestUrl.pathname === "/api/runs/export.json") {
          writeText(response, 200, exportRunJson(records, now()), "application/json; charset=utf-8", "os-runs.json");
          return;
        }
        if (requestUrl.pathname === "/api/runs/export.csv") {
          writeText(response, 200, exportRunCsv(records), "text/csv; charset=utf-8", "os-runs.csv");
          return;
        }
        if (requestUrl.pathname === "/api/runs/export.md") {
          writeText(response, 200, exportRunMarkdown(records, now()), "text/markdown; charset=utf-8", "os-runs.md");
          return;
        }
      }
      let filters;
      try {
        filters = normalizeFilters(requestUrl.searchParams);
      } catch (error) {
        writeJson(response, 400, { ok: false, error: error.message });
        return;
      }
      let records;
      try {
        records = filterRecords(await readStoredRecords(dataFile, fileApi), filters);
      } catch (_) {
        writeJson(response, 500, { ok: false, error: "Feedback data could not be read." });
        return;
      }
      if (requestUrl.pathname === "/api/feedback") {
        writeJson(response, 200, { ok: true, count: records.length, records });
        return;
      }
      if (requestUrl.pathname === "/api/export.json") {
        writeText(response, 200, exportJson(records, now()), "application/json; charset=utf-8", "os-feedback.json");
        return;
      }
      if (requestUrl.pathname === "/api/export.csv") {
        writeText(response, 200, exportCsv(records), "text/csv; charset=utf-8", "os-feedback.csv");
        return;
      }
      if (requestUrl.pathname === "/api/export.md") {
        writeText(response, 200, exportMarkdown(records, now()), "text/markdown; charset=utf-8", "os-feedback.md");
        return;
      }
      writeJson(response, 404, { ok: false, error: "Not found." });
      return;
    }

    const assetName = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\/+/, "");
    const asset = staticAssets.get(assetName);
    if (!asset) {
      writeJson(response, 404, { ok: false, error: "Not found." });
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": asset.length,
      "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'",
      "Content-Type": mimeTypes[path.extname(assetName)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") response.end();
    else response.end(asset);
  });

  async function listen() {
    await fileApi.mkdir(dataDir, { recursive: true });
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve(server.address());
      });
    });
  }

  async function close() {
    if (!server.listening) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  return Object.freeze({ server, listen, close, dataDir, dataFile, runDataFile });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const service = createFeedbackAdminService(options);
  const address = await service.listen();
  console.log(`[feedback-admin] Open http://127.0.0.1:${address.port}`);
  console.log("[feedback-admin] This page is local-only and must not be placed behind a public tunnel.");
  const shutdown = () => service.close().finally(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[feedback-admin] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  DEFAULT_HOST,
  DEFAULT_PORT,
  createFeedbackAdminService,
  normalizeFilters,
  normalizeRunFilters,
  parseArgs,
  readStoredRecords,
  readStoredRunRecords,
  requestHasLocalHost
});
