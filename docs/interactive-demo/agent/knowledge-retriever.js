"use strict";

const fs = require("node:fs");
const path = require("node:path");

const KNOWLEDGE_SCHEMA_VERSION = "os-tutor.knowledge/v1";
const LAB1_KNOWLEDGE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "knowledge",
  "labs",
  "lab1",
  "knowledge.json"
);
const DEFAULT_KNOWLEDGE_LIMIT = 4;
const MAX_KNOWLEDGE_RESULTS = 5;
const DEFAULT_MAX_HINT_LEVEL = 3;
const MAX_STUDENT_HINT_LEVEL = 4;
const MAX_QUERY_LENGTH = 4_000;
const MAX_CHUNKS = 256;
const MAX_CHUNK_CONTENT_LENGTH = 8_000;
const FORBIDDEN_TEXT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SOLUTION_SOURCE_PATTERN = /(?:^|[\\/:\s])lab1[-_]solution(?:[\\/:\s]|$)|(?:^|[\\/:\s])SOLUTION\.md(?:$|[\\/:\s])|TEACHER[_-]?GUIDE(?:\.md)?/i;
const CODE_BLOCK_PATTERN = /```|~~~|(?:^|\n)\s*(?:pub\s+)?(?:unsafe\s+)?(?:extern\s+"C"\s+)?fn\s+[A-Za-z_]/;

const EXACT_TERMS = Object.freeze([
  Object.freeze({ term: "opensbi", aliases: Object.freeze(["opensbi"]) }),
  Object.freeze({ term: "s-mode", aliases: Object.freeze(["s-mode", "s mode", "s模式"]) }),
  Object.freeze({ term: "m-mode", aliases: Object.freeze(["m-mode", "m mode", "m模式"]) }),
  Object.freeze({ term: "kernel_main", aliases: Object.freeze(["kernel_main"]) }),
  Object.freeze({ term: "_start", aliases: Object.freeze(["_start"]) }),
  Object.freeze({ term: "lab1-t1", aliases: Object.freeze(["lab1-t1"]) }),
  Object.freeze({ term: "lab1-t2", aliases: Object.freeze(["lab1-t2"]) }),
  Object.freeze({ term: "sbi", aliases: Object.freeze(["sbi"]) }),
  Object.freeze({ term: "console", aliases: Object.freeze(["console", "控制台"]) }),
  Object.freeze({ term: "qemu timeout", aliases: Object.freeze(["qemu timeout", "qemu超时", "qemu 超时"]) }),
  Object.freeze({ term: "panic", aliases: Object.freeze(["panic"]) }),
  Object.freeze({ term: "#![no_std]", aliases: Object.freeze(["#![no_std]", "no_std"]) }),
  Object.freeze({ term: "#![no_main]", aliases: Object.freeze(["#![no_main]", "no_main"]) }),
  Object.freeze({ term: "boot stack", aliases: Object.freeze(["boot stack", "启动栈"]) })
]);

const RUNTIME_ONLY_PATTERNS = Object.freeze([
  /(?:当前|现在).*(?:哪个|什么).*(?:lab|实验)/i,
  /(?:当前|现在).*(?:分支|branch|commit|工作区|进度|修改状态)/i,
  /(?:main\.rs|boot\.rs|console\.rs|sbi\.rs).*(?:当前|现在).*(?:内容|代码|实现)/i,
  /(?:当前|现在).*(?:main\.rs|boot\.rs|console\.rs|sbi\.rs).*(?:内容|代码|实现)/i,
  /(?:刚才|最近|上一次).*(?:测试|运行).*(?:结果|状态|输出)/i,
  /(?:当前|现在).*(?:代码|diff|改了什么|修改了什么)/i
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeString(value, maxLength = 1_000) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !FORBIDDEN_TEXT_CHARACTERS.test(value);
}

function normalizeText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[，。！？；：、（）【】《》“”‘’]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function validateStringArray(value, field, maximumItems = 32) {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximumItems
    || Object.keys(value).length !== value.length
    || value.some((item) => !safeString(item, 300))) {
    throw new TypeError(`Invalid Lab1 knowledge ${field}.`);
  }
  return Object.freeze(value.map((item) => item.trim()));
}

function validateChunk(value) {
  const fields = [
    "concepts", "content", "files", "hintLevel", "id", "keywords", "lab",
    "source", "stage", "symptoms", "title", "topic", "type"
  ];
  if (!isPlainObject(value)
    || Object.keys(value).sort().join("|") !== fields.sort().join("|")
    || !safeString(value.id, 120)
    || !/^lab1-[a-z0-9-]+$/.test(value.id)
    || value.lab !== "lab1"
    || !Number.isInteger(value.stage)
    || value.stage < 0
    || value.stage > 3
    || !safeString(value.type, 40)
    || !safeString(value.topic, 80)
    || !Number.isInteger(value.hintLevel)
    || value.hintLevel < 1
    || value.hintLevel > MAX_STUDENT_HINT_LEVEL
    || !safeString(value.source, 1_000)
    || !safeString(value.title, 300)
    || !safeString(value.content, MAX_CHUNK_CONTENT_LENGTH)
    || SOLUTION_SOURCE_PATTERN.test(value.source)
    || SOLUTION_SOURCE_PATTERN.test(value.content)
    || CODE_BLOCK_PATTERN.test(value.content)) {
    throw new TypeError("Invalid or unsafe Lab1 knowledge chunk.");
  }
  const concepts = validateStringArray(value.concepts, "concepts");
  const files = validateStringArray(value.files, "files");
  const symptoms = validateStringArray(value.symptoms, "symptoms");
  const keywords = validateStringArray(value.keywords, "keywords");
  if (files.some((file) => SOLUTION_SOURCE_PATTERN.test(file))) {
    throw new TypeError("Lab1 solution files cannot be indexed.");
  }
  return Object.freeze({
    id: value.id,
    lab: value.lab,
    stage: value.stage,
    type: value.type,
    topic: value.topic,
    concepts,
    files,
    symptoms,
    hintLevel: value.hintLevel,
    source: value.source,
    keywords,
    title: value.title,
    content: value.content
  });
}

function validateChunks(value) {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < 1
    || value.length > MAX_CHUNKS
    || Object.keys(value).length !== value.length) {
    throw new TypeError("Invalid Lab1 knowledge chunks.");
  }
  const ids = new Set();
  return Object.freeze(value.map((chunk) => {
    const validated = validateChunk(chunk);
    if (ids.has(validated.id)) throw new TypeError("Duplicate Lab1 knowledge chunk id.");
    ids.add(validated.id);
    return validated;
  }));
}

function loadKnowledgeBase(filePath = LAB1_KNOWLEDGE_PATH) {
  if (filePath !== LAB1_KNOWLEDGE_PATH) {
    throw new TypeError("Only the bundled Lab1 knowledge base may be loaded.");
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    throw new TypeError("The Lab1 knowledge base could not be loaded.");
  }
  if (!isPlainObject(parsed)
    || Object.keys(parsed).sort().join("|") !== "chunks|lab|schemaVersion"
    || parsed.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION
    || parsed.lab !== "lab1") {
    throw new TypeError("Invalid Lab1 knowledge base metadata.");
  }
  return Object.freeze({
    schemaVersion: parsed.schemaVersion,
    lab: parsed.lab,
    chunks: validateChunks(parsed.chunks)
  });
}

function includesAlias(text, aliases) {
  return aliases.some((alias) => text.includes(normalizeText(alias)));
}

function inferredSymptoms(query) {
  const symptoms = new Set();
  if (/只.*opensbi|停在.*opensbi|opensbi.*(?:没有|没|无).*输出/iu.test(query)) {
    symptoms.add("opensbi-only");
    symptoms.add("no-kernel-output");
  }
  if (/qemu.*(?:timeout|超时)|(?:timeout|超时).*qemu/iu.test(query)) {
    symptoms.add("qemu-timeout");
  }
  if (/(?:events?|事件).*(?:为空|是空|没有|0)|returnedcount\s*=\s*0|totalmatched\s*=\s*0/iu.test(query)) {
    symptoms.add("empty-events");
    symptoms.add("evidence-insufficient");
  }
  if (/panic|崩溃/iu.test(query)) symptoms.add("panic");
  if (/build.*(?:fail|失败)|构建失败|编译错误/iu.test(query)) symptoms.add("build-failure");
  if (/qemu.*(?:无法|不能|失败).*(?:启动|运行)/iu.test(query)) symptoms.add("qemu-start-failure");
  if (/没有.*(?:kernel|内核).*输出|(?:kernel|内核).*(?:没有|无).*输出/iu.test(query)) {
    symptoms.add("no-kernel-output");
  }
  return symptoms;
}

function inferredTopics(query) {
  const topics = new Set();
  if (/opensbi|_start|kernel_main|启动|入口|boot|s-mode|启动栈/iu.test(query)) topics.add("boot");
  if (/opensbi|固件/iu.test(query)) topics.add("firmware");
  if (/sbi|m-mode|s-mode|特权/iu.test(query)) topics.add("privilege");
  if (/console|控制台|输出/iu.test(query)) topics.add("console");
  if (/qemu|超时|timeout/iu.test(query)) topics.add("qemu");
  if (/panic|崩溃/iu.test(query)) topics.add("panic");
  if (/events?|事件|证据/iu.test(query)) topics.add("evidence");
  if (/build|构建|编译/iu.test(query)) topics.add("build");
  if (/no_std|no_main|裸机|rust/iu.test(query)) topics.add("rust");
  return topics;
}

function validateLookup(value) {
  if (!isPlainObject(value)) throw new TypeError("Knowledge lookup must be a plain object.");
  const fields = ["lab", "limit", "maxHintLevel", "query", "symptoms", "topic"];
  if (Object.keys(value).some((field) => !fields.includes(field))
    || !safeString(value.query, MAX_QUERY_LENGTH)) {
    throw new TypeError("Invalid knowledge lookup query.");
  }
  const lab = value.lab === undefined || value.lab === null
    ? null
    : normalizeText(value.lab);
  if (lab !== null && !safeString(lab, 80)) throw new TypeError("Invalid knowledge Lab.");
  const limit = value.limit === undefined ? DEFAULT_KNOWLEDGE_LIMIT : value.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_KNOWLEDGE_RESULTS) {
    throw new TypeError("Invalid knowledge result limit.");
  }
  const maxHintLevel = value.maxHintLevel === undefined
    ? DEFAULT_MAX_HINT_LEVEL
    : value.maxHintLevel;
  if (!Number.isInteger(maxHintLevel)
    || maxHintLevel < 1
    || maxHintLevel > MAX_STUDENT_HINT_LEVEL) {
    throw new TypeError("Invalid knowledge hint level.");
  }
  const topic = value.topic === undefined || value.topic === null
    ? null
    : normalizeText(value.topic);
  if (topic !== null && !safeString(topic, 80)) throw new TypeError("Invalid knowledge topic.");
  const symptoms = value.symptoms === undefined
    ? Object.freeze([])
    : validateStringArray(value.symptoms, "lookup symptoms", 16).map(normalizeText);
  return Object.freeze({
    query: value.query.trim(),
    lab,
    topic,
    symptoms: Object.freeze(symptoms),
    limit,
    maxHintLevel
  });
}

function scoreChunk(chunk, lookup) {
  const query = normalizeText(lookup.query);
  const concepts = chunk.concepts.map(normalizeText);
  const keywords = chunk.keywords.map(normalizeText);
  const symptoms = chunk.symptoms.map(normalizeText);
  const files = chunk.files.map(normalizeText);
  const title = normalizeText(chunk.title);
  const content = normalizeText(chunk.content);
  let score = 0;

  for (const exact of EXACT_TERMS) {
    if (!includesAlias(query, exact.aliases)) continue;
    if (concepts.includes(exact.term)) score += 140;
    else if (concepts.some((concept) => concept.includes(exact.term))) score += 110;
    if (keywords.some((keyword) => keyword.includes(exact.term))) score += 75;
    if (title.includes(exact.term)) score += 60;
    if (files.some((file) => file.includes(exact.term))) score += 45;
    if (content.includes(exact.term)) score += 25;
  }

  for (const keyword of keywords) {
    if (keyword.length >= 2 && (query.includes(keyword) || keyword.includes(query))) score += 95;
  }
  for (const concept of concepts) {
    if (concept.length >= 2 && query.includes(concept)) score += 65;
  }

  const querySymptoms = inferredSymptoms(query);
  for (const symptom of lookup.symptoms) querySymptoms.add(symptom);
  for (const symptom of querySymptoms) {
    if (symptoms.includes(symptom)) score += 125;
  }

  const queryTopics = inferredTopics(query);
  if (lookup.topic) queryTopics.add(lookup.topic);
  if (queryTopics.has(normalizeText(chunk.topic))) score += 35;

  const asciiTerms = query.match(/[a-z#!_][a-z0-9#!_.-]{1,39}/gu) || [];
  for (const term of new Set(asciiTerms)) {
    if (title.includes(term)) score += 15;
    if (content.includes(term)) score += 5;
  }
  return score;
}

function resultView(chunk, score) {
  return Object.freeze({
    id: chunk.id,
    lab: chunk.lab,
    stage: chunk.stage,
    type: chunk.type,
    topic: chunk.topic,
    concepts: chunk.concepts,
    files: chunk.files,
    symptoms: chunk.symptoms,
    hintLevel: chunk.hintLevel,
    source: chunk.source,
    title: chunk.title,
    content: chunk.content,
    score
  });
}

function createKnowledgeRetriever(options = {}) {
  if (!isPlainObject(options)
    || Object.keys(options).some((field) => field !== "chunks")) {
    throw new TypeError("Invalid knowledge retriever options.");
  }
  const chunks = options.chunks === undefined
    ? loadKnowledgeBase().chunks
    : validateChunks(options.chunks);

  return Object.freeze({
    retrieveKnowledge(input) {
      const lookup = validateLookup(input);
      if (lookup.lab !== "lab1") return Object.freeze([]);
      const normalizedQuery = normalizeText(lookup.query);
      if (RUNTIME_ONLY_PATTERNS.some((pattern) => pattern.test(normalizedQuery))) {
        return Object.freeze([]);
      }
      const ranked = chunks
        .filter((chunk) => chunk.lab === lookup.lab && chunk.hintLevel <= lookup.maxHintLevel)
        .map((chunk) => Object.freeze({ chunk, score: scoreChunk(chunk, lookup) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id));
      return Object.freeze(ranked.slice(0, lookup.limit).map((entry) => (
        resultView(entry.chunk, entry.score)
      )));
    }
  });
}

let defaultRetriever = null;

function retrieveKnowledge(input) {
  if (defaultRetriever === null) defaultRetriever = createKnowledgeRetriever();
  return defaultRetriever.retrieveKnowledge(input);
}

module.exports = {
  DEFAULT_KNOWLEDGE_LIMIT,
  DEFAULT_MAX_HINT_LEVEL,
  KNOWLEDGE_SCHEMA_VERSION,
  LAB1_KNOWLEDGE_PATH,
  MAX_KNOWLEDGE_RESULTS,
  MAX_STUDENT_HINT_LEVEL,
  createKnowledgeRetriever,
  loadKnowledgeBase,
  retrieveKnowledge
};
