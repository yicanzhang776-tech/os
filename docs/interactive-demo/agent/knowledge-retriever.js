"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KNOWLEDGE_SCHEMA_VERSION = "os-tutor.knowledge/v1";
const SUPPORTED_LABS = Object.freeze([
  "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"
]);
const KNOWLEDGE_ROOT = path.join(__dirname, "..", "..", "knowledge", "labs");
const KNOWLEDGE_PATHS = Object.freeze(Object.fromEntries(SUPPORTED_LABS.map((lab) => [
  lab,
  path.join(KNOWLEDGE_ROOT, lab, "knowledge.json")
])));
const KNOWLEDGE_DIGESTS = Object.freeze({
  lab1: "fe9698bc3474a2d4133fd26ea158b2e3f043f617c40c333b9ddf9800807dbda8",
  lab2: "24f42f5cf56ae362e287c1b6ba6172236c2fef4618da1774685f44a650dfb68d",
  lab3: "ca7177585e5a4a3ca889bd2f8cddd3f42001cf24b1e9e2a683929a650397f1b3",
  lab4: "1b01efa27f67c4a6847a15eaa69f11cd1877be65192c4d3aaf960ddc2c63764a",
  lab5: "4ec50f89956ec334c9a8da2767f0042b82db7912c6f36bb6617d939582ca1180",
  lab6: "a5ba29914bb9a647a6363277267523a0bff374d601c3ac365c4ca52d5b2451f2",
  lab7: "7f0b6298ae18fcb69aa6ff883f95da8be7131b0f0d136168c0582fdf5b892837"
});
const DEFAULT_KNOWLEDGE_LIMIT = 4;
const MAX_KNOWLEDGE_RESULTS = 5;
const DEFAULT_MAX_HINT_LEVEL = 3;
const MAX_STUDENT_HINT_LEVEL = 4;
const MAX_QUERY_LENGTH = 4_000;
const MAX_CHUNKS_PER_LAB = 256;
const MAX_CHUNK_CONTENT_LENGTH = 2_000;
const FORBIDDEN_TEXT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SOLUTION_SOURCE_PATTERN = /(?:^|[\\/:\s])lab[1-7][-_]solution(?:[\\/:\s]|$)|(?:^|[\\/:\s])SOLUTION\.md(?:$|[\\/:\s])|TEACHER[_-]?GUIDE(?:\.md)?/i;
const CODE_BLOCK_PATTERN = /```|~~~|(?:^|\n)\s*(?:pub\s+)?(?:unsafe\s+)?(?:extern\s+"C"\s+)?fn\s+[A-Za-z_]/;

const EXACT_TERMS = Object.freeze([
  ["opensbi", ["opensbi"]],
  ["s-mode", ["s-mode", "s mode", "s模式"]],
  ["u-mode", ["u-mode", "u mode", "u模式", "用户态"]],
  ["m-mode", ["m-mode", "m mode", "m模式"]],
  ["kernel_main", ["kernel_main"]],
  ["_start", ["_start"]],
  ["sbi", ["sbi"]],
  ["stvec", ["stvec"]],
  ["scause", ["scause"]],
  ["sepc", ["sepc"]],
  ["stval", ["stval"]],
  ["breakpoint", ["breakpoint", "断点异常"]],
  ["physaddr", ["physaddr", "物理地址"]],
  ["physpagenum", ["physpagenum", "物理页号"]],
  ["sv39", ["sv39"]],
  ["satp", ["satp"]],
  ["sfence.vma", ["sfence.vma", "sfence vma"]],
  ["pte", ["pte", "页表项"]],
  ["vpn", ["vpn", "虚拟页号"]],
  ["ppn", ["ppn", "物理页号"]],
  ["taskcontext", ["taskcontext", "任务上下文"]],
  ["__switch", ["__switch", "上下文切换"]],
  ["yield", ["yield", "主动让出"]],
  ["ecall", ["ecall"]],
  ["sret", ["sret"]],
  ["syscall", ["syscall", "系统调用"]],
  ["a7", ["a7"]],
  ["a0", ["a0"]],
  ["register abi", ["寄存器约定", "id和返回值", "编号和返回值", "系统调用abi"]],
  ["ramdevice", ["ramdevice", "内存设备"]],
  ["simplefs", ["simplefs", "简化文件系统"]],
  ["fd", ["fd", "文件描述符"]],
  ["console", ["console", "控制台"]],
  ["qemu timeout", ["qemu timeout", "qemu超时", "qemu 超时"]],
  ["panic", ["panic", "崩溃"]],
  ["#![no_std]", ["#![no_std]", "no_std"]],
  ["#![no_main]", ["#![no_main]", "no_main"]]
].map(([term, aliases]) => Object.freeze({
  term,
  aliases: Object.freeze(aliases)
})));

const RUNTIME_ONLY_PATTERNS = Object.freeze([
  /(?:当前|现在).*(?:哪个|什么).*(?:lab|实验)/i,
  /(?:当前|现在).*(?:分支|branch|commit|工作区|进度|修改状态)/i,
  /(?:当前|现在).*(?:\.rs|\.s|\.ld|代码|实现).*(?:内容|是什么|怎么写)/i,
  /(?:\.rs|\.s|\.ld|代码|实现).*(?:当前|现在).*(?:内容|是什么|怎么写)/i,
  /(?:刚才|最近|上一次).*(?:测试|运行).*(?:结果|状态|输出)/i,
  /(?:当前|现在).*(?:代码|diff|改了什么|修改了什么)/i
]);

const TOPIC_RULES = Object.freeze([
  ["boot", /opensbi|_start|kernel_main|启动|入口|boot|启动栈/iu],
  ["firmware", /opensbi|固件/iu],
  ["privilege", /m-mode|s-mode|u-mode|特权|sstatus|spp|spie/iu],
  ["trap", /trap|异常|中断|stvec|scause|sepc|stval|breakpoint/iu],
  ["address", /地址|页号|页内偏移|floor|ceil|page_offset|physaddr/iu],
  ["allocator", /分配器|alloc|dealloc|回收|复用|double.?free|页帧/iu],
  ["page-table", /页表|sv39|pte|vpn|ppn|map|unmap|translate/iu],
  ["paging", /satp|sfence|分页|地址空间|恒等映射/iu],
  ["task", /任务|task|tcb|taskcontext|内核栈/iu],
  ["scheduler", /调度|scheduler|round.?robin|next_scan|ready|running|exited|yield/iu],
  ["context-switch", /__switch|上下文切换|ra|s0|s11/iu],
  ["user", /用户态|u-mode|usercontext|sret|用户栈/iu],
  ["syscall", /系统调用|syscall|ecall|a0|a7|write|exit/iu],
  ["device", /设备|bytedevice|ramdevice|offset|容量|越界/iu],
  ["filesystem", /文件系统|simplefs|文件描述符|fd|open|read|write|close/iu],
  ["console", /console|控制台|输出/iu],
  ["qemu", /qemu|超时|timeout/iu],
  ["panic", /panic|崩溃/iu],
  ["evidence", /events?|事件|证据|marker/iu],
  ["build", /build|构建|编译/iu],
  ["testing", /测试|stage|expectincomplete|验收/iu]
].map(([topic, pattern]) => Object.freeze({ topic, pattern })));

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
    throw new TypeError(`Invalid knowledge ${field}.`);
  }
  return Object.freeze(value.map((item) => item.trim()));
}

function validateChunk(value, expectedLab) {
  const fields = [
    "concepts", "content", "files", "hintLevel", "id", "keywords", "lab",
    "source", "stage", "symptoms", "title", "topic", "type"
  ];
  const idPattern = new RegExp(`^${expectedLab}-[a-z0-9-]+$`);
  if (!isPlainObject(value)
    || Object.keys(value).sort().join("|") !== fields.sort().join("|")
    || !safeString(value.id, 120)
    || !idPattern.test(value.id)
    || value.lab !== expectedLab
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
    throw new TypeError(`Invalid or unsafe ${expectedLab} knowledge chunk.`);
  }
  const concepts = validateStringArray(value.concepts, "concepts");
  const files = validateStringArray(value.files, "files");
  const symptoms = validateStringArray(value.symptoms, "symptoms");
  const keywords = validateStringArray(value.keywords, "keywords");
  if (files.some((file) => SOLUTION_SOURCE_PATTERN.test(file))) {
    throw new TypeError("Solution and teacher-only files cannot be indexed.");
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

function validateChunks(value, expectedLab) {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < 1
    || value.length > MAX_CHUNKS_PER_LAB
    || Object.keys(value).length !== value.length) {
    throw new TypeError(`Invalid ${expectedLab} knowledge chunks.`);
  }
  const ids = new Set();
  return Object.freeze(value.map((chunk) => {
    const validated = validateChunk(chunk, expectedLab);
    if (ids.has(validated.id)) throw new TypeError(`Duplicate ${expectedLab} knowledge chunk id.`);
    ids.add(validated.id);
    return validated;
  }));
}

function validateKnowledgeBase(value, expectedLab) {
  if (!isPlainObject(value)
    || Object.keys(value).sort().join("|") !== "chunks|lab|schemaVersion"
    || value.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION
    || value.lab !== expectedLab) {
    throw new TypeError(`Invalid ${expectedLab} knowledge base metadata.`);
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    lab: value.lab,
    chunks: validateChunks(value.chunks, expectedLab)
  });
}

function loadKnowledgeBase(lab = "lab1") {
  if (!SUPPORTED_LABS.includes(lab)) throw new TypeError("Unsupported knowledge Lab.");
  let source;
  try {
    source = fs.readFileSync(KNOWLEDGE_PATHS[lab], "utf8");
  } catch (_) {
    throw new TypeError(`The ${lab} knowledge base could not be loaded.`);
  }
  const normalizedSource = source.replace(/\r\n/gu, "\n");
  const digest = crypto.createHash("sha256").update(normalizedSource, "utf8").digest("hex");
  if (digest !== KNOWLEDGE_DIGESTS[lab]) {
    throw new TypeError(`The ${lab} knowledge base failed its integrity check.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (_) {
    throw new TypeError(`The ${lab} knowledge base could not be loaded.`);
  }
  return validateKnowledgeBase(parsed, lab);
}

