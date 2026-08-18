"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  DEFAULT_KNOWLEDGE_LIMIT,
  MAX_KNOWLEDGE_RESULTS,
  SUPPORTED_LABS,
  createKnowledgeRetriever,
  loadKnowledgeBase,
  loadKnowledgeCatalog,
  retrieveKnowledge
} = require("./knowledge-retriever");

const RESULT_FIELDS = Object.freeze([
  "id", "lab", "stage", "type", "topic", "concepts", "files", "symptoms",
  "hintLevel", "source", "title", "content", "score"
]);

function lookup(lab, query, overrides = {}) {
  return retrieveKnowledge({ lab, query, ...overrides });
}

test("loads seven independent bounded knowledge bases", () => {
  const catalog = loadKnowledgeCatalog();
  assert.deepEqual(Object.keys(catalog), SUPPORTED_LABS);
  for (const lab of SUPPORTED_LABS) {
    const knowledge = catalog[lab];
    assert.equal(knowledge.schemaVersion, "os-tutor.knowledge/v1");
    assert.equal(knowledge.lab, lab);
    assert.ok(knowledge.chunks.length >= 12 && knowledge.chunks.length <= 256);
    assert.equal(new Set(knowledge.chunks.map((chunk) => chunk.id)).size,
      knowledge.chunks.length);
    assert.equal(Object.isFrozen(knowledge), true);
    assert.equal(Object.isFrozen(knowledge.chunks), true);
    for (const chunk of knowledge.chunks) {
      assert.equal(chunk.lab, lab);
      assert.match(chunk.id, new RegExp(`^${lab}-[a-z0-9-]+$`));
      assert.ok(chunk.stage >= 0 && chunk.stage <= 3);
      assert.ok(chunk.hintLevel >= 1 && chunk.hintLevel <= 4);
      assert.doesNotMatch(`${chunk.source}\n${chunk.content}\n${chunk.files.join("\n")}`,
        /lab[1-7][-_]solution|SOLUTION\.md|TEACHER[_-]?GUIDE|```|~~~/i);
    }
  }
});

test("integrity failure is isolated to the affected Lab", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "os-tutor-knowledge-"));
  const agentDir = path.join(root, "docs", "interactive-demo", "agent");
  const labsDir = path.join(root, "docs", "knowledge", "labs");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "knowledge-retriever.js"),
    path.join(agentDir, "knowledge-retriever.js"));
  for (const lab of SUPPORTED_LABS) {
    const targetDir = path.join(labsDir, lab);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(path.join(__dirname, "..", "..", "knowledge", "labs", lab,
      "knowledge.json"), path.join(targetDir, "knowledge.json"));
  }
  fs.appendFileSync(path.join(labsDir, "lab3", "knowledge.json"), " ");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const isolated = require(path.join(agentDir, "knowledge-retriever.js"));
  assert.throws(() => isolated.loadKnowledgeBase("lab3"), /integrity check/);
  const store = isolated.createKnowledgeRetriever();
  assert.ok(store.retrieveKnowledge({ lab: "lab2", query: "stvec" }).length > 0);
  assert.throws(() => store.retrieveKnowledge({ lab: "lab3", query: "alloc" }),
    /unavailable/);
});

test("representative concept and diagnosis queries retrieve the intended teaching block", () => {
  const cases = [
    ["lab1", "OpenSBI 是什么？", "lab1-concept-opensbi"],
    ["lab2", "stvec 和 sepc 有什么区别？", "lab2-stvec-direct-mode"],
    ["lab2", "重复 trap 后超时怎么办？", "lab2-debug-stage3-timeout"],
    ["lab3", "对齐地址的 ceil 为什么不能多一页？", "lab3-rounding-alignment"],
    ["lab3", "释放后不复用并且重复释放怎么办？", "lab3-debug-stage3"],
    ["lab4", "indexes 顺序和三级 walk 顺序一样吗？", "lab4-vpn-index-order"],
    ["lab4", "starter 只有根页表，缺少中间页表存储怎么办？", "lab4-starter-storage-gap"],
    ["lab5", "TaskContext 为什么保存 ra 和 s0 到 s11？", "lab5-task-context"],
    ["lab5", "round robin 总是选任务 0 怎么办？", "lab5-round-robin-scan"],
    ["lab6", "系统调用 id 和返回值的寄存器约定是什么？", "lab6-syscall-abi"],
    ["lab6", "ecall 一直重复导致超时怎么办？", "lab6-sepc-after-ecall"],
    ["lab7", "fd 小于 3 为什么非法？", "lab7-fd-index-validation"],
    ["lab7", "实现后 host test 仍期待 Unimplemented 怎么办？",
      "lab7-starter-test-contract-conflict"]
  ];
  let topOneHits = 0;
  for (const [lab, query, expectedId] of cases) {
    const results = lookup(lab, query, { limit: 3 });
    assert.ok(results.length > 0, `${lab} returned no result for ${query}`);
    assert.ok(results.some((item) => item.id === expectedId),
      `${expectedId} was not in the top three for ${query}`);
    if (results[0].id === expectedId) topOneHits += 1;
  }
  assert.ok(topOneHits / cases.length >= 0.85,
    `Top-1 retrieval accuracy was ${topOneHits}/${cases.length}`);
});

test("hard Lab filtering prevents cross-Lab knowledge pollution", () => {
  const queries = [
    "OpenSBI 是什么？",
    "stvec sepc breakpoint",
    "页帧分配和重复释放",
    "Sv39 PTE translate",
    "TaskContext round robin",
    "sret ecall syscall",
    "RamDevice SimpleFs fd"
  ];
  for (const lab of SUPPORTED_LABS) {
    for (const query of queries) {
      assert.ok(lookup(lab, query).every((item) => item.lab === lab));
    }
  }
  assert.deepEqual(lookup("lab4", "OpenSBI 是什么？"), []);
  assert.deepEqual(lookup("lab8", "页表"), []);
});

test("runtime-only questions bypass static retrieval", () => {
  for (const lab of SUPPORTED_LABS) {
    assert.deepEqual(lookup(lab, "我现在在哪个 Lab？"), []);
    assert.deepEqual(lookup(lab, "main.rs 现在是什么内容？"), []);
    assert.deepEqual(lookup(lab, "最近一次测试结果是什么？"), []);
  }
});

test("current implementation and recent runtime facts always bypass static retrieval", () => {
  const cases = [
    ["lab4", "当前 page_table.rs 的实现哪里错误？"],
    ["lab2", "现在 trap.rs 为什么失败？"],
    ["lab2", "当前 sepc 的值是什么？"],
    ["lab4", "最近一次运行里的 satp 值是多少？"],
    ["lab6", "当前 syscall.rs 应该检查哪里？"],
    ["lab7", "当前 fs.rs 的 fd 实现错在哪？"]
  ];
  for (const [lab, query] of cases) {
    assert.deepEqual(lookup(lab, query), [], `${lab} should bypass for ${query}`);
  }
});

test("mixed runtime wording keeps the course concept while pure runtime lookup bypasses", () => {
  const mixed = lookup("lab2", "当前代码为什么反复 trap，sepc 原理是什么？", {
    limit: 3
  });
  assert.ok(mixed.some((item) => [
    "lab2-sepc-progress", "lab2-debug-stage3-timeout", "lab2-csr-roles"
  ].includes(item.id)));
  assert.deepEqual(lookup("lab2", "当前 trap.rs 的具体内容是什么？"), []);
});

test("diagnosis evidence outranks overview while concept questions still prefer concepts", () => {
  const diagnosis = lookup("lab6",
    "执行完 ecall 后程序计数器没推进，同一系统调用再次执行。", { limit: 3 });
  assert.equal(diagnosis[0].id, "lab6-sepc-after-ecall");
  assert.ok(diagnosis.every((item) => item.type !== "overview"));

  const concept = lookup("lab4", "有效的 PTE 如何区分叶子项和中间项？", {
    limit: 3
  });
  assert.equal(concept[0].id, "lab4-leaf-nonleaf");
  assert.equal(concept[0].type, "concept");
});

test("canonical aliases preserve intent without copying full evaluation questions", () => {
  const fd = lookup("lab7", "fd 如何转换为内部槽位？", { limit: 1 });
  const handle = lookup("lab7", "文件句柄怎样映射为槽位下标？", { limit: 1 });
  assert.equal(fd[0].id, "lab7-fd-index-validation");
  assert.equal(handle[0].id, fd[0].id);

  const yieldTerm = lookup("lab5", "yield 后任务回到什么状态？", { limit: 1 });
  const yieldAlias = lookup("lab5", "主动交出处理器以后任务回到什么调度状态？", {
    limit: 1
  });
  assert.equal(yieldTerm[0].id, "lab5-task-state-machine");
  assert.equal(yieldAlias[0].id, yieldTerm[0].id);
});

test("aliases cannot cross the hard Lab boundary and stop-word-only input abstains", () => {
  for (const lab of SUPPORTED_LABS) {
    assert.ok(lookup(lab, "文件句柄与内部槽位").every((item) => item.lab === lab));
    assert.deepEqual(lookup(lab, "为什么"), []);
  }
  assert.ok(lookup("lab7", "程序计数器 ecall").every((item) => (
    item.lab === "lab7" && item.id.startsWith("lab7-")
  )));
  assert.deepEqual(lookup("lab3", "内存盘写入后读出全零"), []);
  assert.deepEqual(lookup("lab6", "ebreak 反复触发"), []);
});

test("natural navigation questions find the Lab file guide or explicitly abstain", () => {
  const expectedByLab = {
    lab1: "lab1-key-files",
    lab2: "lab2-key-files",
    lab3: "lab3-key-files",
    lab4: null,
    lab5: "lab5-key-files",
    lab6: "lab6-key-files",
    lab7: "lab7-key-files"
  };
  for (const lab of SUPPORTED_LABS) {
    const results = lookup(lab, "这个实验应该检查哪些代码文件？", { limit: 3 });
    const expected = expectedByLab[lab];
    if (expected === null) {
      assert.deepEqual(results, [], `${lab} has no public navigation chunk`);
    } else {
      assert.equal(results[0]?.id, expected, `${lab} navigation result was wrong`);
    }
  }
});

test("stage diagnosis respects the requested stage across all Labs", () => {
  const expectedByLab = {
    lab1: ["lab1-debug-opensbi-only", "lab1-console-path", "lab1-debug-qemu-timeout"],
    lab2: ["lab2-debug-stage1", "lab2-debug-stage2", "lab2-debug-stage3-timeout"],
    lab3: ["lab3-debug-stage1", "lab3-debug-stage2", "lab3-debug-stage3"],
    lab4: ["lab4-debug-stage1", "lab4-debug-stage2", "lab4-debug-stage3"],
    lab5: ["lab5-debug-stage1", "lab5-debug-round-robin", "lab5-debug-timeout"],
    lab6: ["lab6-debug-stage1", "lab6-debug-stage2", "lab6-debug-repeated-ecall"],
    lab7: ["lab7-debug-device", "lab7-debug-fd", "lab7-debug-stage3"]
  };
  const stageNames = ["第一阶段", "第二阶段", "第三阶段"];
  for (const lab of SUPPORTED_LABS) {
    for (let index = 0; index < stageNames.length; index += 1) {
      const query = `${stageNames[index]}失败怎么办？`;
      const results = lookup(lab, query, { limit: 3 });
      assert.equal(results[0]?.id, expectedByLab[lab][index],
        `${lab} did not prioritize the requested stage for ${query}`);
    }
  }
});

test("results are ranked, bounded, immutable, and omit indexing-only keywords", () => {
  const defaults = lookup("lab4", "写 satp 后没有输出怎么办？");
  const limited = lookup("lab4", "写 satp 后没有输出怎么办？", { limit: 3 });
  assert.equal(defaults.length, DEFAULT_KNOWLEDGE_LIMIT);
  assert.equal(limited.length, 3);
  assert.deepEqual(limited, defaults.slice(0, 3));
  assert.ok(defaults.every((item, index) => (
    index === 0 || defaults[index - 1].score >= item.score
  )));
  for (const item of defaults) {
    assert.deepEqual(Object.keys(item), RESULT_FIELDS);
    assert.equal(item.lab, "lab4");
    assert.ok(item.hintLevel <= 3);
    assert.equal(Object.hasOwn(item, "keywords"), false);
    assert.equal(Object.isFrozen(item), true);
  }
  assert.throws(() => lookup("lab4", "satp", { limit: MAX_KNOWLEDGE_RESULTS + 1 }),
    /result limit/i);
});

test("a custom catalog is revalidated and cannot smuggle answer material", () => {
  const base = loadKnowledgeBase("lab2");
  const safeCatalog = { lab2: base };
  const store = createKnowledgeRetriever({ catalog: safeCatalog });
  assert.ok(store.retrieveKnowledge({ lab: "lab2", query: "stvec" }).length > 0);
  assert.deepEqual(store.retrieveKnowledge({ lab: "lab3", query: "alloc" }), []);

  const first = base.chunks[0];
  const knowledgeBase = (chunk) => ({
    schemaVersion: base.schemaVersion,
    lab: "lab2",
    chunks: [{ ...chunk }]
  });
  assert.throws(() => createKnowledgeRetriever({ catalog: {
    lab2: knowledgeBase({ ...first, source: "origin/lab2-solution:kernel/src/trap.rs" })
  } }), /unsafe/i);
  assert.throws(() => createKnowledgeRetriever({ catalog: {
    lab2: knowledgeBase({ ...first, id: "lab2-code-copy", content: "```rust\nfn answer() {}\n```" })
  } }), /unsafe/i);
  assert.throws(() => createKnowledgeRetriever({ catalog: {
    lab2: knowledgeBase({ ...first, id: "lab3-wrong", lab: "lab3" })
  } }), /unsafe/i);
  assert.throws(() => createKnowledgeRetriever({ catalog: {
    lab2: knowledgeBase({
      ...first,
      id: "lab2-duplicate-keyword",
      keywords: [first.keywords[0], first.keywords[0].toLocaleUpperCase("en-US")]
    })
  } }), /Duplicate knowledge keywords/);
  assert.throws(() => loadKnowledgeBase("lab8"), /Unsupported knowledge Lab/);
});

test("malformed lookups fail closed without selecting a filesystem path", () => {
  for (const input of [
    null,
    [],
    { lab: "lab1", query: "" },
    { lab: "../../private", query: "boot", limit: 1 },
    { lab: "lab1", query: "boot", maxHintLevel: 5 },
    { lab: "lab1", query: "boot", unexpected: true }
  ]) {
    if (input && input.lab === "../../private") {
      assert.deepEqual(retrieveKnowledge(input), []);
    } else {
      assert.throws(() => retrieveKnowledge(input), TypeError);
    }
  }
});
