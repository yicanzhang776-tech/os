(() => {
  "use strict";

  const stages = [
    {
      id: "p0",
      label: "P0",
      tab: "启动基线",
      title: "最小运行基线",
      summary: "QEMU 装载内核，OpenSBI 从 M-mode 准备机器并以 S-mode 进入 _start；汇编入口建立启动栈后才把控制权交给 Rust。",
      objective: "能画出 QEMU → OpenSBI → _start → kernel_main 的控制权转移，并解释裸机 Rust 为什么不能假设已有运行时。",
      concepts: ["裸机", "链接脚本", "启动栈", "M/S-mode"],
      prerequisites: ["RISC-V 基本寄存器", "Rust no_std", "QEMU virt 机器"],
      invariants: ["入口地址与 linker.ld 一致", "进入 Rust 前 sp 有效且对齐", "内核镜像不能覆盖启动数据"],
      tasks: ["确认交叉编译与镜像入口", "观察 OpenSBI 交接参数", "验证 kernel_main 与关机路径"],
      links: [["boot.rs", "kernel/src/boot.rs"], ["linker.ld", "kernel/linker.ld"], ["main.rs", "kernel/src/main.rs"]],
      explanation: "P0 不增加 OS 功能，它建立所有后续实验共享的“可运行、可观察、可退出”现场。",
      visual: "flow",
      steps: [
        { id: "qemu", kicker: "模拟硬件", title: "QEMU virt", detail: "装载内核镜像" },
        { id: "opensbi", kicker: "M-mode 固件", title: "OpenSBI", detail: "初始化并进入 S-mode" },
        { id: "start", kicker: "汇编入口", title: "_start", detail: "sp ← boot_stack_top" },
        { id: "kernel-main", kicker: "Rust 内核", title: "kernel_main", detail: "开始教学执行链" },
        { id: "pass", kicker: "稳定证据", title: "[P0] PASS", detail: "最小闭环完成" }
      ],
      eventSteps: { "kernel-main": 3, pass: 4 }
    },
    {
      id: "lab1",
      label: "Lab1",
      tab: "SBI 控制台",
      title: "一次 print 如何到达 QEMU 控制台",
      summary: "内核没有标准输出。console 逐字节调用 SBI 包装，将字符和扩展号放入约定寄存器，再通过 ecall 请求 OpenSBI 服务。",
      objective: "能沿着 print_line → putchar → ecall → OpenSBI → UART 追踪一个字符，并区分内核日志与固件日志。",
      concepts: ["SBI", "ecall", "a0/a7", "早期调试"],
      prerequisites: ["P0 启动现场", "RISC-V 调用约定", "S-mode 与 M-mode 分工"],
      invariants: ["console 不依赖标准库", "SBI 参数寄存器符合 ABI", "成功 marker 稳定且唯一"],
      tasks: ["追踪入口与启动日志", "补全 console_write 路径", "保留 PASS 与 system reset"],
      links: [["console.rs", "kernel/src/console.rs"], ["sbi.rs", "kernel/src/sbi.rs"], ["Lab1 文档", "docs/labs/lab1.md"]],
      explanation: "控制台既是 Lab1 的实验对象，也是 Lab2–Lab7 的观察通道；后续实时可视化正是复用这条串口链路。",
      visual: "flow",
      steps: [
        { id: "start", kicker: "Rust", title: "print_line", detail: "遍历字符串字节" },
        { id: "putchar", kicker: "内核封装", title: "putchar", detail: "准备 SBI 参数" },
        { id: "registers", kicker: "寄存器", title: "a0 / a7", detail: "字符 / 扩展号" },
        { id: "ecall", kicker: "特权指令", title: "ecall", detail: "S-mode → M-mode" },
        { id: "opensbi", kicker: "固件", title: "OpenSBI", detail: "处理 console_putchar" },
        { id: "console-available", kicker: "设备", title: "QEMU UART", detail: "字符成为可见证据" }
      ],
      eventSteps: { start: 0, "console-available": 5, pass: 5, "task-1-pass": 1, "task-2-pass": 4 }
    },
    {
      id: "lab2",
      label: "Lab2",
      tab: "Trap 异常",
      title: "Trap：打断执行后如何安全返回",
      summary: "stvec 决定入口；汇编保存现场；Rust handler 读取 scause、sepc、stval，处理 breakpoint 后推进 sepc，再由 sret 恢复控制流。",
      objective: "能解释一次 ebreak 的完整往返，说明每个 CSR 和 TrapFrame 的职责，并判断卡死发生在哪个边界。",
      concepts: ["stvec", "scause", "sepc", "TrapFrame", "sret"],
      prerequisites: ["Lab1 控制台", "CSR 基础", "RISC-V 寄存器保存约定"],
      invariants: ["保存与恢复布局完全一致", "只处理已识别 cause", "32 位 ebreak 处理后 sepc += 4"],
      tasks: ["安装 stvec", "读取并解释 trap CSR", "推进 sepc 并恢复现场"],
      links: [["trap.rs", "kernel/src/trap.rs"], ["Lab2 文档", "docs/labs/lab2.md"]],
      explanation: "Trap 是后续系统调用和故障处理的共同骨架。Lab2 先用可控 breakpoint 隔离学习这条控制流。",
      visual: "flow",
      steps: [
        { id: "stvec-installed", kicker: "CSR", title: "stvec", detail: "安装 __trap_entry" },
        { id: "breakpoint-triggered", kicker: "当前指令", title: "ebreak", detail: "同步异常发生" },
        { id: "trap-frame", kicker: "入口汇编", title: "TrapFrame", detail: "保存 GPR 与 CSR" },
        { id: "breakpoint-decoded", kicker: "Rust handler", title: "scause = 3", detail: "识别 breakpoint" },
        { id: "breakpoint-handled", kicker: "返回地址", title: "sepc += 4", detail: "跳过已处理指令" },
        { id: "pass", kicker: "返回", title: "sret", detail: "恢复原执行流" }
      ],
      eventSteps: {
        start: 0, "stvec-installed": 0, "breakpoint-triggered": 1, "breakpoint-decoded": 3,
        "breakpoint-handled": 4, pass: 5, "task-1-pass": 0, "task-2-pass": 3, "task-3-pass": 5
      }
    },
    {
      id: "lab3",
      label: "Lab3",
      tab: "物理页帧",
      title: "物理内存：分配、释放与复用",
      summary: "分配器管理 [start,end) 页号区间：先从 recycled 栈复用，再从 next 顺序分配；非法释放与 double free 必须被拒绝。",
      objective: "能把地址、页号、对齐和分配器状态联系起来，并用状态变化解释 alloc/dealloc 的正确性。",
      concepts: ["4 KiB 页", "PhysPageNum", "半开区间", "recycled", "Double Free"],
      prerequisites: ["Lab2 可诊断运行环境", "地址对齐", "Rust Option/Result"],
      invariants: ["ekernel 之前永不分配", "每个已分配页唯一", "越界、未分配和重复释放均报错"],
      tasks: ["实现地址与页号转换", "初始化并分配物理页", "验证回收、耗尽与非法释放"],
      links: [["address.rs", "kernel/src/memory/address.rs"], ["frame_allocator.rs", "kernel/src/memory/frame_allocator.rs"], ["Lab3 文档", "docs/labs/lab3.md"]],
      explanation: "Lab3 提供“页表页从哪里来”的答案，因此它是 Lab4 的资源前提；分配器本身还不改变 CPU 地址翻译。",
      visual: "memory",
      steps: [
        { id: "start", title: "保留内核页" },
        { id: "address-ready", title: "地址取整与页号" },
        { id: "allocator-ready", title: "初始化 [start,end)" },
        { id: "allocate", title: "next 分配新页" },
        { id: "deallocate", title: "释放到 recycled" },
        { id: "pass", title: "优先复用并通过检查" }
      ],
      eventSteps: { start: 0, "task-1-pass": 1, "allocator-ready": 2, "task-2-pass": 3, "frame-checks-start": 3, "frame-checks-pass": 5, pass: 5 }
    },
    {
      id: "lab4",
      label: "Lab4",
      tab: "Sv39 页表",
      title: "虚拟地址如何翻译并受到保护",
      summary: "Sv39 把虚拟页号拆为三级索引。非叶子 PTE 指向下一级页表，叶子 PTE 同时给出物理页号和 R/W/X/U 权限。",
      objective: "能从一个 VA 手算 VPN[2:0] 与 offset，沿三级页表找到 PPN，并解释 satp、TLB 和最小权限映射。",
      concepts: ["VPN[2:0]", "PTE", "R/W/X/U", "satp", "sfence.vma"],
      prerequisites: ["Lab3 页帧分配", "RISC-V Sv39", "链接段边界"],
      invariants: ["启用前映射当前代码与栈", "非叶子只设置 V", "text 不可写、data 不可执行"],
      tasks: ["实现地址/PTE 辅助类型", "实现三级 map/translate", "建立映射并激活 satp"],
      links: [["page_table.rs", "kernel/src/memory/page_table.rs"], ["virtual_address.rs", "kernel/src/memory/virtual_address.rs"], ["Lab4 文档", "docs/labs/lab4.md"]],
      explanation: "Lab4 把 Lab3 的物理页组织成受权限约束的地址空间，为 Lab6 的 U-mode 页面建立隔离边界。",
      visual: "paging",
      steps: [
        { id: "allocator-ready", title: "页帧来源" },
        { id: "root-page-table", title: "根页表" },
        { id: "page-table-built", title: "三级 walk" },
        { id: "segments-mapped", title: "分段权限" },
        { id: "satp-activated", title: "启用 Sv39" },
        { id: "pass", title: "翻译验证" }
      ],
      eventSteps: {
        start: 0, "allocator-ready": 0, "root-page-table": 1, "task-1-pass": 1,
        "page-table-built": 2, "task-2-pass": 2, "text-mapped": 3, "rodata-mapped": 3,
        "data-mapped": 3, "bss-mapped": 3, "user-pages-mapped": 3,
        "satp-activated": 4, "paging-active": 4, "translate-verified": 5, pass: 5
      }
    },
    {
      id: "lab5",
      label: "Lab5",
      tab: "协作调度",
      title: "多个任务如何共享一个 CPU",
      summary: "TaskControlBlock 保存状态与上下文；任务主动 yield 回到调度器；Round-Robin 选择下一个 Ready 任务并恢复 callee-saved 寄存器。",
      objective: "能同时从状态机、CPU 上下文和时间顺序解释一次任务切换，并说明协作式调度的限制。",
      concepts: ["TCB", "Ready/Running/Exited", "Round-Robin", "ra/sp/s0…s11"],
      prerequisites: ["Lab4 可用地址空间", "RISC-V 调用约定", "独立内核栈"],
      invariants: ["每次只有一个 Running", "Exited 不再调度", "sp 16 字节对齐且各任务栈独立"],
      tasks: ["建立任务抽象与状态机", "实现 Round-Robin 与 yield", "完成 __switch 与三任务验收"],
      links: [["task/mod.rs", "kernel/src/task/mod.rs"], ["switch.S", "kernel/src/task/switch.S"], ["Lab5 文档", "docs/labs/lab5.md"]],
      explanation: "Lab5 暂不通过时钟中断抢占；这个取舍让学生先观察“保存谁、恢复谁、状态如何改变”。",
      visual: "scheduler",
      steps: [
        { id: "scheduler-ready", title: "3 个 Ready 任务" },
        { id: "task-a-step-1", title: "A₁" },
        { id: "task-b-step-1", title: "B₁" },
        { id: "task-c-step-1", title: "C₁" },
        { id: "task-a-step-2", title: "A₂" },
        { id: "task-b-step-2", title: "B₂" },
        { id: "task-c-step-2", title: "C₂" },
        { id: "pass", title: "全部 Exited" }
      ],
      eventSteps: {
        start: 0, "scheduler-ready": 0, "task-1-pass": 0, "task-2-pass": 1,
        "task-a-step-1": 1, "task-b-step-1": 2, "task-c-step-1": 3,
        "task-a-step-2": 4, "task-b-step-2": 5, "task-c-step-2": 6,
        "scheduler-finished": 7, pass: 7
      }
    },
    {
      id: "lab6",
      label: "Lab6",
      tab: "用户态 / syscall",
      title: "U-mode 与 S-mode 的受控往返",
      summary: "内核准备 sepc、sstatus、用户栈和 sscratch，以 sret 进入 U-mode；用户用 ecall 进入同一条 Trap 骨架，内核按 a7 分发系统调用。",
      objective: "能解释一次 write syscall 的权限、控制流、栈和 ABI 变化，并说明为什么用户程序不能直接调用内核函数。",
      concepts: ["U-mode", "SPP/SPIE", "sscratch", "ecall", "Syscall ABI"],
      prerequisites: ["Lab2 Trap 骨架", "Lab4 U 位页映射", "Lab5 上下文概念"],
      invariants: ["用户页必须带 U 与最小权限", "trap 后切到内核栈", "系统调用处理后 sepc += 4"],
      tasks: ["准备用户上下文并进入 U-mode", "实现 write/yield/exit 分发", "完成用户程序真实往返"],
      links: [["user.rs", "kernel/src/user.rs"], ["syscall.rs", "kernel/src/syscall.rs"], ["trap.rs", "kernel/src/trap.rs"], ["Lab6 文档", "docs/labs/lab6.md"]],
      explanation: "Lab6 复用 Lab2 的 Trap、Lab4 的权限和 Lab5 的上下文概念，把它们组合成第一个真正的用户/内核边界。",
      visual: "privilege",
      steps: [
        { id: "user-context-ready", title: "准备 CSR/用户栈" },
        { id: "entering-user", title: "sret → U-mode" },
        { id: "user-ecall", title: "ecall → Trap" },
        { id: "console-write", title: "dispatch(write)" },
        { id: "user-exit", title: "dispatch(exit)" },
        { id: "pass", title: "用户态闭环" }
      ],
      eventSteps: {
        start: 0, "user-context-ready": 0, "task-1-pass": 1, "entering-user": 1,
        "user-ecall": 2, "task-2-pass": 3, "console-write": 3,
        "syscall-yield": 3, "user-exit": 4, pass: 5
      }
    },
    {
      id: "lab7",
      label: "Lab7",
      tab: "文件 I/O",
      title: "从用户字节到 RAM 文件",
      summary: "用户系统调用穿过 Trap 与 ABI，fd 表记录打开状态和 offset，SimpleFs 组织文件语义，RamDevice 最终按 offset 读写固定字节。",
      objective: "能沿 open/write/close/read 追踪数据与控制流，并从设备、文件对象、fd 和用户缓冲区四层解释抽象边界。",
      concepts: ["ByteDevice", "SimpleFs", "fd/offset", "SUM", "用户缓冲区"],
      prerequisites: ["Lab6 syscall 路径", "Lab4 用户页权限", "Rust Result 与错误枚举"],
      invariants: ["每个 fd 独立维护 offset", "close 后 fd 失效", "用户缓冲区检查通过时才临时开启 SUM"],
      tasks: ["实现 RAM 字节设备", "实现 fd 表与 SimpleFs", "完成用户态文件 I/O 验收"],
      links: [["drivers/mod.rs", "kernel/src/drivers/mod.rs"], ["fs/mod.rs", "kernel/src/fs/mod.rs"], ["trap.rs", "kernel/src/trap.rs"], ["Lab7 文档", "docs/labs/lab7.md"]],
      explanation: "Lab7 是整条知识链的综合实验：权限边界保护用户数据，系统调用传递意图，文件抽象管理状态，设备抽象搬运字节。",
      visual: "filesystem",
      steps: [
        { id: "start", title: "进入文件实验" },
        { id: "device", title: "RamDevice" },
        { id: "file-open", title: "open → fd 3" },
        { id: "file-write", title: "write → offset 4" },
        { id: "file-read", title: "reopen/read" },
        { id: "file-verified", title: "字节一致" },
        { id: "pass", title: "I/O 闭环" }
      ],
      eventSteps: {
        start: 0, "task-1-pass": 1, "task-2-pass": 2, "file-open": 2,
        "file-write": 3, "file-close": 4, "file-read": 4,
        "file-verified": 5, pass: 6
      }
    }
  ];

  const dimensions = [
    {
      id: "sequence",
      label: "执行链",
      description: "按 CPU 实际执行顺序理解“为什么下一步必须发生”。",
      question: "控制权现在属于谁，下一次跳转由什么触发？",
      insight: "从启动到文件 I/O 不是八段孤立代码：每个 Lab 都把一种新机制接到已经可运行的控制流上。",
      nodes: [
        { title: "启动并建立观察通道", detail: "QEMU → OpenSBI → kernel_main → SBI console", labs: ["p0", "lab1"] },
        { title: "可控地打断与返回", detail: "ebreak → stvec → TrapFrame → sret", labs: ["lab2"] },
        { title: "获得并组织内存", detail: "页帧 → 三级页表 → satp", labs: ["lab3", "lab4"] },
        { title: "复用 CPU 时间", detail: "yield → scheduler → __switch", labs: ["lab5"] },
        { title: "跨越用户/内核边界", detail: "sret → U-mode → ecall → dispatch", labs: ["lab6"] },
        { title: "完成用户文件 I/O", detail: "syscall → fd → SimpleFs → RamDevice", labs: ["lab7"] }
      ]
    },
    {
      id: "layers",
      label: "系统层次",
      description: "按硬件、固件、内核机制、内核抽象和用户程序分层。",
      question: "当前知识点属于哪一层？它向上提供什么、向下依赖什么？",
      insight: "层次视角能避免把 SBI、syscall 和普通函数调用混为一谈，也能看出文件系统为何不直接操作用户寄存器。",
      nodes: [
        { title: "模拟硬件", detail: "CPU、CSR、物理内存、UART", labs: ["p0", "lab2", "lab3"] },
        { title: "M-mode 固件", detail: "OpenSBI 提供早期控制台和关机服务", labs: ["p0", "lab1"] },
        { title: "S-mode 机制", detail: "Trap、页表、上下文切换", labs: ["lab2", "lab4", "lab5"] },
        { title: "S-mode 抽象", detail: "页帧、任务、syscall、fd、文件系统", labs: ["lab3", "lab5", "lab6", "lab7"] },
        { title: "U-mode 程序", detail: "只通过 ABI 请求受控服务", labs: ["lab6", "lab7"] }
      ]
    },
    {
      id: "resources",
      label: "资源视角",
      description: "观察 OS 如何命名、分配、保护和复用有限资源。",
      question: "这里管理的资源是什么？谁拥有它，生命周期何时结束？",
      insight: "页帧、页表页、任务上下文和 fd 看似不同，本质上都需要身份、状态、所有权和错误边界。",
      nodes: [
        { title: "CPU 执行现场", detail: "sp、ra、CSR、TrapFrame", labs: ["p0", "lab2", "lab5", "lab6"] },
        { title: "物理页帧", detail: "[start,end)、next、recycled", labs: ["lab3", "lab4"] },
        { title: "虚拟地址空间", detail: "VPN、PTE、权限和 TLB", labs: ["lab4", "lab6"] },
        { title: "CPU 时间", detail: "Ready/Running/Exited 与 Round-Robin", labs: ["lab5"] },
        { title: "打开文件状态", detail: "fd、offset、close 与设备容量", labs: ["lab7"] }
      ]
    },
    {
      id: "protection",
      label: "保护边界",
      description: "沿特权级、页面权限、内核栈和用户缓冲区追踪“谁能做什么”。",
      question: "哪条硬件或软件规则阻止了越权访问？",
      insight: "保护不是 Lab6 才突然出现：M/S 分工、Trap 入口、PTE 权限和上下文隔离逐步组合成用户/内核边界。",
      nodes: [
        { title: "M-mode / S-mode", detail: "OpenSBI 与内核职责分离", labs: ["p0", "lab1"] },
        { title: "受控 Trap 入口", detail: "stvec、scause、sepc 限定返回路径", labs: ["lab2", "lab6"] },
        { title: "内存所有权", detail: "禁止覆盖内核页、拒绝 double free", labs: ["lab3"] },
        { title: "R/W/X/U 权限", detail: "最小权限与用户页面 U 位", labs: ["lab4", "lab6"] },
        { title: "内核栈与用户缓冲区", detail: "sscratch、范围检查、临时 SUM", labs: ["lab6", "lab7"] }
      ]
    },
    {
      id: "evidence",
      label: "实验验证",
      description: "把 TODO、过程 marker、状态变化和自动测试组成可解释的证据链。",
      question: "页面的结论来自哪一条实际证据，而不是哪一个预设动画？",
      insight: "starter 的 TODO 是有意义的停点，不是失败噪声；只有真实 PASS 或等价过程证据才能把状态推进为完成。",
      nodes: [
        { title: "Starter TODO", detail: "定位尚未建立的不变量", labs: ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"] },
        { title: "阶段证据", detail: "[LabN-Tx] 与关键过程日志", labs: ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"] },
        { title: "运行可视化", detail: "串口日志被解析为统一事件", labs: ["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"] },
        { title: "自动验收", detail: "-ExpectIncomplete 或 [LabN] PASS", labs: ["lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"] }
      ]
    }
  ];

  const matrixRows = [
    { label: "启动 / 特权", cells: ["入口/栈", "SBI ecall", "S-mode CSR", "", "", "", "U/S 切换", ""] },
    { label: "控制流", cells: ["启动链", "函数调用", "Trap 往返", "", "", "任务切换", "syscall 往返", "I/O syscall"] },
    { label: "内存资源", cells: ["镜像边界", "", "TrapFrame", "页帧", "页表页", "任务栈", "用户栈", "用户缓冲区"] },
    { label: "地址与保护", cells: ["S-mode", "M/S 边界", "受控入口", "所有权", "R/W/X/U", "上下文边界", "U 位/sscratch", "SUM/范围检查"] },
    { label: "内核抽象", cells: ["运行基线", "console", "Trap", "allocator", "address space", "task/TCB", "syscall ABI", "fd/fs/device"] },
    { label: "可观察证据", cells: ["P0 PASS", "字符输出", "breakpoint", "alloc/reuse", "satp 后继续", "A/B/C 交替", "hello/exit", "write/read 一致"] }
  ];

  const dom = Object.fromEntries([
    "timeline", "stage-label", "stage-title", "stage-summary", "stage-objective",
    "concept-list", "source-links", "prerequisite-list", "invariant-list",
    "execution-heading", "status-chip", "visual-area", "panel-controls",
    "explanation", "task-list", "task-progress-summary", "branch-fit",
    "connection-status", "last-event", "runtime-feed", "console-output",
    "console-channel", "branch-name", "branch-variant", "branch-lab",
    "run-state", "runtime-hint", "live-dot", "run-current", "stop-current", "dimension-tabs",
    "dimension-description", "framework-canvas", "dimension-question",
    "dimension-insight", "knowledge-matrix", "previous-stage", "next-stage",
    "auto-play", "clear-events"
  ].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

  const state = {
    stageIndex: 0,
    activeDimension: "sequence",
    manualSteps: Object.fromEntries(stages.map((stage) => [stage.id, 0])),
    progress: {},
    recentEvents: [],
    consoleLines: [],
    socket: null,
    live: false,
    context: null,
    runState: { phase: "offline", running: false, detail: "未连接本地桥接器" },
    autoTimer: null,
    reconnectTimer: null
  };

  const stageIndexById = Object.fromEntries(stages.map((stage, index) => [stage.id, index]));

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function sourceHref(path) {
    if (window.location.protocol === "file:") return `../../${path}`;
    return `/source/${path}`;
  }

  function statusLabel(status) {
    return {
      inherited: "已继承",
      active: "当前实验",
      reference: "参考实现",
      future: "尚未进入",
      running: "运行中",
      todo: "停在 TODO",
      pass: "已通过",
      fail: "出现失败",
      neutral: "知识预览"
    }[status] || status;
  }

  function baseStageStatus(index) {
    const context = state.context;
    if (!context || context.stageIndex === null) return "neutral";
    if (context.variant === "complete") return "inherited";
    if (index < context.stageIndex) return "inherited";
    if (index > context.stageIndex) return "future";
    if (context.variant === "starter" || context.variant === "baseline") return "active";
    if (context.variant === "solution") return "reference";
    return "active";
  }

  function stageStatus(stage, index) {
    return state.progress[stage.id]?.status || baseStageStatus(index);
  }

  function renderTimeline() {
    dom.timeline.innerHTML = "";
    stages.forEach((stage, index) => {
      const status = stageStatus(stage, index);
      const button = element("button", "stage-tab");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === state.stageIndex));
      button.dataset.status = status;
      button.append(
        element("span", "tab-number", stage.label),
        element("span", "tab-title", stage.tab),
        element("span", "tab-status", statusLabel(status))
      );
      button.addEventListener("click", () => setStage(index));
      dom.timeline.appendChild(button);
    });
  }

  function renderList(target, values) {
    target.innerHTML = "";
    values.forEach((value) => target.appendChild(element("li", "", value)));
  }

  function renderTasks(stage) {
    const progress = state.progress[stage.id] || {};
    const completed = new Set(progress.completedTasks || []);
    const todo = new Set(progress.todoTasks || []);
    dom.task_list.innerHTML = "";
    stage.tasks.forEach((task, index) => {
      const number = index + 1;
      const item = element("li", "task-item");
      const marker = element("span", "task-marker", String(number));
      let taskState = "waiting";
      if (completed.has(number) || progress.status === "pass") taskState = "complete";
      else if (todo.has(number)) taskState = "todo";
      item.dataset.status = taskState;
      item.append(marker, element("span", "", task));
      dom.task_list.appendChild(item);
    });
    const count = progress.status === "pass" ? stage.tasks.length : completed.size;
    dom.task_progress_summary.textContent = `${count} / ${stage.tasks.length}`;
  }

  function renderBranchFit(index) {
    if (!state.context || state.context.stageIndex === null) {
      dom.branch_fit.textContent = "知识总览";
      return;
    }
    if (index < state.context.stageIndex) dom.branch_fit.textContent = "前置能力";
    else if (index === state.context.stageIndex) dom.branch_fit.textContent = "当前分支目标";
    else dom.branch_fit.textContent = "后续知识预览";
  }

  function renderFlow(stage, step) {
    const row = element("div", "flow-row");
    row.style.setProperty("--nodes", stage.steps.length);
    stage.steps.forEach((item, index) => {
      const node = element("div", "flow-node");
      if (index === step) node.classList.add("active");
      if (index < step) node.classList.add("done");
      node.append(
        element("span", "node-kicker", item.kicker),
        element("strong", "", item.title),
        element("small", "", item.detail)
      );
      row.appendChild(node);
    });
    dom.visual_area.appendChild(row);
  }

  function renderMemory(step) {
    const wrapper = element("div", "memory-visual");
    const range = element("div", "memory-range");
    range.append(
      element("span", "range-reserved", "内核镜像 / 启动栈"),
      element("span", "range-managed", "[start, next, end) 可管理页")
    );
    const grid = element("div", "frame-grid");
    for (let index = 0; index < 14; index += 1) {
      let status = index < 3 ? "reserved" : "free";
      if (step >= 3 && index >= 3 && index <= Math.min(7, 3 + step)) status = "allocated";
      if (step === 4 && index === 6) status = "recycled";
      if (step >= 5 && index === 6) status = "reused";
      const cell = element("div", `frame ${status}`, index < 3 ? "K" : `P${index}`);
      grid.appendChild(cell);
    }
    const stateLine = element("div", "state-line");
    const descriptions = [
      "ekernel 之前全部保留",
      "floor / ceil 把字节地址转换为页号",
      "初始化 start、next、end",
      "alloc 从 next 取得唯一页",
      "dealloc 把页压入 recycled",
      "下一次 alloc 优先复用 recycled"
    ];
    stateLine.textContent = descriptions[step] || descriptions[0];
    wrapper.append(range, grid, stateLine);
    dom.visual_area.appendChild(wrapper);
  }

  function renderPaging(step) {
    const wrapper = element("div", "paging-visual");
    const walk = element("div", "page-table");
    const nodes = [
      ["VA", "VPN2 | VPN1 | VPN0 | offset"],
      ["L2", "root[VPN2]"],
      ["L1", "table[VPN1]"],
      ["L0", "leaf[VPN0]"],
      ["PA", "PPN | offset"]
    ];
    nodes.forEach(([title, detail], index) => {
      const node = element("div", "page-entry");
      if (index <= Math.min(step, 4)) node.classList.add("selected");
      node.append(element("strong", "", title), element("small", "", detail));
      walk.appendChild(node);
      if (index < nodes.length - 1) walk.appendChild(element("span", "page-arrow", "→"));
    });
    const permissions = element("div", "permission-row");
    ["text R-X", "rodata R--", "data RW-", "user U"].forEach((label, index) => {
      const chip = element("span", "permission-chip", label);
      if (step >= 3) chip.classList.add("enabled");
      permissions.appendChild(chip);
    });
    const satp = element("div", `satp-register ${step >= 4 ? "enabled" : ""}`);
    satp.textContent = step >= 4
      ? "satp = MODE(8) | ROOT_PPN；sfence.vma 完成"
      : "satp 尚未启用：先保证当前代码和栈有映射";
    wrapper.append(walk, permissions, satp);
    dom.visual_area.appendChild(wrapper);
  }

  function renderScheduler(step) {
    const wrapper = element("div", "scheduler");
    const order = ["A", "B", "C", "A", "B", "C"];
    const running = step > 0 && step < 7 ? order[step - 1] : null;
    const row = element("div", "task-row");
    ["A", "B", "C"].forEach((task) => {
      const card = element("div", "task-card");
      let status = running === task ? "Running" : "Ready";
      if (step >= 7 || (step >= 5 && task === "A") || (step >= 6 && task === "B")) status = "Exited";
      card.dataset.status = status.toLowerCase();
      card.append(
        element("strong", "", `Task ${task}`),
        element("span", "", status),
        element("small", "", "ra · sp · s0…s11")
      );
      row.appendChild(card);
    });
    const log = element("div", "switch-log");
    if (step === 0) log.textContent = "scheduler: A/B/C 均为 Ready";
    else if (step >= 7) log.textContent = "所有任务 Exited，调度器返回";
    else log.textContent = `${order[Math.max(0, step - 2)] || "scheduler"} yield/exit → __switch → ${running}`;
    wrapper.append(row, log);
    dom.visual_area.appendChild(wrapper);
  }

  function renderPrivilege(step) {
    const wrapper = element("div", "privilege-visual");
    const lanes = [
      ["S-mode 准备", "sepc · SPP=0 · SPIE=1 · sscratch"],
      ["U-mode", "用户代码 / 用户栈"],
      ["Trap 入口", "ecall · stvec · 内核 trap 栈"],
      ["Syscall", "a7=id · a0…a5=args · a0=return"],
      ["返回/退出", "sepc += 4 · sret / exit"]
    ];
    lanes.forEach(([label, detail], index) => {
      const lane = element("div", "privilege-lane");
      lane.dataset.mode = index === 1 ? "user" : "supervisor";
      if (index === Math.min(step, lanes.length - 1)) lane.classList.add("active");
      if (index < step) lane.classList.add("done");
      lane.append(element("span", "lane-label", label), element("span", "lane-detail", detail));
      wrapper.appendChild(lane);
    });
    dom.visual_area.appendChild(wrapper);
  }

  function renderFilesystem(step) {
    const wrapper = element("div", "fs-visual");
    const path = element("div", "io-stack");
    [
      ["U-mode", "open / write / read / close"],
      ["syscall", "Trap + ABI"],
      ["fd table", "fd 3 · offset"],
      ["SimpleFs", "打开状态与错误规则"],
      ["RamDevice", "64 bytes @ offset"]
    ].forEach(([title, detail], index) => {
      const node = element("div", "io-node");
      if (index <= Math.min(step, 4)) node.classList.add("active");
      node.append(element("strong", "", title), element("small", "", detail));
      path.appendChild(node);
    });
    const bytes = element("div", "byte-panel");
    bytes.appendChild(element("span", "byte-panel-label", step >= 5 ? "读回验证" : "设备内容"));
    const strip = element("div", "byte-strip");
    ["L", "A", "B", "7", "·", "·", "·", "·"].forEach((value, index) => {
      const cell = element("span", `byte ${step >= 3 && index < 4 ? "written" : ""}`, step >= 3 ? value : "·");
      strip.appendChild(cell);
    });
    bytes.appendChild(strip);
    const fd = element("div", "fd-status");
    if (step < 2) fd.textContent = "fd 3：尚未打开";
    else if (step === 2 || step === 3 || step === 4) fd.textContent = `fd 3：open · offset ${step >= 3 ? 4 : 0}`;
    else fd.textContent = "fd 3：closed · 内容一致";
    bytes.appendChild(fd);
    wrapper.append(path, bytes);
    dom.visual_area.appendChild(wrapper);
  }

  function renderSimulation(stage) {
    const step = Math.min(state.manualSteps[stage.id] || 0, stage.steps.length - 1);
    dom.visual_area.innerHTML = "";
    if (stage.visual === "flow") renderFlow(stage, step);
    if (stage.visual === "memory") renderMemory(step);
    if (stage.visual === "paging") renderPaging(step);
    if (stage.visual === "scheduler") renderScheduler(step);
    if (stage.visual === "privilege") renderPrivilege(step);
    if (stage.visual === "filesystem") renderFilesystem(step);

    dom.panel_controls.innerHTML = "";
    const next = element("button", "button button-primary", "单步推演");
    next.type = "button";
    next.addEventListener("click", () => advanceSimulation(stage.id));
    const reset = element("button", "button", "重置结构");
    reset.type = "button";
    reset.addEventListener("click", () => {
      state.manualSteps[stage.id] = 0;
      renderStage();
    });
    const counter = element("span", "step-counter", `${step + 1} / ${stage.steps.length} · ${stage.steps[step].title}`);
    dom.panel_controls.append(next, reset, counter);
  }

  function advanceSimulation(stageId) {
    const stage = stages[stageIndexById[stageId]];
    const current = state.manualSteps[stageId] || 0;
    state.manualSteps[stageId] = (current + 1) % stage.steps.length;
    renderStage();
  }

  function renderStage(runtimeEvent = null) {
    const stage = stages[state.stageIndex];
    renderTimeline();
    renderBranchFit(state.stageIndex);
    dom.stage_label.textContent = stage.label;
    dom.stage_title.textContent = stage.title;
    dom.stage_summary.textContent = stage.summary;
    dom.stage_objective.textContent = stage.objective;
    dom.execution_heading.textContent = stage.title;
    dom.explanation.textContent = runtimeEvent
      ? `真实证据：${runtimeEvent.detail || runtimeEvent.raw || runtimeEvent.step}。页面只推进到实际观察到的位置。`
      : stage.explanation;

    dom.concept_list.innerHTML = "";
    stage.concepts.forEach((concept) => dom.concept_list.appendChild(element("span", "concept-pill", concept)));
    renderList(dom.prerequisite_list, stage.prerequisites);
    renderList(dom.invariant_list, stage.invariants);

    dom.source_links.innerHTML = "";
    stage.links.forEach(([name, filePath]) => {
      const link = element("a", "", `↗ ${name}`);
      link.href = sourceHref(filePath);
      dom.source_links.appendChild(link);
    });

    const progress = state.progress[stage.id];
    const status = progress?.status || baseStageStatus(state.stageIndex);
    dom.status_chip.textContent = runtimeEvent
      ? `${statusLabel(status)} · ${runtimeEvent.step.replaceAll("-", " → ")}`
      : statusLabel(status);
    dom.status_chip.dataset.status = status;
    renderSimulation(stage);
    renderTasks(stage);
    renderFramework();
    renderMatrix();
  }

  function setStage(index, runtimeEvent = null) {
    state.stageIndex = (index + stages.length) % stages.length;
    renderStage(runtimeEvent);
  }

  function renderDimensionTabs() {
    dom.dimension_tabs.innerHTML = "";
    dimensions.forEach((dimension) => {
      const button = element("button", "dimension-tab", dimension.label);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(dimension.id === state.activeDimension));
      button.addEventListener("click", () => {
        state.activeDimension = dimension.id;
        renderDimensionTabs();
        renderFramework();
      });
      dom.dimension_tabs.appendChild(button);
    });
  }

  function renderFramework() {
    const dimension = dimensions.find((item) => item.id === state.activeDimension) || dimensions[0];
    const selectedId = stages[state.stageIndex].id;
    dom.dimension_description.textContent = dimension.description;
    dom.dimension_question.textContent = dimension.question;
    dom.dimension_insight.textContent = dimension.insight;
    dom.framework_canvas.innerHTML = "";
    dimension.nodes.forEach((item, index) => {
      const button = element("button", "framework-node");
      button.type = "button";
      const related = item.labs.includes(selectedId);
      const primary = item.labs[0] === selectedId;
      if (related) button.classList.add(primary ? "current" : "related");
      button.append(
        element("span", "framework-index", String(index + 1).padStart(2, "0")),
        element("strong", "", item.title),
        element("small", "", item.detail),
        element("span", "framework-labs", item.labs.map((id) => stages[stageIndexById[id]].label).join(" · "))
      );
      button.addEventListener("click", () => {
        const target = item.labs.includes(selectedId) ? selectedId : item.labs[0];
        setStage(stageIndexById[target]);
      });
      dom.framework_canvas.appendChild(button);
    });
  }

  function renderMatrix() {
    const table = dom.knowledge_matrix;
    const head = table.querySelector("thead");
    const body = table.querySelector("tbody");
    head.innerHTML = "";
    body.innerHTML = "";
    const row = document.createElement("tr");
    row.appendChild(element("th", "", "观察维度"));
    stages.forEach((stage) => row.appendChild(element("th", "", stage.label)));
    head.appendChild(row);

    matrixRows.forEach((matrixRow) => {
      const tr = document.createElement("tr");
      tr.appendChild(element("th", "", matrixRow.label));
      matrixRow.cells.forEach((value, index) => {
        const td = document.createElement("td");
        if (value) {
          const button = element("button", "matrix-cell", value);
          button.type = "button";
          button.dataset.status = stageStatus(stages[index], index);
          if (index === state.stageIndex) button.classList.add("selected");
          button.addEventListener("click", () => setStage(index));
          td.appendChild(button);
        } else {
          td.textContent = "—";
          td.className = "matrix-empty";
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function updateTaskProgress(progress, event) {
    const taskMatch = event.step.match(/^task-(\d+)-(pass|todo|evidence)$/);
    if (!taskMatch) return;
    const task = Number(taskMatch[1]);
    const completed = new Set(progress.completedTasks || []);
    const todo = new Set(progress.todoTasks || []);
    if (taskMatch[2] === "pass") {
      completed.add(task);
      todo.delete(task);
    }
    if (taskMatch[2] === "todo") todo.add(task);
    progress.completedTasks = [...completed];
    progress.todoTasks = [...todo];
  }

  function recordEvent(event) {
    state.recentEvents.unshift(event);
    state.recentEvents = state.recentEvents.slice(0, 16);
    dom.last_event.textContent = `最近证据：${stages[stageIndexById[event.lab]]?.label || event.lab} · ${event.detail || event.step}`;
  }

  function applyRuntimeEvent(event, shouldRender = true) {
    if (!event || !Object.hasOwn(stageIndexById, event.lab)) return;
    stopAuto();
    const index = stageIndexById[event.lab];
    const stage = stages[index];
    const progress = state.progress[event.lab] || {
      status: "running",
      completedTasks: [],
      todoTasks: []
    };
    progress.status = event.status || "running";
    if (event.status === "pass" && event.step !== "pass" && /^task-/.test(event.step)) {
      progress.status = state.progress[event.lab]?.status || "running";
    }
    if (event.step === "pass") progress.status = "pass";
    updateTaskProgress(progress, event);
    progress.lastEvent = event;
    state.progress[event.lab] = progress;

    const mapped = stage.eventSteps[event.step];
    if (mapped !== undefined) state.manualSteps[event.lab] = mapped;
    else {
      const taskMatch = event.step.match(/^task-(\d+)-/);
      if (taskMatch) {
        state.manualSteps[event.lab] = Math.min(Number(taskMatch[1]), stage.steps.length - 1);
      }
    }
    recordEvent(event);
    state.stageIndex = index;
    if (shouldRender) {
      renderEventFeed();
      renderStage(event);
    }
  }

  function renderEventFeed() {
    dom.runtime_feed.innerHTML = "";
    if (state.recentEvents.length === 0) {
      dom.runtime_feed.appendChild(element("li", "empty-state", "尚未收到实验事件。"));
      return;
    }
    state.recentEvents.forEach((event) => {
      const item = element("li", "runtime-event");
      item.dataset.status = event.status || "running";
      const stage = stages[stageIndexById[event.lab]];
      item.append(
        element("span", "event-sequence", event.sequence ? `#${event.sequence}` : "manual"),
        element("strong", "", stage?.label || event.lab),
        element("span", "", event.detail || event.step),
        element("small", "", event.source === "tagged" ? "显式遥测" : "串口兼容解析")
      );
      dom.runtime_feed.appendChild(item);
    });
  }

  function appendConsole(item) {
    state.consoleLines.push(item);
    state.consoleLines = state.consoleLines.slice(-60);
    renderConsole();
  }

  function renderConsole() {
    const code = dom.console_output.querySelector("code");
    if (state.consoleLines.length === 0) {
      code.textContent = "等待本地桥接器输出…";
      dom.console_channel.textContent = "idle";
      return;
    }
    code.textContent = state.consoleLines.map((item) => item.line).join("\n");
    dom.console_channel.textContent = state.consoleLines[state.consoleLines.length - 1].channel || "serial";
    dom.console_output.scrollTop = dom.console_output.scrollHeight;
  }

  function applyContext(context, jumpToTarget = true) {
    state.context = context;
    dom.branch_name.textContent = context?.branch || "unknown";
    dom.branch_variant.textContent = context?.variantLabel || "未知";
    dom.branch_lab.textContent = context?.lab ? stages[stageIndexById[context.lab]]?.label : "自定义";
    if (jumpToTarget && context?.stageIndex !== null && context?.stageIndex !== undefined) {
      state.stageIndex = context.stageIndex;
    }
    renderTimeline();
    renderStage();
    syncFeedbackContext();
  }

  function syncFeedbackContext() {
    window.OsFeedback?.setContext({
      branch: state.context?.branch,
      commit: state.context?.commit,
      lab: state.context?.lab,
      variant: state.context?.variant,
      runStatus: state.runState.detail || state.runState.phase
    });
  }

  function renderRunState() {
    const current = state.runState;
    dom.run_state.textContent = current.detail || current.phase;
    dom.run_current.disabled = !state.live || current.running;
    dom.stop_current.disabled = !state.live || !current.running || current.phase === "stopping";
    dom.run_current.textContent = current.running ? "当前运行进行中…" : "构建并运行当前分支";
    dom.runtime_hint.textContent = current.phase === "error"
      ? "查看下方构建/串口输出定位问题；修复后可再次运行。"
      : "切换 Git 分支后页面会自动更新；点击按钮重新构建该分支。";
    syncFeedbackContext();
  }

  function setConnection(text, connected) {
    dom.connection_status.textContent = text;
    dom.connection_status.classList.toggle("connected", connected);
    dom.live_dot.classList.toggle("connected", connected);
  }

  function resetRunEvidence() {
    state.progress = {};
    state.recentEvents = [];
    state.consoleLines = [];
    renderEventFeed();
    renderConsole();
  }

  function handleSocketMessage(message) {
    if (message.type === "history") {
      state.runState = message.runState || state.runState;
      applyContext(message.context, true);
      state.recentEvents = [];
      state.consoleLines = message.console || [];
      (message.events || []).forEach((event) => applyRuntimeEvent(event, false));
      renderEventFeed();
      renderConsole();
      renderRunState();
      renderStage(state.recentEvents[0] || null);
    }
    if (message.type === "branch-change") {
      resetRunEvidence();
      applyContext(message.context, true);
      dom.last_event.textContent = `已检测到分支切换：${message.previous.branch} → ${message.context.branch}`;
    }
    if (message.type === "run-start") {
      resetRunEvidence();
      applyContext(message.context, true);
      dom.last_event.textContent = `开始运行 ${message.context.branch}，等待真实 marker`;
    }
    if (message.type === "run-state") {
      state.runState = message.state;
      renderRunState();
    }
    if (message.type === "console") appendConsole(message);
    if (message.type === "telemetry") applyRuntimeEvent(message);
    if (message.type === "run-error") {
      dom.last_event.textContent = `运行失败：${message.message}`;
    }
    if (message.type === "run-end") {
      dom.last_event.textContent = message.stopped
        ? `已停止 ${message.context.branch}，可以切换或重新运行分支`
        : `QEMU 运行结束：exit code ${message.exitCode}`;
    }
  }

  function connectTelemetry() {
    if (!["http:", "https:"].includes(window.location.protocol)) {
      setConnection("离线知识模式：请用启动脚本进入实时模式", false);
      renderRunState();
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    try {
      state.socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    } catch (_) {
      setConnection("本地桥接器不可用：仍可手动推演", false);
      return;
    }

    state.socket.addEventListener("open", () => {
      state.live = true;
      setConnection("实时连接：正在跟踪 Git 分支与 QEMU", true);
      renderRunState();
    });
    state.socket.addEventListener("message", (raw) => {
      try {
        handleSocketMessage(JSON.parse(raw.data));
      } catch (_) {
        setConnection("收到无法识别的本地事件", false);
      }
    });
    state.socket.addEventListener("close", () => {
      state.live = false;
      setConnection("实时连接已断开：保留手动推演", false);
      renderRunState();
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = window.setTimeout(connectTelemetry, 1800);
    });
    state.socket.addEventListener("error", () => {
      setConnection("本地桥接器暂不可用", false);
    });
  }

  async function runCurrentBranch() {
    dom.run_current.disabled = true;
    try {
      const response = await fetch("/api/run", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      dom.runtime_hint.textContent = `已请求运行 ${result.context.branch}。`;
    } catch (error) {
      dom.runtime_hint.textContent = `无法启动：${error.message}`;
      dom.run_current.disabled = false;
    }
  }

  async function stopCurrentRun() {
    dom.stop_current.disabled = true;
    try {
      const response = await fetch("/api/stop", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      dom.runtime_hint.textContent = "已请求停止当前构建或 QEMU 进程。";
    } catch (error) {
      dom.runtime_hint.textContent = `无法停止：${error.message}`;
      renderRunState();
    }
  }

  function stopAuto() {
    if (!state.autoTimer) return;
    window.clearInterval(state.autoTimer);
    state.autoTimer = null;
    dom.auto_play.textContent = "自动讲解";
    dom.auto_play.setAttribute("aria-pressed", "false");
  }

  function toggleAuto() {
    if (state.autoTimer) {
      stopAuto();
      return;
    }
    dom.auto_play.textContent = "暂停讲解";
    dom.auto_play.setAttribute("aria-pressed", "true");
    state.autoTimer = window.setInterval(() => {
      const stage = stages[state.stageIndex];
      const step = state.manualSteps[stage.id] || 0;
      if (step < stage.steps.length - 1) {
        state.manualSteps[stage.id] = step + 1;
        renderStage();
      } else {
        state.stageIndex = (state.stageIndex + 1) % stages.length;
        state.manualSteps[stages[state.stageIndex].id] = 0;
        renderStage();
      }
    }, 1500);
  }

  dom.previous_stage.addEventListener("click", () => setStage(state.stageIndex - 1));
  dom.next_stage.addEventListener("click", () => setStage(state.stageIndex + 1));
  dom.auto_play.addEventListener("click", toggleAuto);
  dom.run_current.addEventListener("click", runCurrentBranch);
  dom.stop_current.addEventListener("click", stopCurrentRun);
  dom.clear_events.addEventListener("click", () => {
    state.recentEvents = [];
    renderEventFeed();
  });

  window.OsFeedback?.initFeedbackCenter();
  renderDimensionTabs();
  renderEventFeed();
  renderConsole();
  renderRunState();
  setStage(0);
  connectTelemetry();
})();
