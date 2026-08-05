"use strict";

/**
 * Stable event and branch protocol shared by the Linux bridge and the browser.
 *
 * Kernel branches do not need browser-specific telemetry. The bridge accepts
 * both explicit `[OS_DEMO]` markers and the stable console markers already
 * emitted by starter and solution branches, then normalizes both forms to the
 * same versioned event shape.
 */

const EVENT_PROTOCOL = "os-demo.event/v1";
const EVENT_STATUSES = new Set(["running", "todo", "pass", "fail"]);
const EVENT_SOURCES = new Set(["tagged", "console", "lifecycle"]);

const STAGE_INDEX = Object.freeze({
  p0: 0,
  lab1: 1,
  lab2: 2,
  lab3: 3,
  lab4: 4,
  lab5: 5,
  lab6: 6,
  lab7: 7
});

const branchCatalog = {
  "p0-minimal-qemu-baseline": {
    lab: "p0",
    stageIndex: 0,
    variant: "baseline",
    variantLabel: "运行基线"
  },
  main: {
    lab: "lab7",
    stageIndex: 7,
    variant: "complete",
    variantLabel: "完整成果"
  },
  "interactive-demo-learning-map": {
    lab: "lab7",
    stageIndex: 7,
    variant: "demo",
    variantLabel: "可视化开发"
  }
};

for (let labNumber = 1; labNumber <= 7; labNumber += 1) {
  for (const variant of ["starter", "solution"]) {
    branchCatalog[`lab${labNumber}-${variant}`] = {
      lab: `lab${labNumber}`,
      stageIndex: labNumber,
      variant,
      variantLabel: variant === "starter" ? "学生起点" : "教师参考"
    };
  }
}

for (const value of Object.values(branchCatalog)) Object.freeze(value);
const BRANCH_CATALOG = Object.freeze(branchCatalog);
const EXPECTED_BRANCHES = Object.freeze(Object.keys(BRANCH_CATALOG));

