(() => {
  "use strict";

  const STATE_MODEL_VERSION = 1;
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const INSUFFICIENT_TEXT = "没有足够运行证据";
  const VALID_LABS = new Set(["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  const VALID_STATUSES = new Set(["running", "todo", "pass", "fail"]);

  const LAB_SCHEMAS = Object.freeze({
    p0: [],
    lab1: [
      ["outputChain", "输出调用链"],
      ["sbiCall", "SBI 调用"],
      ["consoleState", "控制台状态"]
    ],
    lab2: [
      ["scause", "scause"],
      ["sepc", "sepc"],
      ["stval", "stval"],
      ["trapPhase", "Trap 阶段"]
    ],
    lab3: [
      ["freeFrames", "空闲页帧"],
      ["allocatedFrames", "已分配页帧"],
      ["recycleState", "回收状态"]
    ],
    lab4: [
      ["satp", "satp"],
      ["mappings", "页表映射"],
      ["pteFlags", "PTE R/W/X/U"]
    ],
    lab5: [
      ["currentTask", "当前任务"],
      ["readyQueue", "就绪队列"],
      ["switchCount", "已观察任务切换次数"]
    ],
    lab6: [
      ["privilege", "当前特权级"],
      ["syscallKind", "系统调用种类"],
      ["syscallNumber", "系统调用号"],
      ["arguments", "系统调用参数"],
      ["returnValue", "系统调用返回值"]
    ],
    lab7: [
      ["fileDescriptor", "文件描述符"],
      ["offset", "文件偏移"],
      ["fileSize", "文件大小"],
      ["ioState", "读写状态"]
    ]
  });

  function text(value, limit = 500) {
    return String(value ?? "").trim().slice(0, limit);
  }

  function createField(key, label) {
    return {
      key,
      label,
      status: "insufficient",
      value: INSUFFICIENT_TEXT,
      evidence: []
    };
  }

  function createState(lab, options = {}) {
    const fields = {
      completion: createField("completion", "实验完成状态")
    };
    for (const [key, label] of LAB_SCHEMAS[lab] || []) fields[key] = createField(key, label);
    return {
      version: STATE_MODEL_VERSION,
      protocol: EVENT_PROTOCOL,
      lab: VALID_LABS.has(lab) ? lab : null,
      variant: text(options.variant, 40) || "custom",
      completed: null,
      eventCount: 0,
      ignoredCount: 0,
      duplicateCount: 0,
      lastEvent: null,
      fields
    };
  }

  function normalizeEvent(candidate, index) {
    if (!candidate || typeof candidate !== "object") return null;
    const protocol = text(candidate.protocol, 40);
    const lab = text(candidate.lab, 20).toLowerCase();
    const step = text(candidate.step, 80).toLowerCase();
    const status = text(candidate.status, 20).toLowerCase();
    if (protocol !== EVENT_PROTOCOL) return null;
    if (!VALID_LABS.has(lab)) return null;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(step)) return null;
    if (!VALID_STATUSES.has(status)) return null;
    const sequence = Number(candidate.sequence);
    const timestamp = Number(candidate.timestamp);
    return {
      protocol,
      lab,
      step,
      status,
      detail: text(candidate.detail || candidate.raw || step, 500),
      source: text(candidate.source, 20) || "console",
      runId: text(candidate.runId, 120),
      sequence: Number.isFinite(sequence) && sequence > 0 ? sequence : 0,
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
      inputIndex: index
    };
  }

  function eventOrder(left, right) {
    if (left.sequence && right.sequence) return left.sequence - right.sequence || left.inputIndex - right.inputIndex;
    if (left.timestamp && right.timestamp) return left.timestamp - right.timestamp || left.inputIndex - right.inputIndex;
    if (left.sequence !== right.sequence) return left.sequence ? -1 : 1;
    if (left.timestamp !== right.timestamp) return left.timestamp ? -1 : 1;
    return left.inputIndex - right.inputIndex;
  }

  function duplicateKey(event) {
    if (event.sequence) return `sequence:${event.runId || "run"}:${event.sequence}`;
    if (event.timestamp) return `timestamp:${event.lab}:${event.step}:${event.status}:${event.timestamp}`;
    return "";
  }

  function canonicalEvents(events, lab) {
    const normalized = [];
    let ignoredCount = 0;
    for (const [index, candidate] of Array.from(events || []).entries()) {
      const event = normalizeEvent(candidate, index);
      if (!event || (lab && event.lab !== lab)) {
        ignoredCount += 1;
        continue;
      }
      normalized.push(event);
    }
    normalized.sort(eventOrder);
    const seen = new Set();
    const unique = [];
    let duplicateCount = 0;
    for (const event of normalized) {
      const key = duplicateKey(event);
      if (key && seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      if (key) seen.add(key);
      unique.push(event);
    }
    return { events: unique, ignoredCount, duplicateCount };
  }

  function evidenceKey(event) {
    const suffix = event.sequence ? `#${event.sequence}` : event.timestamp ? `@${event.timestamp}` : "";
    return `${event.lab}:${event.step}${suffix}`;
  }

  function setField(state, key, value, status, event) {
    const field = state.fields[key];
    if (!field) return;
    field.status = status;
    field.value = text(value, 500) || INSUFFICIENT_TEXT;
    if (event) {
      const evidence = evidenceKey(event);
      if (!field.evidence.includes(evidence)) field.evidence.push(evidence);
    }
  }

  function observedChain(runtime, state, event, label) {
    if (!runtime.outputChain.includes(label)) runtime.outputChain.push(label);
    setField(state, "outputChain", runtime.outputChain.join(" → "), "known", event);
  }

  function applyLab1(state, event, runtime) {
    switch (event.step) {
      case "print-line":
        observedChain(runtime, state, event, "print_line");
        return true;
      case "sbi-ecall":
        observedChain(runtime, state, event, "SBI ecall");
        setField(state, "sbiCall", "已观察 console_putchar ecall", "known", event);
        return true;
      case "opensbi-console":
        observedChain(runtime, state, event, "OpenSBI console");
        return true;
      case "uart-write":
        observedChain(runtime, state, event, "UART");
        return true;
      case "console-available":
        if (runtime.outputChain.length === 0) {
          setField(state, "outputChain", "控制台已可用；中间调用未逐项记录", "partial", event);
        }
        setField(state, "consoleState", "可用", "known", event);
        return true;
      default:
        return false;
    }
  }

  function applyLab2(state, event) {
    switch (event.step) {
      case "stvec-installed":
        setField(state, "trapPhase", "stvec 已安装", "known", event);
        return true;
      case "breakpoint-triggered":
        setField(state, "trapPhase", "breakpoint 已触发", "known", event);
        return true;
      case "trap-enter":
        setField(state, "trapPhase", "已进入 Trap 并保存现场", "known", event);
        return true;
      case "scause-read":
        setField(state, "scause", "已读取；具体值没有足够运行证据", "partial", event);
        setField(state, "trapPhase", "正在分析异常原因", "known", event);
        return true;
      case "breakpoint-decoded":
        setField(state, "scause", "breakpoint（异常码 3）", "known", event);
        setField(state, "trapPhase", "已识别 breakpoint", "known", event);
        return true;
      case "sepc-advanced":
      case "breakpoint-handled":
        setField(state, "sepc", "已相对推进 4 字节；绝对地址未知", "partial", event);
        setField(state, "trapPhase", "准备恢复现场并 sret", "known", event);
        return true;
      case "stvec-missing":
        setField(state, "trapPhase", "stvec 尚未安装", "known", event);
        return true;
      case "breakpoint-missing":
        setField(state, "trapPhase", "breakpoint 尚未触发", "known", event);
        return true;
      default:
        return false;
    }
  }

  function applyLab3(state, event) {
    switch (event.step) {
      case "allocator-ready":
        setField(state, "freeFrames", "分配区间已初始化；精确数量没有足够运行证据", "partial", event);
        setField(state, "allocatedFrames", "尚无精确计数证据", "insufficient", event);
        setField(state, "recycleState", "回收栈已初始化", "known", event);
        return true;
      case "frame-allocated":
        setField(state, "allocatedFrames", "已观察到页帧分配；精确数量未知", "partial", event);
        setField(state, "freeFrames", "发生减少；精确数量没有足够运行证据", "partial", event);
        return true;
      case "frame-freed":
        setField(state, "allocatedFrames", "发生释放；剩余数量没有足够运行证据", "partial", event);
        setField(state, "recycleState", "已观察到页帧进入 recycled", "known", event);
        return true;
      case "frame-reused":
        setField(state, "recycleState", "已观察到回收页优先复用", "known", event);
        return true;
      case "frame-checks-start":
        setField(state, "recycleState", "正在验证分配、释放与复用", "known", event);
        return true;
      case "frame-checks-pass":
        setField(state, "allocatedFrames", "分配检查通过；最终数量没有足够运行证据", "partial", event);
        setField(state, "recycleState", "释放与复用检查通过", "known", event);
        return true;
      default:
        return false;
    }
  }

  function renderMappings(runtime) {
    return [...runtime.mappings.entries()].map(([segment, flags]) => `${segment}=${flags}`).join("；");
  }

  function recordMapping(state, event, runtime, segment, flags) {
    runtime.mappings.set(segment, flags);
    setField(state, "mappings", renderMappings(runtime), "known", event);
    setField(state, "pteFlags", renderMappings(runtime), flags.includes("细分未知") ? "partial" : "known", event);
  }

  function applyLab4(state, event, runtime) {
    switch (event.step) {
      case "allocator-ready":
        setField(state, "mappings", "页表页帧来源已准备；尚无映射证据", "partial", event);
        return true;
      case "root-page-table":
        setField(state, "mappings", "根页表已分配；根 PPN 没有足够运行证据", "partial", event);
        return true;
      case "page-table-built":
        setField(state, "mappings", runtime.mappings.size ? renderMappings(runtime) : "三级页表已建立；具体映射未逐项记录", runtime.mappings.size ? "known" : "partial", event);
        return true;
      case "pte-written":
        setField(state, "pteFlags", "已写入叶子 PTE；具体 R/W/X/U 没有足够运行证据", "partial", event);
        return true;
      case "text-mapped":
        recordMapping(state, event, runtime, ".text", "R-X,U=0");
        return true;
      case "rodata-mapped":
        recordMapping(state, event, runtime, ".rodata", "R--,U=0");
        return true;
      case "data-mapped":
        recordMapping(state, event, runtime, ".data", "RW-,U=0");
        return true;
      case "bss-mapped":
        recordMapping(state, event, runtime, ".bss/栈", "RW-,U=0");
        return true;
      case "user-pages-mapped":
        recordMapping(state, event, runtime, "用户页", "U=1,R/W/X细分未知");
        return true;
      case "satp-activated":
        setField(state, "satp", "Sv39 已激活；具体 satp 数值没有足够运行证据", "partial", event);
        return true;
      case "paging-active":
        setField(state, "satp", "Sv39 已激活且内核继续运行；具体数值未知", "partial", event);
        return true;
      case "translate-verified":
        setField(state, "mappings", runtime.mappings.size ? `${renderMappings(runtime)}；地址翻译已验证` : "地址翻译已验证；具体映射未逐项记录", runtime.mappings.size ? "known" : "partial", event);
        return true;
      default:
        return false;
    }
  }

  function applyLab5(state, event, runtime) {
    if (event.step === "task-created") {
      setField(state, "currentTask", "调度器上下文", "known", event);
      setField(state, "readyQueue", "已观察到任务进入 Ready；完整队列没有足够运行证据", "partial", event);
      return true;
    }
    if (event.step === "scheduler-ready") {
      setField(state, "currentTask", "调度器上下文", "known", event);
      setField(state, "readyQueue", "A → B → C", "known", event);
      setField(state, "switchCount", "0 次", "known", event);
      return true;
    }
    const task = event.step.match(/^task-([abc])-step-[12]$/);
    if (task) {
      const currentTask = task[1].toUpperCase();
      if (runtime.previousTask && runtime.previousTask !== currentTask) runtime.taskTransitionCount += 1;
      runtime.previousTask = currentTask;
      setField(state, "currentTask", currentTask, "known", event);
      setField(state, "readyQueue", "运行中队列持续变化；完整顺序没有足够运行证据", "partial", event);
      const observedSwitches = runtime.explicitSwitchCount || runtime.taskTransitionCount;
      const source = runtime.explicitSwitchCount ? "显式 context-switched 事件" : "相邻任务运行事件";
      setField(state, "switchCount", `${observedSwitches} 次（按${source}计算）`, "known", event);
      return true;
    }
    if (event.step === "yield-called") {
      setField(state, "currentTask", "当前任务已主动让出；任务身份未随事件提供", "partial", event);
      setField(state, "readyQueue", "已返回 Ready；完整队列没有足够运行证据", "partial", event);
      return true;
    }
    if (event.step === "context-switched") {
      runtime.explicitSwitchCount += 1;
      setField(state, "currentTask", "已切换；目标任务没有足够运行证据", "partial", event);
      setField(state, "switchCount", `${runtime.explicitSwitchCount} 次（按显式 context-switched 事件计算）`, "known", event);
      return true;
    }
    if (event.step === "scheduler-finished") {
      setField(state, "currentTask", "无（所有任务已退出）", "known", event);
      setField(state, "readyQueue", "空", "known", event);
      const observedSwitches = runtime.explicitSwitchCount || runtime.taskTransitionCount;
      const source = runtime.explicitSwitchCount ? "显式 context-switched 事件" : "相邻任务运行事件";
      setField(state, "switchCount", `${observedSwitches} 次（按${source}计算）`, "known", event);
      return true;
    }
    return false;
  }

  function applyLab6(state, event) {
    switch (event.step) {
      case "user-context-ready":
        setField(state, "privilege", "S-mode（正在准备用户上下文）", "known", event);
        return true;
      case "entering-user":
        setField(state, "privilege", "S-mode → U-mode；是否完成切换需后续证据", "partial", event);
        return true;
      case "user-mode-entered":
        setField(state, "privilege", "U-mode", "known", event);
        return true;
      case "user-ecall":
        setField(state, "privilege", "S-mode（处理 U-mode ecall）", "known", event);
        setField(state, "syscallKind", "ecall 已进入；种类尚未确定", "partial", event);
        return true;
      case "syscall-dispatched":
        setField(state, "syscallKind", "已分发；具体种类没有足够运行证据", "partial", event);
        return true;
      case "console-write":
        setField(state, "syscallKind", "write", "known", event);
        setField(state, "returnValue", "调用已处理；具体返回值没有足够运行证据", "partial", event);
        return true;
      case "syscall-yield":
        setField(state, "syscallKind", "yield", "known", event);
        setField(state, "returnValue", "调用已处理；具体返回值没有足够运行证据", "partial", event);
        return true;
      case "user-return":
        setField(state, "privilege", "U-mode", "known", event);
        return true;
      case "user-exit":
        setField(state, "privilege", "S-mode（处理 exit 后结束）", "known", event);
        setField(state, "syscallKind", "exit", "known", event);
        setField(state, "returnValue", "程序已结束；具体返回值没有足够运行证据", "partial", event);
        return true;
      default:
        return false;
    }
  }

  function applyLab7(state, event) {
    switch (event.step) {
      case "start":
        setField(state, "ioState", "文件实验开始", "known", event);
        return false;
      case "file-open":
        setField(state, "fileDescriptor", "已打开；fd 编号没有足够运行证据", "partial", event);
        setField(state, "offset", "已建立初始偏移；具体数值没有足够运行证据", "partial", event);
        setField(state, "ioState", "文件已打开", "known", event);
        return true;
      case "file-write":
        setField(state, "offset", "写入后已推进；具体数值没有足够运行证据", "partial", event);
        setField(state, "fileSize", "写入后发生变化；具体大小没有足够运行证据", "partial", event);
        setField(state, "ioState", "写入完成", "known", event);
        return true;
      case "file-read":
        setField(state, "offset", "读取后已推进；具体数值没有足够运行证据", "partial", event);
        setField(state, "ioState", "读取完成", "known", event);
        return true;
      case "file-close":
        setField(state, "fileDescriptor", "无有效 fd（已关闭）", "known", event);
        setField(state, "ioState", "文件已关闭", "known", event);
        return true;
      case "file-verified":
        setField(state, "fileSize", "内容已验证；具体大小没有足够运行证据", "partial", event);
        setField(state, "ioState", "写入与读回内容一致", "known", event);
        return true;
      default:
        return false;
    }
  }

  function applyEvent(state, event, runtime) {
    if (event.status === "todo") {
      runtime.todoSeen = true;
      runtime.todoEvent = event;
    }
    if (event.status === "fail") {
      runtime.failSeen = true;
      runtime.failEvent = event;
    }
    if (event.step === "pass" && event.status === "pass") {
      runtime.passSeen = true;
      runtime.passEvent = event;
    }

    let mechanismEvidence = false;
    if (event.lab === "p0" && event.step === "kernel-main") mechanismEvidence = true;
    else if (event.lab === "lab1") mechanismEvidence = applyLab1(state, event, runtime);
    else if (event.lab === "lab2") mechanismEvidence = applyLab2(state, event);
    else if (event.lab === "lab3") mechanismEvidence = applyLab3(state, event);
    else if (event.lab === "lab4") mechanismEvidence = applyLab4(state, event, runtime);
    else if (event.lab === "lab5") mechanismEvidence = applyLab5(state, event, runtime);
    else if (event.lab === "lab6") mechanismEvidence = applyLab6(state, event);
    else if (event.lab === "lab7") mechanismEvidence = applyLab7(state, event);

    if (/^task-[1-3]-(?:pass|evidence)$/.test(event.step)) mechanismEvidence = true;
    if (mechanismEvidence) runtime.mechanismEvidence += 1;
  }

  function finalizeCompletion(state, runtime) {
    if (runtime.failSeen) {
      state.completed = false;
      setField(state, "completion", "未完成（存在失败事件）", "known", runtime.failEvent);
      return;
    }
    if (runtime.todoSeen) {
      state.completed = false;
      setField(state, "completion", "未完成（停在 TODO）", "known", runtime.todoEvent);
      return;
    }
    if (runtime.passSeen && runtime.mechanismEvidence > 0) {
      state.completed = true;
      setField(state, "completion", "完成（PASS 且有过程事件证据）", "known", runtime.passEvent);
      return;
    }
    if (runtime.passSeen) {
      state.completed = null;
      setField(state, "completion", "出现 PASS，但没有足够过程运行证据", "partial", runtime.passEvent);
      return;
    }
    state.completed = null;
  }

  function computeState(events, options = {}) {
    const requestedLab = text(options.lab, 20).toLowerCase();
    const provisional = canonicalEvents(events, VALID_LABS.has(requestedLab) ? requestedLab : null);
    const lab = VALID_LABS.has(requestedLab) ? requestedLab : provisional.events[0]?.lab || null;
    const canonical = lab === requestedLab || !lab ? provisional : canonicalEvents(events, lab);
    const state = createState(lab, options);
    state.ignoredCount = canonical.ignoredCount;
    state.duplicateCount = canonical.duplicateCount;
    const runtime = {
      failSeen: false,
      failEvent: null,
      todoSeen: false,
      todoEvent: null,
      passSeen: false,
      passEvent: null,
      mechanismEvidence: 0,
      mappings: new Map(),
      outputChain: [],
      previousTask: null,
      explicitSwitchCount: 0,
      taskTransitionCount: 0
    };

    for (const event of canonical.events) {
      applyEvent(state, event, runtime);
      state.eventCount += 1;
      state.lastEvent = event;
    }
    finalizeCompletion(state, runtime);
    return state;
  }

  function createStateTracker(options = {}) {
    const events = [];
    return {
      apply(event) {
        events.push(event);
        return computeState(events, options);
      },
      reset() {
        events.length = 0;
        return computeState(events, options);
      },
      snapshot() {
        return computeState(events, options);
      }
    };
  }

  function formatField(field) {
    if (!field || field.status === "insufficient") return INSUFFICIENT_TEXT;
    return field.value || INSUFFICIENT_TEXT;
  }

  const api = {
    EVENT_PROTOCOL,
    INSUFFICIENT_TEXT,
    LAB_SCHEMAS,
    STATE_MODEL_VERSION,
    canonicalEvents,
    computeState,
    createStateTracker,
    formatField
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsStateModel = api;
})();
