"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const petApi = require("./agent-pet");

const directory = __dirname;
const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
const source = fs.readFileSync(path.join(directory, "agent-pet.js"), "utf8");
const mascotPath = path.join(directory, "assets", "kernel-buddy.png");

class FakeTarget {
  constructor(id, document) {
    this.id = id;
    this.ownerDocument = document;
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }

  append(...children) { this.children.push(...children); }
  contains(target) { return this === target || this.children.some((child) => child.contains(target)); }
  focus() { this.ownerDocument.activeElement = this; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) { return selector === ".agent-pet-state" ? this.stateLabel : null; }
}

class FakeDocument extends FakeTarget {
  constructor() {
    super("document", null);
    this.ownerDocument = this;
    this.activeElement = null;
    this.elements = new Map();
  }

  register(id) {
    const element = new FakeTarget(id, this);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id) { return this.elements.get(id) || null; }
  querySelector(selector) { return selector === ".agent-pet" ? this.pet : null; }
}

function createHarness(options = {}) {
  const document = new FakeDocument();
  const pet = document.register("pet");
  const panel = document.register("agent-mini-panel");
  const trigger = document.register("kernel-buddy");
  const close = document.register("agent-mini-close");
  const form = document.register("agent-mini-form");
  const message = document.register("agent-mini-message");
  const status = document.register("agent-mini-status");
  const connection = document.register("connection-status");
  const statusChip = document.register("status-chip");
  const stateLabel = document.register("pet-state-label");
  const outside = document.register("outside");
  document.pet = pet;
  pet.stateLabel = stateLabel;
  pet.append(panel, trigger);
  panel.append(close, form);
  form.append(message, status);
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  connection.textContent = options.connectionText || "实时连接：正在跟踪 Git 分支与 QEMU";
  statusChip.textContent = options.statusText || "知识预览";
  statusChip.dataset.status = options.statusData || "active";

  const order = [];
  const navigation = [];
  const storage = {};
  const entryState = {
    savePendingPrompt(_storage, prompt) {
      order.push(`save:${prompt}`);
      return options.saveSucceeds !== false;
    }
  };
  const client = {
    validateAgentMessage(value) {
      const prompt = String(value).trim();
      if (!prompt) throw Object.assign(new Error("message_required"), { code: "message_required" });
      return prompt;
    },
    agentErrorMessage() { return "请输入问题"; }
  };
  let observer;
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
  }
  form.requestSubmit = () => form.dispatch("submit");

  const controller = petApi.createPetController({
    document,
    entryState,
    client,
    sessionStore: () => storage,
    location: { assign(url) { order.push(`navigate:${url}`); navigation.push(url); } },
    requestAnimationFrame: (callback) => callback(),
    MutationObserver: FakeMutationObserver
  });

  return { controller, document, pet, panel, trigger, close, form, message, status, connection, statusChip, outside, order, navigation, observer };
}

test("experiment page exposes an accessible Kernel Buddy entry", () => {
  assert.match(html, /id="kernel-buddy"[^>]+aria-controls="agent-mini-panel"/);
  assert.match(html, /id="agent-mini-message"[^>]+maxlength="4000"/);
  assert.match(html, /id="agent-full-page-link"[^>]+href="agent\.html"/);
  assert.match(html, /assets\/kernel-buddy\.png/);
});

test("trigger toggles the panel, aria state, focus, and open visual state", () => {
  const harness = createHarness();
  harness.trigger.dispatch("click");
  assert.equal(harness.panel.hidden, false);
  assert.equal(harness.trigger.getAttribute("aria-expanded"), "true");
  assert.equal(harness.document.activeElement, harness.message);
  assert.equal(harness.pet.getAttribute("data-pet-state"), "open");

  harness.trigger.dispatch("click");
  assert.equal(harness.panel.hidden, true);
  assert.equal(harness.trigger.getAttribute("aria-expanded"), "false");
  assert.equal(harness.pet.getAttribute("data-pet-state"), "idle");
});

