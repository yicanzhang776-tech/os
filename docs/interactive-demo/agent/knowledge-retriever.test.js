"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_KNOWLEDGE_LIMIT,
  MAX_KNOWLEDGE_RESULTS,
  createKnowledgeRetriever,
  loadKnowledgeBase,
  retrieveKnowledge
} = require("./knowledge-retriever");

function lookup(query, overrides = {}) {
  return retrieveKnowledge({ query, lab: "lab1", ...overrides });
}

function combinedText(results) {
  return results.map((item) => `${item.title}\n${item.content}`).join("\n");
}

test("loads the bounded structured Lab1 knowledge base", () => {
  const knowledge = loadKnowledgeBase();
  assert.equal(knowledge.schemaVersion, "os-tutor.knowledge/v1");
  assert.equal(knowledge.lab, "lab1");
  assert.equal(knowledge.chunks.length, 19);
  assert.equal(new Set(knowledge.chunks.map((chunk) => chunk.id)).size, 19);
  for (const chunk of knowledge.chunks) {
    assert.deepEqual(Object.keys(chunk), [
      "id", "lab", "stage", "type", "topic", "concepts", "files", "symptoms",
      "hintLevel", "source", "keywords", "title", "content"
    ]);
    assert.equal(chunk.lab, "lab1");
    assert.ok(chunk.hintLevel >= 1 && chunk.hintLevel <= 4);
  }
});

test("CASE 1 retrieves OpenSBI, SBI, and Lab1 boot knowledge without unrelated topics", () => {
  const results = lookup("OpenSBI是什么？");
  const ids = results.map((item) => item.id);
  const text = combinedText(results);
  assert.equal(ids[0], "lab1-concept-opensbi");
  assert.ok(results.some((item) => item.concepts.includes("SBI")));
  assert.ok(results.some((item) => item.id === "lab1-boot-flow"));
  assert.match(text, /OpenSBI/);
  assert.doesNotMatch(text, /页表|page table|虚拟内存/i);
});

test("CASE 2 retrieves boot flow and entry diagnosis for OpenSBI-only output", () => {
  const results = lookup("Lab1只看到OpenSBI，后面没有输出怎么办？");
  const ids = results.map((item) => item.id);
  assert.equal(ids[0], "lab1-debug-opensbi-only");
  assert.ok(ids.includes("lab1-boot-flow"));
  assert.ok(results.some((item) => item.concepts.includes("kernel entry")));
  assert.match(combinedText(results), /_start/);
});

test("CASE 3 prioritizes kernel_main responsibilities and entry knowledge", () => {
  const results = lookup("kernel_main在Lab1中负责什么？");
  assert.equal(results[0].id, "lab1-kernel-main");
  assert.ok(results.slice(0, 3).some((item) => item.id === "lab1-start-and-boot-stack"));
  assert.match(results[0].content, /Rust内核主函数|Rust 内核主函数/);
});

test("CASE 4 explains that a successful build plus QEMU timeout is not a start failure", () => {
  const results = lookup("构建成功但是QEMU超时说明什么？");
  assert.equal(results[0].id, "lab1-debug-qemu-timeout");
  assert.match(results[0].content, /timeout.*不.*等价.*QEMU.*未启动|timeout.*不.*描述进程是否曾启动/i);
  assert.match(results[0].content, /额外证据/);
});

test("CASE 5 empty events cannot establish that a panic happened", () => {
  const results = lookup("events为空说明发生了panic吗？");
  assert.equal(results[0].id, "lab1-debug-empty-events");
  assert.match(results[0].content, /不能证明发生或没有发生 panic/);
  assert.match(results[0].content, /不能提供.*地址.*最后执行位置/);
});

test("CASE 6 current Lab filtering rejects Lab4 and Lab6 pollution", () => {
  assert.deepEqual(retrieveKnowledge({ query: "OpenSBI是什么？", lab: "lab4" }), []);
  assert.deepEqual(retrieveKnowledge({ query: "OpenSBI是什么？", lab: "lab6" }), []);
  assert.ok(lookup("OpenSBI是什么？").every((item) => item.lab === "lab1"));

  const lab1Chunk = loadKnowledgeBase().chunks[0];
  for (const lab of ["lab4", "lab6"]) {
    assert.throws(() => createKnowledgeRetriever({
      chunks: [{ ...lab1Chunk, id: `${lab}-pollution`, lab }]
    }), /Invalid or unsafe Lab1 knowledge chunk/);
  }
});

test("CASE 7 excludes solution sources, answer-level hints, and complete code", () => {
  const results = lookup("这里应该怎么写？", { limit: MAX_KNOWLEDGE_RESULTS });
  const serialized = JSON.stringify(results);
  assert.doesNotMatch(serialized, /lab1[-_]solution|SOLUTION\.md|TEACHER_GUIDE|```/i);
  assert.ok(results.every((item) => item.hintLevel <= 3));

  const base = loadKnowledgeBase().chunks[0];
  assert.throws(() => createKnowledgeRetriever({
    chunks: [{ ...base, source: "origin/lab1-solution:kernel/src/main.rs" }]
  }), /unsafe|solution/i);
  assert.throws(() => createKnowledgeRetriever({
    chunks: [{ ...base, id: "lab1-answer-level", hintLevel: 5 }]
  }), /unsafe/i);
  assert.throws(() => createKnowledgeRetriever({
    chunks: [{ ...base, id: "lab1-code-copy", content: "```rust\nfn answer() {}\n```" }]
  }), /unsafe/i);
});

test("CASE 8 returns only the small highest-ranked set instead of the whole knowledge base", () => {
  const defaultResults = lookup("为什么我的Lab1只停在OpenSBI？");
  const limitedResults = lookup("为什么我的Lab1只停在OpenSBI？", { limit: 3 });
  assert.equal(defaultResults.length, DEFAULT_KNOWLEDGE_LIMIT);
  assert.equal(limitedResults.length, 3);
  assert.deepEqual(limitedResults, defaultResults.slice(0, 3));
  assert.ok(defaultResults.length < loadKnowledgeBase().chunks.length);
  assert.ok(defaultResults.every((item, index) => (
    index === 0 || defaultResults[index - 1].score >= item.score
  )));
});

test("runtime-only questions skip knowledge retrieval and default hints stay at Levels 1-3", () => {
  assert.deepEqual(lookup("我现在在哪个Lab？"), []);
  assert.deepEqual(lookup("main.rs现在是什么内容？"), []);
  assert.ok(lookup("只看到OpenSBI怎么办？").every((item) => item.hintLevel <= 3));
});