function loadKnowledgeCatalog() {
  return Object.freeze(Object.fromEntries(SUPPORTED_LABS.map((lab) => [
    lab,
    loadKnowledgeBase(lab)
  ])));
}

function validateKnowledgeCatalog(value) {
  if (!isPlainObject(value)) throw new TypeError("Knowledge catalog must be a plain object.");
  const labs = Object.keys(value);
  if (labs.length < 1 || labs.some((lab) => !SUPPORTED_LABS.includes(lab))) {
    throw new TypeError("Invalid knowledge catalog Labs.");
  }
  return Object.freeze(Object.fromEntries(labs.map((lab) => [
    lab,
    validateKnowledgeBase(value[lab], lab)
  ])));
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
  if (/qemu.*(?:timeout|超时)|(?:timeout|超时).*qemu|超时/iu.test(query)) {
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
  if (/重复.*(?:trap|异常)|trap.*(?:循环|反复)|ecall.*(?:循环|反复)/iu.test(query)) {
    symptoms.add("trap-loop");
    symptoms.add("repeated-breakpoint");
  }
  if (/ecall.*(?:重复|一直|循环|反复)|(?:重复|循环|反复).*ecall/iu.test(query)) {
    symptoms.add("repeated-ecall");
    symptoms.add("same-log-repeats");
  }
  if (/(?:breakpoint|断点).*(?:未识别|没有识别|not decoded|失败)/iu.test(query)) {
    symptoms.add("breakpoint-not-decoded");
    symptoms.add("stage2-failure");
  }
  if (/off.?by.?one|差一页|多一页|少一页|边界.*错误/iu.test(query)) symptoms.add("off-by-one");
  if (/double.?free|重复释放/iu.test(query)) symptoms.add("double-free");
  if (/耗尽|out of memory|分配.*none|没有空闲页/iu.test(query)) symptoms.add("allocator-exhausted");
  if (/页表.*(?:找不到|失败)|translate.*(?:none|失败)|映射.*失败/iu.test(query)) {
    symptoms.add("translation-failure");
  }
  if (/调度.*(?:卡住|不动)|任务.*(?:不切换|不轮转)|只有一个任务/iu.test(query)) {
    symptoms.add("scheduler-stall");
  }
  if (/顺序.*(?:错误|不对)|任务.*乱序/iu.test(query)) symptoms.add("wrong-task-order");
  if (/退出.*(?:又|仍然).*(?:调度|运行)/iu.test(query)) symptoms.add("exited-task-rescheduled");
  if (/进不了.*用户态|sret.*(?:失败|没返回)|u-mode.*(?:失败|没有)/iu.test(query)) {
    symptoms.add("user-entry-failure");
  }
  if (/未知.*(?:syscall|系统调用)|unimplemented.*syscall/iu.test(query)) symptoms.add("unknown-syscall");
  if (/无效.*fd|invalid.*fd|重复.*close/iu.test(query)) symptoms.add("invalid-fd");
  if (/偏移.*(?:不变|没有前进)|offset.*(?:不变|错误)/iu.test(query)) symptoms.add("offset-not-advanced");
  if (/写入.*读回.*(?:不同|失败)|read.*write.*(?:mismatch|不同)/iu.test(query)) {
    symptoms.add("round-trip-mismatch");
  }
  return symptoms;
}

function inferredTopics(query) {
  const topics = new Set();
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(query)) topics.add(rule.topic);
  }
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
  const compactQuery = query.replace(/\s+/gu, "");
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
    const compactKeyword = keyword.replace(/\s+/gu, "");
    if (keyword.length >= 2 && (query.includes(keyword)
      || keyword.includes(query)
      || compactQuery.includes(compactKeyword)
      || compactKeyword.includes(compactQuery))) {
      score += 95;
    }
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

  const overviewIntent = /(?:目标|做什么|几个任务|三个任务|概览|overview|实验范围|前置知识)/iu
    .test(query);
  if (chunk.type === "overview") score += overviewIntent ? 120 : -220;
  if (chunk.type === "stage" && queryTopics.has("testing")) score += 80;
  if (chunk.type === "diagnosis" && /(?:失败|不对|错误|怎么办|超时|崩溃|没有|未|重复)/iu.test(query)) {
    score += 60;
  }

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
    || Object.keys(options).some((field) => field !== "catalog")) {
    throw new TypeError("Invalid knowledge retriever options.");
  }
  let catalog;
  let unavailableLabs = Object.freeze([]);
  if (options.catalog === undefined) {
    const loaded = {};
    const unavailable = [];
    for (const lab of SUPPORTED_LABS) {
      try {
        loaded[lab] = loadKnowledgeBase(lab);
      } catch (_) {
        unavailable.push(lab);
      }
    }
    catalog = Object.freeze(loaded);
    unavailableLabs = Object.freeze(unavailable);
  } else {
    catalog = validateKnowledgeCatalog(options.catalog);
  }

  return Object.freeze({
    retrieveKnowledge(input) {
      const lookup = validateLookup(input);
      if (!lookup.lab) return Object.freeze([]);
      if (unavailableLabs.includes(lookup.lab)) {
        throw new TypeError(`The ${lookup.lab} knowledge base is unavailable.`);
      }
      if (!Object.hasOwn(catalog, lookup.lab)) return Object.freeze([]);
      const normalizedQuery = normalizeText(lookup.query);
      if (RUNTIME_ONLY_PATTERNS.some((pattern) => pattern.test(normalizedQuery))) {
        return Object.freeze([]);
      }
      const ranked = catalog[lookup.lab].chunks
        .filter((chunk) => chunk.hintLevel <= lookup.maxHintLevel)
        .map((chunk) => Object.freeze({ chunk, score: scoreChunk(chunk, lookup) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score
          || left.chunk.hintLevel - right.chunk.hintLevel
          || left.chunk.id.localeCompare(right.chunk.id));
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
  KNOWLEDGE_PATHS,
  KNOWLEDGE_SCHEMA_VERSION,
  MAX_KNOWLEDGE_RESULTS,
  MAX_STUDENT_HINT_LEVEL,
  SUPPORTED_LABS,
  createKnowledgeRetriever,
  loadKnowledgeBase,
  loadKnowledgeCatalog,
  retrieveKnowledge
};