test("outside pointer closes without stealing focus while inside pointers stay open", () => {
  const harness = createHarness();
  harness.trigger.dispatch("click");
  harness.document.dispatch("pointerdown", { target: harness.message });
  assert.equal(harness.panel.hidden, false);
  harness.document.dispatch("pointerdown", { target: harness.trigger });
  assert.equal(harness.panel.hidden, false);

  harness.document.dispatch("pointerdown", { target: harness.outside });
  assert.equal(harness.panel.hidden, true);
  assert.notEqual(harness.document.activeElement, harness.trigger);
});

test("Escape closes the panel and restores focus to the trigger", () => {
  const harness = createHarness();
  harness.trigger.dispatch("click");
  harness.panel.dispatch("keydown", { key: "Escape" });
  assert.equal(harness.panel.hidden, true);
  assert.equal(harness.document.activeElement, harness.trigger);
});

test("storage failure preserves the prompt and does not navigate", () => {
  const harness = createHarness({ saveSucceeds: false });
  harness.message.value = "  TrapFrame 为什么要保存 sepc？  ";
  harness.form.dispatch("submit");
  assert.equal(harness.message.value, "  TrapFrame 为什么要保存 sepc？  ");
  assert.deepEqual(harness.navigation, []);
  assert.equal(harness.status.dataset.status, "error");
  assert.match(harness.status.textContent, /打开完整助教/);
});

test("successful handoff saves before navigation", () => {
  const harness = createHarness();
  harness.message.value = "  为什么需要刷新 TLB？  ";
  harness.form.dispatch("submit");
  assert.deepEqual(harness.order, ["save:为什么需要刷新 TLB？", "navigate:agent.html"]);
});

test("Ctrl or Meta Enter submits outside IME composition", () => {
  const harness = createHarness();
  harness.message.value = "解释页表切换";
  harness.message.dispatch("keydown", { key: "Enter", ctrlKey: true, metaKey: false, isComposing: true });
  assert.deepEqual(harness.navigation, []);
  harness.message.dispatch("keydown", { key: "Enter", ctrlKey: false, metaKey: true, isComposing: false });
  assert.deepEqual(harness.navigation, ["agent.html"]);
});

test("open visual state preserves the latest runtime evidence until close", () => {
  const harness = createHarness();
  assert.equal(harness.pet.getAttribute("data-pet-state"), "idle", "active course stage is not a running kernel");
  harness.trigger.dispatch("click");
  harness.statusChip.dataset.status = "running";
  harness.statusChip.textContent = "运行中";
  harness.observer.callback();
  assert.equal(harness.pet.getAttribute("data-pet-state"), "open");
  harness.trigger.dispatch("click");
  assert.equal(harness.pet.getAttribute("data-pet-state"), "running");

  harness.connection.textContent = "实时连接已断开：保留手动推演";
  harness.observer.callback();
  assert.equal(harness.pet.getAttribute("data-pet-state"), "error");
});

test("state classifier uses the existing bridge failure vocabulary", () => {
  assert.equal(petApi.classifyPetState({ statusData: "active" }), "idle");
  assert.equal(petApi.classifyPetState({ statusData: "running" }), "running");
  for (const connectionText of [
    "本地桥接器不可用：仍可手动推演",
    "本地桥接器暂不可用",
    "实时连接已断开：保留手动推演",
    "收到无法识别的本地事件",
    "未连接本地桥接器"
  ]) {
    assert.equal(petApi.classifyPetState({ connectionText }), "error", connectionText);
  }
});

test("mini controller contains no direct model request path", () => {
  assert.doesNotMatch(source, /fetch\(|requestAgent\(/);
});

test("mascot is a transparent PNG sized for a crisp compact entry", () => {
  assert.equal(fs.existsSync(mascotPath), true);
  const png = fs.readFileSync(mascotPath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.readUInt32BE(16) >= 256);
  assert.ok(png.readUInt32BE(20) >= 256);
  assert.ok([4, 6].includes(png[25]), "PNG must include an alpha channel");
});
