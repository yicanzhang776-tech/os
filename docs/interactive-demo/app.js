(() => {
  "use strict";

  const stages = [
    {
      id: "p0",
      label: "P0",
      tab: "启动基线",
      title: "最小运行基线",
      summary: "QEMU 将内核交给 OpenSBI；OpenSBI 以 S-mode 进入内核。汇编入口 _start 建立启动栈，再跳转到 Rust 的 kernel_main。",
      concepts: ["裸机", "链接脚本", "启动栈", "S-mode"],
      links: [["boot.rs", "../../kernel/src/boot.rs"], ["linker.ld", "../../kernel/linker.ld"], ["main.rs", "../../kernel/src/main.rs"]],
      status: "S-mode 就绪",
      explanation: "先有可运行的最小链路，后续的 Trap、内存和调度器才有执行位置。_start 不做业务逻辑，只负责建立可靠的 Rust 运行现场。"
    },
    {
      id: "lab1",
      label: "Lab1",
      tab: "SBI 控制台",
      title: "一次 print 如何到达 QEMU 控制台",
      summary: "内核没有标准输出。console::print_line 逐字节调用 putchar，最终以 ecall 请求 OpenSBI 的控制台服务。",
      concepts: ["SBI", "ecall", "a0 / a7", "特权级服务"],
      links: [["console.rs", "../../kernel/src/console.rs"], ["sbi.rs", "../../kernel/src/sbi.rs"]],
      status: "等待 print",
      explanation: "字符放入 a0，SBI 扩展号放入 a7；ecall 从 S-mode 请求 M-mode 固件服务，固件再将字符交给 QEMU 模拟的串口。"
    },
    {
      id: "lab2",
      label: "Lab2",
      tab: "Trap 与异常",
      title: "Trap：中断执行流后，如何安全返回",
      summary: "内核把 __trap_entry 写入 stvec。ebreak 触发异常，汇编保存寄存器到 TrapFrame，再调用 Rust handler；处理后 sepc 前进并 sret 返回。",
      concepts: ["stvec", "scause", "sepc", "TrapFrame", "sret"],
      links: [["trap.rs", "../../kernel/src/trap.rs"]],
      status: "等待 ebreak",
      explanation: "Trap 会打断当前指令流。只有把通用寄存器与 CSR 状态完整保存，处理程序才能修改 sepc 后恢复原现场；对 ebreak 而言，sepc += 4 用来跳过已执行的异常指令。"
    },
    {
      id: "lab3",
      label: "Lab3",
      tab: "物理页帧",
      title: "物理内存：按页分配与回收",
      summary: "物理内存以 4 KiB 页帧为单位。分配器优先复用 recycled 栈中的已释放页，否则从 next 指向的未分配区域线性获取新页。",
      concepts: ["页帧", "4 KiB", "半开区间", "Double Free"],
      links: [["frame_allocator.rs", "../../kernel/src/memory/frame_allocator.rs"], ["address.rs", "../../kernel/src/memory/address.rs"]],
      status: "allocator ready",
      explanation: "内核镜像占据的页面必须保留。回收栈不仅节约页帧，也让实验可以直观看到释放后的页面被再次使用；重复释放会破坏这个不变量，因此必须拒绝。"
    },
    {
      id: "lab4",
      label: "Lab4",
      tab: "Sv39 页表",
      title: "Sv39：虚拟地址如何翻译为物理地址",
      summary: "Sv39 使用三级页表。内核为 text、rodata、data/bss 和用户页面设置不同权限，建立恒等映射后写入 satp 并刷新地址翻译。",
      concepts: ["VPN[2:0]", "PTE", "R/W/X/U", "satp", "TLB"],
      links: [["page_table.rs", "../../kernel/src/memory/page_table.rs"], ["virtual_address.rs", "../../kernel/src/memory/virtual_address.rs"]],
      status: "页表未激活",
      explanation: "启用分页前，当前运行的代码、数据和栈都必须已经可访问。教学版先采用 VA = PA 的恒等映射，把重点放在三级查表与页面权限，而不是高地址内核布局。"
    },
    {
      id: "lab5",
      label: "Lab5",
      tab: "协作式调度",
      title: "任务切换：主动让出 CPU",
      summary: "调度器使用固定任务表与静态栈。任务调用 yield_now 或 exit_current 后切回调度器；它按 Round-Robin 顺序选择下一个 Ready 任务。",
      concepts: ["Ready/Running/Exited", "Round-Robin", "上下文切换", "callee-saved"],
      links: [["task/mod.rs", "../../kernel/src/task/mod.rs"]],
      status: "3 个任务 Ready",
      explanation: "这是协作式、单核调度：没有时钟中断强制抢占。切换时只需保存 ra、sp、s0 到 s11，因为这些是 RISC-V 调用约定中的 callee-saved 寄存器。"
    },
    {
      id: "lab6",
      label: "Lab6",
      tab: "用户态与 syscall",
      title: "U-mode 与 S-mode 的受控往返",
      summary: "内核设置 sepc、清除 sstatus.SPP、设置 SPIE 与 sscratch，然后执行 sret 进入内置用户程序。用户通过 ecall 回到 Trap 路径请求服务。",
      concepts: ["U-mode", "SPP", "SPIE", "sscratch", "Syscall ABI"],
      links: [["user.rs", "../../kernel/src/user.rs"], ["syscall.rs", "../../kernel/src/syscall.rs"], ["trap.rs", "../../kernel/src/trap.rs"]],
      status: "准备进入 U-mode",
      explanation: "系统调用号在 a7，参数在 a0 到 a5，返回值放入 a0。特权级切换不是普通函数调用，而是由 sret、ecall、stvec 与 TrapFrame 协同完成的受控边界。"
    },
    {
      id: "lab7",
      label: "Lab7",
      tab: "内存文件系统",
      title: "从用户字节到 RAM 文件",
      summary: "用户程序通过 open、write、close、open、read、close 完成 LAB7 字符串的回环验证；内核的文件系统用 fd 表管理偏移，底层设备是固定 64 字节的 RamDevice。",
      concepts: ["ByteDevice", "文件描述符", "offset", "SUM", "用户缓冲区校验"],
      links: [["fs/mod.rs", "../../kernel/src/fs/mod.rs"], ["drivers/mod.rs", "../../kernel/src/drivers/mod.rs"], ["trap.rs", "../../kernel/src/trap.rs"]],
      status: "等待文件 I/O",
      explanation: "文件系统把整数 fd 映射到打开文件状态，每个 fd 都有独立 offset。内核读取用户缓冲区前检查其是否位于用户栈范围，并仅在复制期间临时打开 sstatus.SUM。"
    }
  ];

  const dom = {
    timeline: document.getElementById("timeline"),
    stageLabel: document.getElementById("stage-label"),
    stageTitle: document.getElementById("stage-title"),
    stageSummary: document.getElementById("stage-summary"),
    concepts: document.getElementById("concept-list"),
    links: document.getElementById("source-links"),
    executionHeading: document.getElementById("execution-heading"),
    status: document.getElementById("status-chip"),
    visual: document.getElementById("visual-area"),
    controls: document.getElementById("panel-controls"),
    explanation: document.getElementById("explanation"),
    connection: document.getElementById("connection-status"),
    lastEvent: document.getElementById("last-event"),
    feed: document.getElementById("runtime-feed"),
    previous: document.getElementById("previous-stage"),
    next: document.getElementById("next-stage"),
    auto: document.getElementById("auto-play")
  };

  const state = {
    stageIndex: 0,
    autoTimer: null,
    flowTimers: [],
    sbiStep: 0,
    trapStep: 0,
    frames: ["reserved", "reserved", "reserved", "free", "free", "free", "free", "free", "free", "free", "free", "free"],
    satpEnabled: false,
    schedulerStep: 0,
    fsStep: 0,
    syscallStep: 0,
    socket: null,
    live: false,
    recentEvents: []
  };

  const clearFlowTimers = () => {
    state.flowTimers.forEach(window.clearTimeout);
    state.flowTimers = [];
  };

  const setStatus = (text) => { dom.status.textContent = text; };

  const labIndex = Object.fromEntries(stages.map((stage, index) => [stage.id, index]));

  const humanEvent = (event) => {
    const stage = stages[labIndex[event.lab]];
    const lab = stage ? stage.label : event.lab;
    return `${lab} · ${event.step.replaceAll("-", " → ")}`;
  };

  const renderRuntimeFeed = () => {
    dom.feed.innerHTML = "";
    state.recentEvents.slice(0, 4).forEach((event) => {
      const item = document.createElement("li");
      item.textContent = `${event.sequence ? `#${event.sequence} ` : ""}${humanEvent(event)}`;
      dom.feed.appendChild(item);
    });
  };

  const recordRuntimeEvent = (event) => {
    state.recentEvents.unshift(event);
    state.recentEvents = state.recentEvents.slice(0, 4);
    dom.lastEvent.textContent = `最近事件：${humanEvent(event)}`;
    renderRuntimeFeed();
  };

  const setConnection = (text, connected) => {
    dom.connection.textContent = text;
    dom.connection.classList.toggle("connected", connected);
  };

  const stopAutoForLiveEvent = () => {
    if (!state.autoTimer) return;
    window.clearInterval(state.autoTimer);
    state.autoTimer = null;
    dom.auto.textContent = "自动演示";
    dom.auto.setAttribute("aria-pressed", "false");
  };

  const updateVisualStateFromEvent = (event) => {
    const step = event.step;
    if (event.lab === "lab1") state.sbiStep = 5;
    if (event.lab === "lab2") {
      state.trapStep = ({ "breakpoint-triggered": 0, "stvec-installed": 1, "breakpoint-handled": 3, pass: 5 })[step] ?? state.trapStep;
    }
    if (event.lab === "lab3" && step === "frame-checks-pass") {
      state.frames = state.frames.map((frame, index) => index < 3 ? frame : "allocated");
    }
    if (event.lab === "lab4" && ["satp-activated", "pass"].includes(step)) state.satpEnabled = true;
    if (event.lab === "lab5") {
      state.schedulerStep = ({
        "scheduler-ready": 0,
        "task-a-step-1": 0,
        "task-b-step-1": 1,
        "task-c-step-1": 2,
        "task-a-step-2": 3,
        "task-b-step-2": 4,
        "task-c-step-2": 5,
        pass: 6
      })[step] ?? state.schedulerStep;
    }
    if (event.lab === "lab6") {
      state.syscallStep = ({
        "user-context-ready": 0,
        "entering-user": 1,
        "user-ecall": 2,
        "console-write": 2,
        "user-exit": 3
      })[step] ?? state.syscallStep;
    }
    if (event.lab === "lab7") {
      state.fsStep = ({ start: 0, "file-open": 0, "file-write": 1, "file-close": 2, "file-read": 3, "file-verified": 4, pass: 4 })[step] ?? state.fsStep;
    }
  };

  const applyRuntimeEvent = (event) => {
    if (!event || !labIndex.hasOwnProperty(event.lab) || !event.step) return;
    stopAutoForLiveEvent();
    updateVisualStateFromEvent(event);
    setStage(labIndex[event.lab], event);
    recordRuntimeEvent(event);
  };

  const connectTelemetry = () => {
    if (!["http:", "https:"].includes(window.location.protocol)) {
      setConnection("离线演示：请通过实时启动脚本打开", false);
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    try {
      state.socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    } catch (_) {
      setConnection("遥测桥接不可用：仍可手动演示", false);
      return;
    }

    state.socket.addEventListener("open", () => {
      state.live = true;
      setConnection("实时连接：等待 QEMU 事件", true);
    });
    state.socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === "telemetry") applyRuntimeEvent(event);
        if (event.type === "history") event.events.forEach(applyRuntimeEvent);
        if (event.type === "run-start") {
          state.recentEvents = [];
          renderRuntimeFeed();
          dom.lastEvent.textContent = "QEMU 已启动，等待内核进入 P0";
        }
      } catch (_) {
        setConnection("收到无法识别的遥测数据", false);
      }
    });
    state.socket.addEventListener("close", () => {
      state.live = false;
      setConnection("实时连接已断开：可继续手动演示", false);
      window.setTimeout(connectTelemetry, 2000);
    });
    state.socket.addEventListener("error", () => {
      setConnection("遥测桥接不可用：仍可手动演示", false);
    });
  };

  const renderTimeline = () => {
    dom.timeline.innerHTML = "";
    stages.forEach((stage, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stage-tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === state.stageIndex));
      button.setAttribute("aria-controls", "execution-heading");
      button.innerHTML = `<span class="tab-number">${stage.label}</span><span class="tab-title">${stage.tab}</span>`;
      button.addEventListener("click", () => setStage(index));
      dom.timeline.appendChild(button);
    });
  };

  const sourceHref = (href) => {
    if (window.location.protocol === "file:") return href;
    return `/source/${href.replace(/^(\.\.\/)+/, "")}`;
  };

  const addControl = (label, action, primary = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button${primary ? " button-primary" : ""}`;
    button.textContent = label;
    button.addEventListener("click", action);
    dom.controls.appendChild(button);
  };

  const renderFlow = (nodes, activeIndex = -1, completeBefore = -1) => {
    const row = document.createElement("div");
    row.className = "flow-row";
    row.style.setProperty("--nodes", nodes.length);
    nodes.forEach((node, index) => {
      const item = document.createElement("div");
      item.className = "flow-node";
      if (index === activeIndex) item.classList.add("active");
      if (index < completeBefore) item.classList.add("done");
      item.innerHTML = `<span class="node-kicker">${node.kicker}</span><strong>${node.title}</strong><small>${node.detail}</small>`;
      row.appendChild(item);
    });
    dom.visual.innerHTML = "";
    dom.visual.appendChild(row);
  };

  const renderP0 = () => {
    renderFlow([
      { kicker: "模拟硬件", title: "QEMU virt", detail: "加载内核镜像" },
      { kicker: "M-mode 固件", title: "OpenSBI", detail: "进入 S-mode" },
      { kicker: "汇编入口", title: "_start", detail: "sp ← 启动栈顶" },
      { kicker: "Rust 内核", title: "kernel_main", detail: "实验主流程" }
    ], 2, 2);
    addControl("重放启动链路", () => animateP0(), true);
  };

  const animateP0 = () => {
    const nodes = [
      { kicker: "模拟硬件", title: "QEMU virt", detail: "加载内核镜像" },
      { kicker: "M-mode 固件", title: "OpenSBI", detail: "进入 S-mode" },
      { kicker: "汇编入口", title: "_start", detail: "sp ← 启动栈顶" },
      { kicker: "Rust 内核", title: "kernel_main", detail: "实验主流程" }
    ];
    clearFlowTimers();
    nodes.forEach((_, index) => {
      state.flowTimers.push(window.setTimeout(() => {
        renderFlow(nodes, index, index);
        setStatus(index === nodes.length - 1 ? "kernel_main 已进入" : `启动步骤 ${index + 1}/4`);
      }, index * 650));
    });
  };

  const sbiNodes = [
    { kicker: "Rust", title: "print_line", detail: "遍历字符串字节" },
    { kicker: "内核", title: "putchar", detail: "调用 SBI 包装" },
    { kicker: "寄存器", title: "a0 / a7", detail: "字符 / SBI 扩展号" },
    { kicker: "指令", title: "ecall", detail: "S-mode 请求服务" },
    { kicker: "M-mode", title: "OpenSBI", detail: "console_putchar" },
    { kicker: "设备", title: "QEMU UART", detail: "显示一个字符" }
  ];

  const renderLab1 = () => {
    renderFlow(sbiNodes, state.sbiStep, state.sbiStep);
    addControl("单步输出字符", () => advanceSbi(), true);
    addControl("完整播放", () => playSbi());
  };

  const advanceSbi = () => {
    state.sbiStep = (state.sbiStep + 1) % sbiNodes.length;
    renderFlow(sbiNodes, state.sbiStep, state.sbiStep);
    setStatus(`字符位于：${sbiNodes[state.sbiStep].title}`);
  };

  const playSbi = () => {
    clearFlowTimers();
    state.sbiStep = 0;
    sbiNodes.forEach((_, index) => {
      state.flowTimers.push(window.setTimeout(() => {
        state.sbiStep = index;
        renderFlow(sbiNodes, index, index);
        setStatus(index === sbiNodes.length - 1 ? "字符已显示" : `SBI 路径 ${index + 1}/${sbiNodes.length}`);
      }, index * 570));
    });
  };

  const trapNodes = [
    { kicker: "当前指令", title: "ebreak", detail: "触发 breakpoint" },
    { kicker: "CSR", title: "stvec", detail: "跳转 __trap_entry" },
    { kicker: "汇编", title: "TrapFrame", detail: "保存寄存器与 CSR" },
    { kicker: "Rust", title: "handler", detail: "检查 scause" },
    { kicker: "控制流", title: "sepc += 4", detail: "跳过 ebreak" },
    { kicker: "返回", title: "sret", detail: "恢复现场继续运行" }
  ];

  const renderLab2 = () => {
    renderFlow(trapNodes, state.trapStep, state.trapStep);
    addControl("触发 ebreak", () => playTrap(), true);
    addControl("单步 Trap", () => advanceTrap());
  };

  const advanceTrap = () => {
    state.trapStep = (state.trapStep + 1) % trapNodes.length;
    renderFlow(trapNodes, state.trapStep, state.trapStep);
    setStatus(`Trap 步骤：${trapNodes[state.trapStep].title}`);
  };

  const playTrap = () => {
    clearFlowTimers();
    trapNodes.forEach((_, index) => {
      state.flowTimers.push(window.setTimeout(() => {
        state.trapStep = index;
        renderFlow(trapNodes, index, index);
        setStatus(index === trapNodes.length - 1 ? "现场恢复完成" : `Trap 处理中 ${index + 1}/${trapNodes.length}`);
      }, index * 620));
    });
  };

  const renderLab3 = () => {
    dom.visual.innerHTML = "";
    const container = document.createElement("div");
    container.className = "machine-visual";
    const grid = document.createElement("div");
    grid.className = "frame-grid";
    state.frames.forEach((frame, index) => {
      const cell = document.createElement("div");
      cell.className = `frame ${frame}`;
      cell.textContent = index < 3 ? "K" : `P${index}`;
      grid.appendChild(cell);
    });
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = "<span class=\"legend-reserved\">内核保留</span><span class=\"legend-allocated\">已分配</span><span class=\"legend-recycled\">recycled 栈</span><span>空闲页</span>";
    container.append(grid, legend);
    dom.visual.appendChild(container);
    addControl("alloc() 分配页", () => allocateFrame(), true);
    addControl("dealloc() 释放最后一页", () => recycleFrame());
  };

  const allocateFrame = () => {
    const recycled = state.frames.findIndex((value) => value === "recycled");
    const free = state.frames.findIndex((value) => value === "free");
    const target = recycled >= 0 ? recycled : free;
    if (target < 0) {
      setStatus("没有可分配页");
      return;
    }
    state.frames[target] = "allocated";
    setStatus(recycled >= 0 ? `复用回收页 P${target}` : `next 分配新页 P${target}`);
    renderLab3();
  };

  const recycleFrame = () => {
    const target = state.frames.map((value, index) => ({ value, index })).filter((item) => item.value === "allocated").pop();
    if (!target) {
      setStatus("没有已分配页可释放");
      return;
    }
    state.frames[target.index] = "recycled";
    setStatus(`P${target.index} 已压入 recycled 栈`);
    renderLab3();
  };

  const renderLab4 = () => {
    dom.visual.innerHTML = `
      <div>
        <div class="page-table" role="img" aria-label="Sv39 三级页表从 VPN2、VPN1、VPN0 到物理页号的翻译">
          <div class="page-column"><div class="page-entry selected">VPN[2] = 0x102</div><div class="page-entry">根页表</div></div>
          <div class="page-arrow">→</div>
          <div class="page-column"><div class="page-entry selected">VPN[1] = 0x001</div><div class="page-entry">二级页表</div></div>
          <div class="page-arrow">→</div>
          <div class="page-column"><div class="page-entry selected">VPN[0] = 0x01A</div><div class="page-entry">叶子 PTE</div></div>
          <div class="page-arrow">→</div>
          <div class="page-column"><div class="page-entry selected">PPN + offset</div><div class="page-entry">PA / 权限 R-X</div></div>
        </div>
        <div class="satp-register ${state.satpEnabled ? "enabled" : ""}">satp = MODE(Sv39=8) | ROOT_PPN ${state.satpEnabled ? "→ 已写入，sfence.vma 已刷新" : "→ 尚未激活"}</div>
      </div>`;
    addControl(state.satpEnabled ? "重置分页状态" : "写入 satp 并启用分页", () => toggleSatp(), true);
  };

  const toggleSatp = () => {
    state.satpEnabled = !state.satpEnabled;
    setStatus(state.satpEnabled ? "Sv39 分页已激活" : "页表仍在构建阶段");
    renderLab4();
  };

  const schedulerStates = [
    { running: 0, log: "scheduler → task A（A Running，B/C Ready）" },
    { running: 1, log: "A yield → scheduler → task B" },
    { running: 2, log: "B yield → scheduler → task C" },
    { running: 0, log: "C yield → scheduler → task A（第二轮）" },
    { running: 1, log: "A exit → scheduler → task B" },
    { running: 2, log: "B exit → scheduler → task C" },
    { running: -1, log: "C exit → 所有任务 Exited，调度结束" }
  ];

  const renderLab5 = () => {
    const current = schedulerStates[state.schedulerStep];
    dom.visual.innerHTML = "";
    const scheduler = document.createElement("div");
    scheduler.className = "scheduler";
    const taskRows = ["状态", "上下文"].map((label) => {
      const row = document.createElement("div");
      row.className = "task-row";
      row.innerHTML = `<span>${label}</span>`;
      ["A", "B", "C"].forEach((task, index) => {
        const item = document.createElement("div");
        const done = state.schedulerStep >= 4 + index;
        item.className = `task-card ${current.running === index ? "running" : ""} ${done ? "exited" : ""}`;
        item.textContent = label === "状态" ? `${task}: ${done ? "Exited" : current.running === index ? "Running" : "Ready"}` : `${task}: ra · sp · s0…s11`;
        row.appendChild(item);
      });
      return row;
    });
    const log = document.createElement("div");
    log.className = "switch-log";
    log.textContent = current.log;
    scheduler.append(...taskRows, log);
    dom.visual.appendChild(scheduler);
    addControl("调度一步", () => stepScheduler(), true);
    addControl("重置任务", () => { state.schedulerStep = 0; setStatus("任务表已重置"); renderLab5(); });
  };

  const stepScheduler = () => {
    state.schedulerStep = (state.schedulerStep + 1) % schedulerStates.length;
    const text = schedulerStates[state.schedulerStep].log;
    setStatus(state.schedulerStep === schedulerStates.length - 1 ? "调度完成" : "上下文切换完成");
    renderLab5();
    dom.explanation.textContent = text;
  };

  const renderLab6 = () => {
    const phases = [
      { label: "S-mode", tokens: ["设置 sepc", "SPP = 0", "SPIE = 1", "sscratch = trap 栈"], active: state.syscallStep === 0 },
      { label: "特权切换", tokens: ["sret", "→ U-mode", "ecall", "→ stvec"], active: state.syscallStep === 1 },
      { label: "Trap / S-mode", tokens: ["保存 TrapFrame", "a7: syscall id", "a0…a5: 参数", "a0: 返回值"], active: state.syscallStep === 2 },
      { label: "U-mode", tokens: ["用户程序继续", "下一次 ecall"], active: state.syscallStep === 3 }
    ];
    dom.visual.innerHTML = "";
    const visual = document.createElement("div");
    visual.className = "machine-visual";
    phases.forEach((phase) => {
      const row = document.createElement("div");
      row.className = "machine-row";
      const lane = document.createElement("div");
      lane.className = "lane";
      phase.tokens.forEach((token) => {
        const item = document.createElement("span");
        item.className = `lane-token ${phase.active ? "active" : ""}`;
        item.textContent = token;
        lane.appendChild(item);
      });
      row.innerHTML = `<div class="lane-label">${phase.label}</div>`;
      row.appendChild(lane);
      visual.appendChild(row);
    });
    dom.visual.appendChild(visual);
    addControl("执行一次 syscall 往返", () => stepSyscall(), true);
  };

  const stepSyscall = () => {
    state.syscallStep = (state.syscallStep + 1) % 4;
    const labels = ["准备 sret", "运行用户态 ecall", "内核分发 syscall", "sret 返回用户态"];
    setStatus(labels[state.syscallStep]);
    renderLab6();
  };

  const fsSteps = [
    { label: "open()", fd: "fd 3 → offset 0", bytes: [] },
    { label: "write(LAB7)", fd: "fd 3 → offset 4", bytes: ["L", "A", "B", "7"] },
    { label: "close()", fd: "fd 3 → closed", bytes: ["L", "A", "B", "7"] },
    { label: "reopen + read()", fd: "fd 3 → offset 4", bytes: ["L", "A", "B", "7"] },
    { label: "验证成功", fd: "fd 3 → closed", bytes: ["L", "A", "B", "7"] }
  ];

  const renderLab7 = () => {
    const current = fsSteps[state.fsStep];
    dom.visual.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "fs-visual";
    const bytes = document.createElement("div");
    bytes.className = "byte-strip";
    Array.from({ length: 16 }, (_, index) => {
      const cell = document.createElement("div");
      const isWritten = index < current.bytes.length;
      cell.className = `byte ${isWritten ? "written" : ""}`;
      cell.textContent = isWritten ? current.bytes[index] : "·";
      bytes.appendChild(cell);
    });
    const table = document.createElement("div");
    table.className = "fd-table";
    table.innerHTML = `<div class="fd-row"><span>fd 0</span><span class="fd-value">stdin（保留）</span></div><div class="fd-row"><span>fd 1</span><span class="fd-value">stdout（保留）</span></div><div class="fd-row"><span>fd 3</span><span class="fd-value ${state.fsStep === 0 || state.fsStep === 1 || state.fsStep === 3 ? "open" : ""}">${current.fd}</span></div>`;
    wrapper.append(bytes, table);
    dom.visual.appendChild(wrapper);
    addControl("文件 I/O 下一步", () => stepFs(), true);
    addControl("重置 I/O", () => { state.fsStep = 0; setStatus("等待 open()"); renderLab7(); });
  };

  const stepFs = () => {
    state.fsStep = (state.fsStep + 1) % fsSteps.length;
    const current = fsSteps[state.fsStep];
    setStatus(current.label === "验证成功" ? "[Lab7] PASS" : current.label);
    renderLab7();
    dom.explanation.textContent = `${current.label}：${current.fd}。${current.label === "验证成功" ? "用户缓冲区中的字节与写入的 LAB7 一致。" : ""}`;
  };

  const stageRenderers = { p0: renderP0, lab1: renderLab1, lab2: renderLab2, lab3: renderLab3, lab4: renderLab4, lab5: renderLab5, lab6: renderLab6, lab7: renderLab7 };

  const setStage = (index, runtimeEvent = null) => {
    clearFlowTimers();
    state.stageIndex = (index + stages.length) % stages.length;
    const stage = stages[state.stageIndex];
    renderTimeline();
    dom.stageLabel.textContent = stage.label;
    dom.stageTitle.textContent = stage.title;
    dom.stageSummary.textContent = stage.summary;
    dom.executionHeading.textContent = stage.title;
    dom.explanation.textContent = stage.explanation;
    dom.concepts.innerHTML = stage.concepts.map((concept) => `<span class="concept-pill">${concept}</span>`).join("");
    dom.links.innerHTML = stage.links.map(([name, href]) => `<a href="${sourceHref(href)}">↗ ${name}</a>`).join("");
    dom.controls.innerHTML = "";
    setStatus(stage.status);
    stageRenderers[stage.id]();
    if (runtimeEvent) {
      setStatus(`实时运行：${humanEvent(runtimeEvent)}`);
      dom.explanation.textContent = `这是 QEMU 串口刚刚发出的运行时事件：${humanEvent(runtimeEvent)}。页面已自动定位到实际执行阶段。`;
    }
  };

  const toggleAuto = () => {
    if (state.autoTimer) {
      window.clearInterval(state.autoTimer);
      state.autoTimer = null;
      dom.auto.textContent = "自动演示";
      dom.auto.setAttribute("aria-pressed", "false");
      setStatus("自动演示已暂停");
      return;
    }
    dom.auto.textContent = "暂停自动演示";
    dom.auto.setAttribute("aria-pressed", "true");
    state.autoTimer = window.setInterval(() => setStage(state.stageIndex + 1), 4400);
    setStatus("按 P0 → Lab7 自动前进");
  };

  dom.previous.addEventListener("click", () => setStage(state.stageIndex - 1));
  dom.next.addEventListener("click", () => setStage(state.stageIndex + 1));
  dom.auto.addEventListener("click", toggleAuto);

  setStage(0);
  connectTelemetry();
})();