function normalizeBranchName(branch) {
  return String(branch || "unknown")
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/(?:origin|gitlab)\//, "")
    .replace(/^remotes\/(?:origin|gitlab)\//, "")
    .replace(/^(?:origin|gitlab)\//, "");
}

function parseBranchContext(branch) {
  const name = normalizeBranchName(branch);
  const known = BRANCH_CATALOG[name];
  if (known) {
    return {
      branch: name,
      ...known,
      expectedBranch: true
    };
  }

  return {
    branch: name,
    lab: null,
    stageIndex: null,
    variant: "custom",
    variantLabel: "自定义分支",
    expectedBranch: false
  };
}

function normalizeTeachingEvent(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const lab = String(candidate.lab || "").toLowerCase();
  const step = String(candidate.step || "").toLowerCase();
  const status = String(candidate.status || "").toLowerCase();
  const source = String(candidate.source || "console").toLowerCase();

  if (!Object.hasOwn(STAGE_INDEX, lab)) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(step)) return null;
  if (!EVENT_STATUSES.has(status) || !EVENT_SOURCES.has(source)) return null;

  return {
    protocol: EVENT_PROTOCOL,
    lab,
    step,
    status,
    detail: String(candidate.detail || step).slice(0, 500),
    source
  };
}

function event(lab, step, status, detail, source = "console") {
  return normalizeTeachingEvent({ lab, step, status, detail, source });
}

const PROCESS_RULES = [
  [/^\[P0\]\s+PASS$/i, () => event("p0", "pass", "pass", "最小内核已在 QEMU/OpenSBI 中完成启动")],

  [/^\[Lab1\]\s+start$/i, () => event("lab1", "start", "running", "Lab1 启动路径开始")],
  [/^\[Lab1\]\s+console (?:is available|ready)$/i, () => event("lab1", "console-available", "running", "SBI 控制台已经可用")],

  [/^\[Lab2\]\s+trap entry installed$/i, () => event("lab2", "stvec-installed", "running", "stvec 已指向 S-mode trap 入口")],
  [/^\[Lab2\]\s+triggering breakpoint exception$/i, () => event("lab2", "breakpoint-triggered", "running", "ebreak 已触发 breakpoint 异常")],
  [/^\[Lab2\]\s+trap: breakpoint exception$/i, () => event("lab2", "breakpoint-decoded", "running", "scause 已被识别为 breakpoint")],
  [/^\[Lab2\]\s+breakpoint handled$/i, () => event("lab2", "breakpoint-handled", "running", "sepc 已推进，准备 sret")],
  [/^\[Lab2\]\s+trap starter: stvec is not configured yet$/i, () => event("lab2", "stvec-missing", "todo", "starter 尚未安装 stvec")],
  [/^\[Lab2\]\s+trap starter: demo exception is not triggered yet$/i, () => event("lab2", "breakpoint-missing", "todo", "starter 尚未触发演示异常")],

  [/^\[Lab3\]\s+frame allocator ready$/i, () => event("lab3", "allocator-ready", "running", "物理页分配器已经初始化")],

  [/^\[Lab4\]\s+allocator ready$/i, () => event("lab4", "allocator-ready", "running", "Lab3 页帧分配器可供页表使用")],
  [/^\[Lab4\]\s+root page table allocated$/i, () => event("lab4", "root-page-table", "running", "根页表页已分配")],
  [/^\[Lab4\]\s+text mapped$/i, () => event("lab4", "text-mapped", "running", ".text 已建立 R-X 映射")],
  [/^\[Lab4\]\s+rodata mapped$/i, () => event("lab4", "rodata-mapped", "running", ".rodata 已建立 R-- 映射")],
  [/^\[Lab4\]\s+data mapped$/i, () => event("lab4", "data-mapped", "running", ".data 已建立 RW- 映射")],
  [/^\[Lab4\]\s+bss mapped$/i, () => event("lab4", "bss-mapped", "running", ".bss 与启动栈已建立 RW- 映射")],
  [/^\[Lab4\]\s+user pages mapped$/i, () => event("lab4", "user-pages-mapped", "running", "用户代码页与用户栈页已经映射")],
  [/^\[Lab4\]\s+page table built$/i, () => event("lab4", "page-table-built", "running", "三级页表结构已经完成")],
  [/^\[Lab4\]\s+satp activated$/i, () => event("lab4", "satp-activated", "running", "satp 已写入并刷新 TLB")],
  [/^\[Lab4\]\s+paging is active$/i, () => event("lab4", "paging-active", "running", "分页启用后内核仍可继续运行")],
  [/^\[Lab4\]\s+map\/translate test passed$/i, () => event("lab4", "translate-verified", "running", "映射与地址翻译已经验证")],

  [/^\[Lab5\]\s+scheduler initialized$/i, () => event("lab5", "scheduler-ready", "running", "任务表和调度器已经初始化")],
  [/^\[Lab5\]\s+task ([ABC]) step ([12])$/i, (match) => {
    const task = match[1].toLowerCase();
    return event("lab5", `task-${task}-step-${match[2]}`, "running", `任务 ${match[1]} 正在执行第 ${match[2]} 步`);
  }],
  [/^\[Lab5\]\s+scheduler finished$/i, () => event("lab5", "scheduler-finished", "running", "全部任务已经退出")],

  [/^\[Lab6\]\s+user runtime initialized$/i, () => event("lab6", "user-context-ready", "running", "用户入口、栈和权限上下文已经准备")],
  [/^\[Lab6\]\s+user program: hello$/i, () => event("lab6", "user-ecall", "running", "U-mode 程序已经通过 ecall 请求 write")],
  [/^\[Lab6\]\s+syscall write handled$/i, () => event("lab6", "console-write", "running", "S-mode 已完成 write 系统调用")],
  [/^\[Lab6\]\s+syscall yield handled$/i, () => event("lab6", "syscall-yield", "running", "S-mode 已完成 yield 系统调用")],
  [/^\[Lab6\]\s+syscall exit handled$/i, () => event("lab6", "user-exit", "running", "S-mode 已完成 exit 系统调用")],

  [/^\[Lab7\]\s+file opened$/i, () => event("lab7", "file-open", "running", "文件描述符已经分配")],
  [/^\[Lab7\]\s+write\/read verified$/i, () => event("lab7", "file-verified", "running", "写入与读回的用户字节一致")]
];

function parseTaggedTelemetry(clean) {
  if (!/^\[OS_DEMO\]\s+/i.test(clean)) return null;
  const fields = {};
  for (const token of clean.replace(/^\[OS_DEMO\]\s+/i, "").split(/\s+/)) {
    const splitAt = token.indexOf("=");
    if (splitAt <= 0) continue;
    fields[token.slice(0, splitAt).toLowerCase()] = token.slice(splitAt + 1);
  }
  if (!fields.lab || !fields.step || (fields.v && fields.v !== "1")) return null;
  const step = fields.step.toLowerCase();
  const status = fields.status || (step === "pass" ? "pass" : step === "panic" ? "fail" : "running");
  return event(fields.lab, step, status, "内核发出的显式教学遥测", "tagged");
}

function parseTaskMarker(clean) {
  const match = clean.match(/^\[Lab([1-7])-T([1-3])\]\s+(.+)$/i);
  if (!match) return null;

  const lab = `lab${match[1]}`;
  const task = Number(match[2]);
  const message = match[3].trim();
  if (/^PASS$/i.test(message)) {
    return event(lab, `task-${task}-pass`, "pass", `任务 ${task} 已通过阶段检查`);
  }
  if (/^TODO(?::|$)/i.test(message)) {
    return event(lab, `task-${task}-todo`, "todo", message.replace(/^TODO:\s*/i, ""));
  }
  return event(lab, `task-${task}-evidence`, "running", message);
}

function parseGenericLabMarker(clean) {
  const match = clean.match(/^\[Lab([1-7])\]\s+(.+)$/i);
  if (!match) return null;

  const lab = `lab${match[1]}`;
  const message = match[2].trim();
  if (/^start$/i.test(message)) return event(lab, "start", "running", `${lab.toUpperCase()} 开始运行`);
  if (/^PASS$/i.test(message)) return event(lab, "pass", "pass", `${lab.toUpperCase()} 已通过`);
  if (/^TODO(?::|$)/i.test(message)) {
    return event(lab, "todo", "todo", message.replace(/^TODO:\s*/i, ""));
  }
  if (/^FAIL(?::|$)/i.test(message)) {
    return event(lab, "fail", "fail", message.replace(/^FAIL:\s*/i, ""));
  }
  if (/kernel panic/i.test(message)) return event(lab, "panic", "fail", message);
  return null;
}

function parseKernelLine(line) {
  const clean = String(line || "").replace(/\r/g, "").trim();
  if (!clean) return null;

  const tagged = parseTaggedTelemetry(clean);
  if (tagged) return tagged;

  for (const [pattern, factory] of PROCESS_RULES) {
    const match = clean.match(pattern);
    if (match) return factory(match);
  }

  return parseTaskMarker(clean) || parseGenericLabMarker(clean);
}

module.exports = {
  BRANCH_CATALOG,
  EVENT_PROTOCOL,
  EXPECTED_BRANCHES,
  STAGE_INDEX,
  normalizeBranchName,
  normalizeTeachingEvent,
  parseBranchContext,
  parseKernelLine
};
