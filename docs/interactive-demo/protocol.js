"use strict";

/**
 * Shared protocol helpers for the live teaching view.
 *
 * The teaching branches intentionally do not depend on browser telemetry.
 * Therefore the bridge accepts both explicit `[OS_DEMO]` markers from `main`
 * and the stable human-readable markers already emitted by every starter and
 * solution branch.
 */

const EXPECTED_BRANCHES = [
  "p0-minimal-qemu-baseline",
  "lab1-starter",
  "lab1-solution",
  "lab2-starter",
  "lab2-solution",
  "lab3-starter",
  "lab3-solution",
  "lab4-starter",
  "lab4-solution",
  "lab5-starter",
  "lab5-solution",
  "lab6-starter",
  "lab6-solution",
  "lab7-starter",
  "lab7-solution",
  "main"
];

const STAGE_INDEX = {
  p0: 0,
  lab1: 1,
  lab2: 2,
  lab3: 3,
  lab4: 4,
  lab5: 5,
  lab6: 6,
  lab7: 7
};

function normalizeBranchName(branch) {
  return String(branch || "unknown")
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^remotes\/origin\//, "")
    .replace(/^origin\//, "");
}

function parseBranchContext(branch) {
  const name = normalizeBranchName(branch);

  if (name === "main") {
    return {
      branch: name,
      lab: "lab7",
      stageIndex: 7,
      variant: "complete",
      variantLabel: "完整成果",
      expectedBranch: true
    };
  }

  if (name === "p0-minimal-qemu-baseline") {
    return {
      branch: name,
      lab: "p0",
      stageIndex: 0,
      variant: "baseline",
      variantLabel: "运行基线",
      expectedBranch: true
    };
  }

  const match = name.match(/^lab([1-7])-(starter|solution)$/);
  if (match) {
    const labNumber = Number(match[1]);
    const variant = match[2];
    return {
      branch: name,
      lab: `lab${labNumber}`,
      stageIndex: labNumber,
      variant,
      variantLabel: variant === "starter" ? "学生起点" : "教师参考",
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

function event(lab, step, status, detail, source = "console") {
  return { lab, step, status, detail, source };
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
  const match = clean.match(/^\[OS_DEMO\]\s+lab=([a-z0-9-]+)\s+step=([a-z0-9-]+)$/i);
  if (!match) return null;
  const lab = match[1].toLowerCase();
  const step = match[2].toLowerCase();
  const status = step === "pass" ? "pass" : step === "panic" ? "fail" : "running";
  return event(lab, step, status, "内核发出的显式教学遥测", "tagged");
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
  EXPECTED_BRANCHES,
  STAGE_INDEX,
  normalizeBranchName,
  parseBranchContext,
  parseKernelLine
};
