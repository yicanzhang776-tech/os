"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  SUPPORTED_LABS,
  loadKnowledgeCatalog,
  retrieveKnowledge
} = require("./knowledge-retriever");
const {
  HELDOUT_LAB1_4_CASES
} = require("./knowledge-retriever-heldout-lab1-4.cases");
const {
  HELDOUT_LAB5_7_CASES
} = require("./knowledge-retriever-heldout-lab5-7.cases");

const HELDOUT_CASES = Object.freeze([
  ...HELDOUT_LAB1_4_CASES,
  ...HELDOUT_LAB5_7_CASES
]);
const TARGET_TOP_ONE = 0.80;
const TARGET_TOP_THREE = 0.90;

function normalizeForAudit(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, "")
    .trim();
}

function longChineseFragments(value) {
  const fragments = new Set();
  for (const run of String(value).normalize("NFKC").match(/[\p{Script=Han}]+/gu) || []) {
    for (let index = 0; index + 6 <= run.length; index += 1) {
      fragments.add(normalizeForAudit(run.slice(index, index + 6)));
    }
  }
  return fragments;
}

function evaluateHeldout() {
  let topOneHits = 0;
  let topThreeHits = 0;
  const misses = [];
  for (const item of HELDOUT_CASES) {
    const results = retrieveKnowledge({ lab: item.lab, query: item.query, limit: 3 });
    const ids = results.map((result) => result.id);
    assert.ok(results.every((result) => result.lab === item.lab),
      `Cross-Lab result for ${item.lab}: ${item.query}`);
    const topOne = item.expected.includes(ids[0]);
    const topThree = ids.some((id) => item.expected.includes(id));
    if (topOne) topOneHits += 1;
    if (topThree) topThreeHits += 1;
    if (!topOne || !topThree) {
      misses.push(Object.freeze({
        lab: item.lab,
        intent: item.intent,
        query: item.query,
        expected: item.expected,
        actual: Object.freeze(ids),
        topOne,
        topThree
      }));
    }
  }
  return Object.freeze({
    total: HELDOUT_CASES.length,
    topOneHits,
    topThreeHits,
    topOneRate: topOneHits / HELDOUT_CASES.length,
    topThreeRate: topThreeHits / HELDOUT_CASES.length,
    misses: Object.freeze(misses)
  });
}

test("held-out cases are independent, balanced, and reference public Lab chunks", () => {
  const catalog = loadKnowledgeCatalog();
  assert.equal(HELDOUT_CASES.length, 28);
  assert.equal(new Set(HELDOUT_CASES.map((item) => normalizeForAudit(item.query))).size,
    HELDOUT_CASES.length);
  for (const lab of SUPPORTED_LABS) {
    assert.equal(HELDOUT_CASES.filter((item) => item.lab === lab).length, 4);
  }

  const retrieverSource = normalizeForAudit(fs.readFileSync(
    path.join(__dirname, "knowledge-retriever.js"), "utf8"
  ));
  for (const item of HELDOUT_CASES) {
    assert.ok(Object.isFrozen(item));
    assert.ok(Object.isFrozen(item.expected));
    const validIds = new Set(catalog[item.lab].chunks.map((chunk) => chunk.id));
    assert.ok(item.expected.length > 0);
    assert.ok(item.expected.every((id) => validIds.has(id)));
    assert.equal(retrieverSource.includes(normalizeForAudit(item.query)), false);

    for (const fragment of longChineseFragments(item.query)) {
      assert.equal(retrieverSource.includes(fragment), false,
        `Held-out fragment leaked into retrieval rules: ${fragment}`);
      for (const chunk of catalog[item.lab].chunks) {
        for (const field of [
          chunk.title,
          chunk.content,
          chunk.topic,
          ...chunk.concepts,
          ...chunk.keywords,
          ...chunk.symptoms
        ]) {
          assert.equal(normalizeForAudit(field).includes(fragment), false,
            `Held-out fragment copied from ${chunk.id}: ${fragment}`);
        }
      }
    }
  }
});

test("frozen held-out retrieval reports its untuned quality", (t) => {
  const metrics = evaluateHeldout();
  const topOne = `${metrics.topOneHits}/${metrics.total}`;
  const topThree = `${metrics.topThreeHits}/${metrics.total}`;
  t.diagnostic(`Held-out Top-1 ${topOne}; Top-3 ${topThree}`);
  if (metrics.topOneRate < TARGET_TOP_ONE || metrics.topThreeRate < TARGET_TOP_THREE) {
    t.diagnostic("Held-out acceptance target remains unmet; cases are retained without query-specific tuning.");
  }
  assert.ok(metrics.topOneHits <= metrics.topThreeHits);
  assert.equal(metrics.misses.length, metrics.total - metrics.topOneHits);
});

module.exports = {
  HELDOUT_CASES,
  evaluateHeldout
};
