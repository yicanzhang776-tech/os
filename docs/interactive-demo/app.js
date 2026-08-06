(() => {
  "use strict";

  const PREDICTION_STORAGE_KEY = "os-demo.pending-prediction.v1";
  const STABLE_DIAGNOSTIC_OUTPUT = /^\[(?:P0|Lab[1-7]|OS_DEMO)\](?:\s|$)|cargo build failed|could not compile|Linux run preflight failed|Missing dependency|Rust target|QEMU could not start|spawn\s+qemu-system-riscv64\s+ENOENT|page fault|access fault|panic|out of (?:physical |page-table )?frames|no (?:free )?(?:frame|page frame)|frame allocation|allocator exhausted|could not allocate (?:root page table|test frame)|file (?:open|write|read|close) failed|invalid (?:user )?(?:read|write|verification) buffer|file I\/O was not verified/i;

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
      eventSteps: {
        start: 0, "print-line": 0, "sbi-ecall": 3, "opensbi-console": 4,
        "uart-write": 5, "console-available": 5, pass: 5, "task-1-pass": 1, "task-2-pass": 4
      }
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
        start: 0, "stvec-installed": 0, "breakpoint-triggered": 1, "trap-enter": 2,
        "scause-read": 3, "breakpoint-decoded": 3, "sepc-advanced": 4,
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
      eventSteps: {
        start: 0, "task-1-pass": 1, "allocator-ready": 2, "task-2-pass": 3,
        "frame-allocated": 3, "frame-freed": 4, "frame-reused": 5,
        "frame-checks-start": 3, "frame-checks-pass": 5, pass: 5
      }
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
        "page-table-built": 2, "pte-written": 2, "task-2-pass": 2, "text-mapped": 3, "rodata-mapped": 3,
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
        start: 0, "task-created": 0, "scheduler-ready": 0, "task-1-pass": 0, "task-2-pass": 1,
        "yield-called": 1, "context-switched": 1,
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
        "user-mode-entered": 1, "user-ecall": 2, "syscall-dispatched": 3,
        "task-2-pass": 3, "console-write": 3, "syscall-yield": 3,
        "user-return": 2, "user-exit": 4, pass: 5
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
        { key: "sequence-console", title: "启动并建立观察通道", detail: "QEMU → OpenSBI → kernel_main → SBI console", labs: ["p0", "lab1"] },
        { key: "sequence-trap", title: "可控地打断与返回", detail: "ebreak → stvec → TrapFrame → sret", labs: ["lab2"] },
        { key: "sequence-memory", title: "获得并组织内存", detail: "页帧 → 三级页表 → satp", labs: ["lab3", "lab4"] },
        { key: "sequence-schedule", title: "复用 CPU 时间", detail: "yield → scheduler → __switch", labs: ["lab5"] },
        { key: "sequence-privilege", title: "跨越用户/内核边界", detail: "sret → U-mode → ecall → dispatch", labs: ["lab6"] },
        { key: "sequence-file", title: "完成用户文件 I/O", detail: "syscall → fd → SimpleFs → RamDevice", labs: ["lab7"] }
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
    "auto-play", "clear-events", "prediction-form", "prediction-build", "prediction-run",
    "prediction-pass", "prediction-event-options", "prediction-reasoning", "save-prediction",
    "prediction-status", "prediction-comparison-summary", "prediction-correct-list",
    "prediction-omission-list", "prediction-missing-list", "prediction-opposite-list",
    "prediction-extra-list", "prediction-unknown-list", "diagnostics-summary", "diagnostics-list", "save-run",
    "export-run-json", "export-run-markdown", "import-run-trigger", "import-run-file",
    "run-transfer-status",
    "saved-run-select", "replay-start", "replay-play-pause", "replay-speed",
    "timeline-status-filter", "timeline-source-filter", "timeline-lab-filter",
    "timeline-step-filter", "timeline-keyword-filter", "timeline-clear-filters",
    "replay-previous", "replay-next", "replay-first-failure", "replay-first-difference",
    "timeline-summary",
    "replay-status", "replay-timeline", "starter-run-select", "solution-run-select",
    "compare-runs", "comparison-summary", "comparison-list", "event-detail-panel",
    "event-detail-title", "event-detail-status", "event-detail-explanation",
    "event-detail-code", "event-detail-symbol", "event-detail-knowledge",
    "event-detail-cause", "event-detail-effect", "event-detail-next", "event-detail-raw",
    "event-state-status", "event-state-list", "state-comparison", "state-comparison-status",
    "starter-state-list", "solution-state-list", "same-state-list", "changed-state-list",
    "starter-only-state-list", "solution-only-state-list", "insufficient-state-list",
    "presentation-mode-toggle", "presentation-toolbar", "presentation-import",
    "presentation-reset", "presentation-fullscreen", "presentation-exit",
    "presentation-status"
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
    prediction: null,
    lastPredictionAssessment: "",
    activeRun: null,
    completedRun: null,
    savedRuns: window.OsRunHistory?.loadRuns(browserLocalStorage()) || [],
    replay: { run: null, index: -1 },
    timelineController: null,
    selectedEvent: null,
    selectedKnowledgeNode: null,
    autoTimer: null,
    reconnectTimer: null,
    presentation: window.OsPresentationMode?.loadPresentationState(
      browserSessionStorage(),
      window.location.search
    ) || {
      enabled: false,
      lab: "lab1",
      runId: null,
      replayIndex: -1,
      dimension: "sequence"
    },
    presentationReady: false
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

  function browserSessionStorage() {
    try {
      return window.sessionStorage;
    } catch (_) {
      return null;
    }
  }

  function browserLocalStorage() {
    try {
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function presentationEnabled() {
    return state.presentation?.enabled === true;
  }

  function setPresentationStatus(message, status = "info") {
    if (!dom.presentation_status) return;
    dom.presentation_status.textContent = message;
    dom.presentation_status.dataset.status = status;
  }

  function persistPresentationState(patch = {}) {
    const api = window.OsPresentationMode;
    if (!api) return;
    state.presentation = api.updatePresentationState(state.presentation, patch);
    api.savePresentationState(browserSessionStorage(), state.presentation);
  }

  function updatePresentationUrl(enabled, lab = null) {
    try {
      const url = new URL(window.location.href);
      if (enabled) {
        url.searchParams.set("mode", "presentation");
        if (window.OsPresentationMode?.recommendedPresentation(lab)) {
          url.searchParams.set("lab", lab);
        } else {
          url.searchParams.delete("lab");
        }
        url.searchParams.delete("run");
      } else {
        url.searchParams.delete("mode");
        url.searchParams.delete("lab");
        url.searchParams.delete("run");
      }
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {
      // file: pages and privacy-restricted browsers may reject URL history changes.
    }
  }

  function updateFullscreenControl() {
    if (!dom.presentation_fullscreen) return;
    const active = Boolean(document.fullscreenElement);
    const supported = typeof document.documentElement.requestFullscreen === "function"
      && typeof document.exitFullscreen === "function";
    dom.presentation_fullscreen.disabled = !supported;
    dom.presentation_fullscreen.setAttribute("aria-pressed", String(active));
    dom.presentation_fullscreen.textContent = active ? "退出全屏" : "进入全屏";
  }

  function syncPresentationUi() {
    const enabled = presentationEnabled();
    if (enabled) document.documentElement.dataset.mode = "presentation";
    else delete document.documentElement.dataset.mode;
    if (dom.presentation_toolbar) dom.presentation_toolbar.hidden = !enabled;
    if (dom.presentation_mode_toggle) {
      dom.presentation_mode_toggle.setAttribute("aria-pressed", String(enabled));
      dom.presentation_mode_toggle.textContent = enabled ? "退出演示模式" : "进入演示模式";
    }
    updateFullscreenControl();
    renderRunState();
  }

  function disconnectPresentationTelemetry() {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    const socket = state.socket;
    state.socket = null;
    state.live = false;
    if (socket && socket.readyState < 2) socket.close();
    setConnection("演示模式：只展示知识地图与本机运行记录", false);
  }

  function setPresentationMode(enabled, options = {}) {
    const target = enabled === true;
    stopAuto();
    state.timelineController?.pause();
    const requestedLab = options.lab || stages[state.stageIndex]?.id || state.presentation.lab;
    persistPresentationState({
      enabled: target,
      lab: requestedLab,
      runId: state.replay.run?.id || null,
      replayIndex: state.replay.index,
      dimension: state.activeDimension
    });
    if (options.updateUrl !== false) updatePresentationUrl(target, state.presentation.lab);
    if (target) {
      disconnectPresentationTelemetry();
      setPresentationStatus("演示模式已开启：不会运行 QEMU，也不会切换 Git 分支。", "success");
    } else {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        Promise.resolve(document.exitFullscreen()).catch(() => {});
      }
      setPresentationStatus("已返回普通模式。", "info");
    }
    syncPresentationUi();
    if (!target && options.reconnect !== false) connectTelemetry();
  }

  function clearPresentationComparison() {
    dom.starter_run_select.value = "";
    dom.solution_run_select.value = "";
    dom.comparison_list.innerHTML = "";
    dom.comparison_summary.textContent = "需要同一 Lab 的两次已保存运行。";
    renderStateComparison(null);
  }

  function recommendedPresentationDimension(lab) {
    return {
      lab1: "sequence",
      lab2: "protection",
      lab4: "resources",
      lab5: "sequence"
    }[lab] || "sequence";
  }

  function openPresentationLab(lab, options = {}) {
    const api = window.OsPresentationMode;
    const entry = api?.recommendedPresentation(lab);
    const targetIndex = stageIndexById[entry?.lab];
    if (!entry || targetIndex === undefined) {
      setPresentationStatus("该入口不是可用的推荐演示 Lab。", "error");
      return;
    }
    state.timelineController?.pause();
    stopAuto();
    state.activeDimension = recommendedPresentationDimension(entry.lab);
    renderDimensionTabs();
    setStage(targetIndex);
    const selected = api.selectRecommendedRuns(state.savedRuns, entry.lab);
    clearPresentationComparison();
    if (selected.replay) {
      dom.saved_run_select.value = selected.replay.id;
      loadRunIntoReplay(selected.replay);
      if (selected.starter) dom.starter_run_select.value = selected.starter.id;
      if (selected.solution) dom.solution_run_select.value = selected.solution.id;
      if (selected.starter && selected.solution) renderComparison();
      setPresentationStatus(
        `${entry.label}：已载入最近的本机运行记录；播放保持暂停。`,
        "success"
      );
    } else {
      dom.saved_run_select.value = "";
      clearReplayForLiveRun();
      resetRunEvidence();
      setPresentationStatus(`${entry.label}：本机暂无记录，当前显示知识预览。`, "info");
    }
    persistPresentationState({
      enabled: true,
      lab: entry.lab,
      runId: selected.replay?.id || null,
      replayIndex: -1,
      dimension: state.activeDimension
    });
    if (options.updateUrl !== false) updatePresentationUrl(true, entry.lab);
    if (options.scroll !== false) {
      document.getElementById("knowledge-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function resetPresentationView() {
    if (!presentationEnabled()) return;
    stopAuto();
    state.timelineController?.pause();
    dom.replay_speed.value = "1";
    state.timelineController?.setSpeed(1);
    const request = window.OsPresentationMode?.parsePresentationRequest(window.location.search);
    const targetLab = request?.lab || "lab1";
    state.presentation = window.OsPresentationMode?.resetPresentationState(true) || state.presentation;
    state.activeDimension = "sequence";
    state.manualSteps = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
    dom.saved_run_select.value = "";
    clearPresentationComparison();
    clearReplayForLiveRun();
    resetRunEvidence();
    renderDimensionTabs();
    setStage(stageIndexById[targetLab] ?? stageIndexById.lab1);
    persistPresentationState({ enabled: true, lab: targetLab, dimension: "sequence" });
    updatePresentationUrl(true, targetLab);
    setPresentationStatus("演示视图已重置；本机记录、预测和教学评价均未删除。", "success");
    document.getElementById("timeline-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function togglePresentationFullscreen() {
    if (!presentationEnabled()) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (typeof document.documentElement.requestFullscreen === "function") {
        await document.documentElement.requestFullscreen();
      } else {
        throw new Error("当前浏览器不支持全屏 API");
      }
    } catch (error) {
      setPresentationStatus(`无法切换全屏：${error.message}`, "error");
    } finally {
      updateFullscreenControl();
    }
  }

  function restorePresentationView() {
    const presentation = state.presentation;
    state.activeDimension = presentation.dimension;
    renderDimensionTabs();
    setStage(stageIndexById[presentation.lab] ?? stageIndexById.lab1);
    if (presentation.runId) {
      const run = state.savedRuns.find((item) => (
        item.id === presentation.runId && item.context?.lab === presentation.lab
      ));
      if (run) {
        dom.saved_run_select.value = run.id;
        loadRunIntoReplay(run);
        replayTo(Math.min(presentation.replayIndex, run.events.length - 1));
        setPresentationStatus("已从本次浏览器会话恢复本机运行记录；播放保持暂停。", "success");
      } else {
        persistPresentationState({ runId: null, replayIndex: -1 });
        setPresentationStatus("已恢复演示 Lab；原本选择的本机记录已不存在。", "info");
      }
    } else {
      setPresentationStatus("演示模式已开启：选择推荐入口或导入本机运行记录。", "info");
    }
  }

  function resolveEventKnowledge(event) {
    if (window.OsEventCatalog?.resolveEventKnowledge) {
      return window.OsEventCatalog.resolveEventKnowledge(event);
    }
    const raw = event && typeof event === "object" ? event : { raw: event };
    const detail = String(raw.detail || raw.raw || raw.step || "未提供事件内容").slice(0, 500);
    return {
      known: false,
      eventName: "未加载事件知识目录",
      explanation: detail,
      knowledge: "未登记知识节点",
      file: null,
      symbol: "未提供",
      cause: detail,
      effect: `保留原始状态：${raw.status || "unknown"}。`,
      nextEvents: [],
      knowledgeNode: null,
      raw: detail
    };
  }

  function knowledgeNodeTitle(key) {
    for (const dimension of dimensions) {
      const node = dimension.nodes.find((item) => item.key === key);
      if (node) return node.title;
    }
    return "未登记知识节点";
  }

  function syncEventKnowledge(event) {
    const knowledge = resolveEventKnowledge(event);
    state.selectedKnowledgeNode = knowledge.known ? knowledge.knowledgeNode : null;
    if (state.selectedKnowledgeNode) state.activeDimension = "sequence";
    return knowledge;
  }

  function sameRuntimeEvent(left, right) {
    if (left === right) return true;
    if (!left || !right) return false;
    if (left.sequence && right.sequence) {
      return left.sequence === right.sequence && left.lab === right.lab && left.step === right.step;
    }
    return left.lab === right.lab
      && left.step === right.step
      && left.status === right.status
      && left.timestamp === right.timestamp;
  }

  function selectedEventSequence() {
    const selected = state.selectedEvent;
    if (!selected) return { events: [], context: null };
    if (selected.scope === "时间线回放" && state.replay.run) {
      const index = Number.isInteger(selected.index) ? selected.index : state.replay.index;
      return {
        events: state.replay.run.events.slice(0, Math.max(0, index + 1)),
        context: state.replay.run.context
      };
    }

    const recent = [...state.recentEvents].reverse();
    const eventPools = [state.activeRun?.events, state.completedRun?.events, recent]
      .filter((events) => Array.isArray(events) && events.length);
    const candidates = eventPools.find((events) => events.some((event) => sameRuntimeEvent(event, selected.event)))
      || recent;
    let cutoff = candidates.findIndex((event) => sameRuntimeEvent(event, selected.event));
    if (cutoff < 0 && selected.event?.sequence) {
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        if (Number(candidates[index].sequence) <= Number(selected.event.sequence)) {
          cutoff = index;
          break;
        }
      }
    }
    if (cutoff < 0) cutoff = candidates.length - 1;
    return {
      events: candidates.slice(0, cutoff + 1),
      context: state.activeRun?.events === candidates
        ? state.activeRun.context
        : state.completedRun?.events === candidates
          ? state.completedRun.context
          : state.context
    };
  }

  function fieldStatusLabel(field) {
    return {
      known: "有明确事件证据",
      partial: "只有部分事件证据",
      insufficient: "没有足够运行证据"
    }[field?.status] || "没有足够运行证据";
  }

  function renderStateFieldList(container, snapshot, emptyText = "没有足够运行证据。") {
    container.innerHTML = "";
    if (!snapshot?.fields || !window.OsStateModel) {
      container.appendChild(element("li", "empty-state", emptyText));
      return;
    }
    Object.values(snapshot.fields).forEach((field) => {
      const item = element("li", "state-field");
      item.dataset.evidence = field.status;
      item.append(
        element("strong", "", field.label),
        element("span", "", window.OsStateModel.formatField(field)),
        element("small", "", `${fieldStatusLabel(field)}${field.evidence.length ? ` · ${field.evidence.join("、")}` : ""}`)
      );
      container.appendChild(item);
    });
  }

  function renderSelectedEventState() {
    if (!state.selectedEvent || !window.OsStateModel?.computeState) {
      dom.event_state_status.textContent = "选择事件后由事件序列重建。";
      renderStateFieldList(dom.event_state_list, null, "尚未选择运行事件。");
      return;
    }
    const selectedSequence = selectedEventSequence();
    const lab = state.selectedEvent.event?.lab || selectedSequence.context?.lab;
    const snapshot = window.OsStateModel.computeState(selectedSequence.events, {
      lab,
      variant: selectedSequence.context?.variant
    });
    renderStateFieldList(dom.event_state_list, snapshot);
    const notes = [`${snapshot.eventCount} 条有效事件`];
    if (snapshot.duplicateCount) notes.push(`忽略 ${snapshot.duplicateCount} 条重复事件`);
    if (snapshot.ignoredCount) notes.push(`忽略 ${snapshot.ignoredCount} 条无效或其他 Lab 事件`);
    dom.event_state_status.textContent = `${lab?.toUpperCase() || "未知 Lab"} · ${notes.join(" · ")}`;
  }

  function renderEventDetails() {
    const selected = state.selectedEvent;
    if (!selected) {
      dom.event_detail_panel.dataset.known = "empty";
      dom.event_detail_title.textContent = "选择一条事件查看完整解释";
      dom.event_detail_status.textContent = "等待时间线选择";
      dom.event_detail_explanation.textContent = "实时运行或回放时，点击任一事件即可查看代码位置、知识点、前因、状态变化和可能的后续事件。";
      dom.event_detail_code.textContent = "尚未选择";
      dom.event_detail_code.removeAttribute("href");
      dom.event_detail_symbol.textContent = "—";
      dom.event_detail_knowledge.textContent = "—";
      dom.event_detail_cause.textContent = "—";
      dom.event_detail_effect.textContent = "—";
      dom.event_detail_next.textContent = "—";
      dom.event_detail_raw.textContent = "{}";
      renderSelectedEventState();
      return;
    }

    const knowledge = resolveEventKnowledge(selected.event);
    dom.event_detail_panel.dataset.known = knowledge.known ? "known" : "fallback";
    dom.event_detail_title.textContent = knowledge.eventName;
    dom.event_detail_status.textContent = knowledge.known
      ? `${selected.scope} · 已登记事件`
      : `${selected.scope} · 原始信息安全降级`;
    dom.event_detail_explanation.textContent = knowledge.explanation;
    if (knowledge.file && window.OsEventCatalog?.isRepositoryPath(knowledge.file)) {
      dom.event_detail_code.textContent = knowledge.file;
      dom.event_detail_code.href = sourceHref(knowledge.file);
    } else {
      dom.event_detail_code.textContent = "未登记安全源码位置";
      dom.event_detail_code.removeAttribute("href");
    }
    dom.event_detail_symbol.textContent = knowledge.symbol;
    dom.event_detail_knowledge.textContent = knowledge.known
      ? `${knowledgeNodeTitle(knowledge.knowledgeNode)} · ${knowledge.knowledge}`
      : knowledge.knowledge;
    dom.event_detail_cause.textContent = knowledge.cause;
    dom.event_detail_effect.textContent = knowledge.effect;
    dom.event_detail_next.textContent = knowledge.nextEvents.length
      ? knowledge.nextEvents.map((next) => `${next.name} (${next.lab}:${next.step})`).join(" → ")
      : "当前目录没有登记后续事件。";
    dom.event_detail_raw.textContent = knowledge.raw;
    renderSelectedEventState();
  }

  function selectEventDetails(event, scope) {
    state.selectedEvent = { event, scope };
    syncEventKnowledge(event);
    if (Object.hasOwn(stageIndexById, event?.lab)) state.stageIndex = stageIndexById[event.lab];
    renderDimensionTabs();
    renderStage(event);
    renderEventFeed();
    renderReplayTimeline();
    renderEventDetails();
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
    const context = state.replay.run?.context || state.context;
    const targetStageIndex = context?.stageIndex ?? stageIndexById[context?.lab] ?? null;
    if (!context || targetStageIndex === null) return "neutral";
    if (context.variant === "complete") return "inherited";
    if (index < targetStageIndex) return "inherited";
    if (index > targetStageIndex) return "future";
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
    const context = state.replay.run?.context || state.context;
    const targetStageIndex = context?.stageIndex ?? stageIndexById[context?.lab] ?? null;
    if (!context || targetStageIndex === null) {
      dom.branch_fit.textContent = "知识总览";
      return;
    }
    if (index < targetStageIndex) dom.branch_fit.textContent = "前置能力";
    else if (index === targetStageIndex) dom.branch_fit.textContent = "当前分支目标";
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
    if (state.presentationReady && presentationEnabled()) {
      persistPresentationState({ lab: stages[state.stageIndex].id });
      updatePresentationUrl(true, stages[state.stageIndex].id);
    }
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
        if (state.presentationReady && presentationEnabled()) {
          persistPresentationState({ dimension: dimension.id });
        }
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
      if (dimension.id === "sequence" && item.key === state.selectedKnowledgeNode) {
        button.classList.add("event-current");
        button.setAttribute("aria-current", "true");
      }
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
      state.selectedEvent = { event, scope: "实时运行" };
      syncEventKnowledge(event);
      renderDimensionTabs();
      renderEventFeed();
      renderStage(event);
      renderEventDetails();
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
      if (state.selectedEvent?.scope === "实时运行" && state.selectedEvent.event === event) {
        item.dataset.selected = "true";
      }
      const stage = stages[stageIndexById[event.lab]];
      const knowledge = resolveEventKnowledge(event);
      const button = element("button", "event-row-button");
      button.type = "button";
      button.append(
        element("span", "event-sequence", event.sequence ? `#${event.sequence}` : "manual"),
        element("strong", "", stage?.label || event.lab),
        element("span", "", event.detail || event.step),
        element("small", "", `${knowledge.eventName} · ${event.source === "tagged" ? "显式遥测" : "串口兼容解析"}`)
      );
      button.addEventListener("click", () => selectEventDetails(event, "实时运行"));
      item.appendChild(button);
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

  function availablePredictionEvents(lab) {
    if (!lab || !window.OsEventCatalog?.EVENT_CATALOG) return [];
    return Object.values(window.OsEventCatalog.EVENT_CATALOG)
      .filter((entry) => entry.lab === lab && entry.step !== "pass");
  }

  function renderPredictionEventOptions(selectedKeys = []) {
    dom.prediction_event_options.innerHTML = "";
    const entries = availablePredictionEvents(state.context?.lab);
    if (!entries.length) {
      dom.prediction_event_options.appendChild(element("span", "", "当前分支没有可选择的 Lab 事件。"));
      return;
    }
    const selected = new Set(selectedKeys);
    entries.forEach((entry, index) => {
      const label = element("label", "prediction-event-option");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "prediction-events";
      input.value = entry.key;
      input.id = `prediction-event-${index}`;
      input.checked = selected.has(entry.key);
      const detail = element("span", "", entry.eventName);
      detail.appendChild(element("code", "", entry.step));
      label.htmlFor = input.id;
      label.append(input, detail);
      dom.prediction_event_options.appendChild(label);
    });
  }

  function setPredictionForm(prediction) {
    dom.prediction_build.value = prediction?.expectedBuild || "";
    dom.prediction_run.value = prediction?.expectedRun || "";
    dom.prediction_pass.value = typeof prediction?.expectedPass === "boolean"
      ? String(prediction.expectedPass)
      : "";
    dom.prediction_reasoning.value = prediction?.reasoning || "";
    renderPredictionEventOptions(prediction?.expectedEvents || []);
  }

  function selectedPredictionEvents() {
    return Array.from(
      dom.prediction_event_options.querySelectorAll('input[name="prediction-events"]:checked'),
      (input) => input.value
    );
  }

  function applyContext(context, jumpToTarget = true) {
    const previous = state.context;
    state.context = context;
    if (!previous || previous.branch !== context?.branch || previous.commit !== context?.commit) {
      state.prediction = loadStoredPrediction(context);
      state.lastPredictionAssessment = "";
      setPredictionForm(state.prediction);
      renderPredictionComparison(null);
    }
    dom.branch_name.textContent = context?.branch || "unknown";
    dom.branch_variant.textContent = context?.variantLabel || "未知";
    dom.branch_lab.textContent = context?.lab ? stages[stageIndexById[context.lab]]?.label : "自定义";
    if (jumpToTarget && context?.stageIndex !== null && context?.stageIndex !== undefined) {
      state.stageIndex = context.stageIndex;
    }
    renderTimeline();
    renderStage();
    renderPredictionGate();
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

  function resultLabel(result) {
    return {
      pass: "出现 PASS",
      todo: "停在 TODO",
      fail: "构建或运行失败",
      timeout: "QEMU 超时",
      finished: "正常退出但没有目标 PASS",
      stopped: "被手动停止"
    }[result] || result;
  }

  function loadStoredPrediction(context) {
    const storage = browserLocalStorage();
    if (window.OsPredictionModel?.loadPrediction) {
      return window.OsPredictionModel.loadPrediction(
        storage,
        context,
        PREDICTION_STORAGE_KEY
      );
    }
    try {
      if (!storage) return null;
      const prediction = JSON.parse(storage.getItem(PREDICTION_STORAGE_KEY) || "null");
      if (prediction?.branch !== context?.branch || prediction?.commit !== context?.commit) return null;
      if (!["pass", "todo", "fail"].includes(prediction.expectedResult)) return null;
      if (!String(prediction.reasoning || "").trim()) return null;
      return prediction;
    } catch (_) {
      return null;
    }
  }

  function storePrediction(prediction) {
    const storage = browserLocalStorage();
    if (window.OsPredictionModel?.storePrediction) {
      window.OsPredictionModel.storePrediction(
        storage,
        prediction,
        PREDICTION_STORAGE_KEY
      );
      return;
    }
    try {
      if (!storage) return;
      if (prediction) {
        storage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(prediction));
      } else {
        storage.removeItem(PREDICTION_STORAGE_KEY);
      }
    } catch (_) {
      // The demo remains usable when browser storage is unavailable.
    }
  }

  function predictionMatchesContext() {
    if (window.OsPredictionModel?.predictionMatchesContext) {
      return window.OsPredictionModel.predictionMatchesContext(state.prediction, state.context);
    }
    return Boolean(
      state.prediction
      && state.context
      && state.prediction.branch === state.context.branch
      && state.prediction.commit === state.context.commit
    );
  }

  function renderPredictionGate() {
    const ready = predictionMatchesContext();
    if (ready) {
      const expectedRun = {
        todo: "停在 TODO",
        complete: "完成实验",
        failure: "运行失败",
        timeout: "QEMU 超时"
      }[state.prediction.expectedRun];
      dom.prediction_status.textContent = state.prediction.migratedFrom === 1 && !expectedRun
        ? `已读取旧版预测：${resultLabel(state.prediction.expectedResult)}。现在可以运行或重新填写结构化预测。`
        : `已保存结构化预测：${expectedRun || resultLabel(state.prediction.expectedResult)}。现在可以运行。`;
      dom.prediction_status.dataset.status = "ready";
    } else if (state.lastPredictionAssessment) {
      dom.prediction_status.textContent = state.lastPredictionAssessment;
      dom.prediction_status.dataset.status = "assessed";
    } else {
      dom.prediction_status.textContent = "尚未保存当前分支的预测。";
      dom.prediction_status.dataset.status = "waiting";
    }
  }

  function formatRunLabel(run) {
    const time = new Date(run.startedAt).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${run.context.branch} · ${resultLabel(run.result)} · ${time}`;
  }

  function fillRunSelect(select, runs, placeholder) {
    const selected = select.value;
    select.innerHTML = "";
    const empty = element("option", "", placeholder);
    empty.value = "";
    select.appendChild(empty);
    runs.forEach((run) => {
      const option = element("option", "", formatRunLabel(run));
      option.value = run.id;
      select.appendChild(option);
    });
    if (runs.some((run) => run.id === selected)) select.value = selected;
  }

  function renderSavedRuns() {
    fillRunSelect(dom.saved_run_select, state.savedRuns, "选择一次已保存运行");
    fillRunSelect(
      dom.starter_run_select,
      state.savedRuns.filter((run) => run.context.variant === "starter"),
      "选择 starter 运行"
    );
    fillRunSelect(
      dom.solution_run_select,
      state.savedRuns.filter((run) => run.context.variant === "solution"),
      "选择 solution 运行"
    );
  }

  function renderPredictionComparisonList(container, items, kind, emptyText) {
    container.innerHTML = "";
    if (!items?.length) {
      container.appendChild(element("li", "empty-state", emptyText));
      return;
    }
    items.forEach((item) => {
      const row = element("li", "prediction-comparison-item", item.text || String(item));
      row.dataset.kind = kind;
      container.appendChild(row);
    });
  }

  function renderPredictionComparison(assessment) {
    if (!assessment) {
      dom.prediction_comparison_summary.textContent = "运行结束后根据真实构建和 QEMU 证据自动核对。";
      dom.prediction_comparison_summary.dataset.status = "waiting";
      renderPredictionComparisonList(dom.prediction_correct_list, [], "correct", "尚未完成运行。");
      renderPredictionComparisonList(dom.prediction_omission_list, [], "omission", "尚未完成运行。");
      renderPredictionComparisonList(dom.prediction_missing_list, [], "missing", "尚未完成运行。");
      renderPredictionComparisonList(dom.prediction_opposite_list, [], "opposite", "尚未完成运行。");
      renderPredictionComparisonList(dom.prediction_extra_list, [], "extra", "尚未完成运行。");
      renderPredictionComparisonList(dom.prediction_unknown_list, [], "unknown", "尚未完成运行。");
      return;
    }
    dom.prediction_comparison_summary.textContent = `${assessment.overallLabel} · ${assessment.actual.evidenceCount} 条有效 QEMU 事件证据`;
    dom.prediction_comparison_summary.dataset.status = assessment.overall;
    renderPredictionComparisonList(dom.prediction_correct_list, assessment.correct, "correct", "没有可确认的一致项。");
    renderPredictionComparisonList(dom.prediction_omission_list, assessment.omissions, "omission", "没有发现预测遗漏。");
    renderPredictionComparisonList(dom.prediction_missing_list, assessment.missing, "missing", "没有预计后未出现的事件。");
    renderPredictionComparisonList(dom.prediction_opposite_list, assessment.opposites, "opposite", "没有发现相反结果。");
    renderPredictionComparisonList(dom.prediction_extra_list, assessment.extraEvents, "extra", "没有额外关键事件。");
    renderPredictionComparisonList(dom.prediction_unknown_list, assessment.unknown, "unknown", "没有无法判断的项目。");
  }

  function stableDiagnosticLine(value) {
    return String(value?.line ?? value ?? "")
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 500);
  }

  function collectStableOutput(values) {
    if (!Array.isArray(values)) return [];
    return values
      .flatMap((value) => value && typeof value === "object" && value.channel === "build"
        ? []
        : [stableDiagnosticLine(value)])
      .filter((line) => line && STABLE_DIAGNOSTIC_OUTPUT.test(line))
      .slice(-60);
  }

  function captureRunOutput(message) {
    if (!state.activeRun) return;
    const [line] = collectStableOutput([message]);
    if (!line) return;
    state.activeRun.stableOutput = [...(state.activeRun.stableOutput || []), line].slice(-60);
  }

  function resetDiagnostics(message = "运行结束后根据本地规则与真实证据检查。") {
    if (!dom.diagnostics_summary || !dom.diagnostics_list) return;
    dom.diagnostics_summary.textContent = message;
    dom.diagnostics_summary.dataset.status = "waiting";
    dom.diagnostics_list.innerHTML = "";
    dom.diagnostics_list.appendChild(element("li", "empty-state", "尚未完成或载入运行。"));
  }

  function safeRepositoryPath(path) {
    const value = String(path || "");
    if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) return null;
    return /^[A-Za-z0-9._/-]+$/.test(value) ? value : null;
  }

  function diagnosticInputFromRun(run) {
    return {
      lab: run?.context?.lab,
      role: run?.context?.variant,
      buildResult: run?.lifecycle?.buildResult,
      events: Array.isArray(run?.events) ? run.events : [],
      serialOutput: [
        ...(Array.isArray(run?.stableOutput) ? run.stableOutput : []),
        run?.error || ""
      ],
      finalStatus: run?.result || run?.lifecycle?.runResult || "unknown"
    };
  }

  function diagnosticTextList(label, values) {
    const group = element("div", "diagnostic-detail-group");
    group.appendChild(element("p", "", label));
    const list = element("ul");
    (Array.isArray(values) ? values : []).forEach((value) => {
      list.appendChild(element("li", "", value));
    });
    group.appendChild(list);
    return group;
  }

  function diagnosticReferenceList(diagnostic) {
    const group = element("div", "diagnostic-detail-group");
    group.appendChild(element("p", "", "建议检查的代码文件或函数"));
    const list = element("ul");
    (diagnostic.codeLocations || diagnostic.checks || []).forEach((reference) => {
      const path = safeRepositoryPath(reference?.file);
      if (!path) return;
      const item = element("li");
      const link = element("a", "", path);
      link.href = sourceHref(path);
      item.append(link, element("span", "", reference?.symbol ? ` · ${reference.symbol}` : ""));
      list.appendChild(item);
    });
    if (!list.childElementCount) list.appendChild(element("li", "", "当前规则没有登记代码位置。"));
    group.appendChild(list);
    return group;
  }

  function diagnosticDocumentList(diagnostic) {
    const paths = [diagnostic.document, diagnostic.guideDocument]
      .map(safeRepositoryPath)
      .filter((path, index, items) => path && items.indexOf(path) === index);
    const group = element("div", "diagnostic-detail-group");
    group.appendChild(element("p", "", "对应实验文档"));
    const list = element("ul");
    paths.forEach((path) => {
      const item = element("li");
      const link = element("a", "", path);
      link.href = sourceHref(path);
      item.appendChild(link);
      list.appendChild(item);
    });
    if (!paths.length) list.appendChild(element("li", "", "当前规则没有登记实验文档。"));
    group.appendChild(list);
    return group;
  }

  function renderDiagnosticsInput(input, label = "本次运行") {
    if (!dom.diagnostics_summary || !dom.diagnostics_list) return [];
    if (!window.OsDiagnostics?.diagnose) {
      resetDiagnostics("本地诊断规则模块未加载；运行和回放仍可继续。");
      return [];
    }
    let diagnostics;
    try {
      diagnostics = window.OsDiagnostics.diagnose(input);
    } catch (_) {
      resetDiagnostics("诊断输入无法读取；运行和回放数据未被修改。");
      return [];
    }

    dom.diagnostics_list.innerHTML = "";
    if (!diagnostics.length) {
      dom.diagnostics_summary.textContent = `${label}：未发现当前证据可触发的诊断规则。`;
      dom.diagnostics_summary.dataset.status = "clear";
      dom.diagnostics_list.appendChild(element(
        "li",
        "empty-state",
        "规则未发现异常不等于系统绝对无错；证据不足时不会猜测。"
      ));
      return diagnostics;
    }

    const errorCount = diagnostics.filter((item) => item.severity === "error").length;
    const warningCount = diagnostics.filter((item) => item.severity === "warning").length;
    const infoCount = diagnostics.filter((item) => item.severity === "info").length;
    dom.diagnostics_summary.textContent = `${label}：${diagnostics.length} 条规则命中（错误 ${errorCount}、可能原因 ${warningCount}、教学提示 ${infoCount}）。`;
    dom.diagnostics_summary.dataset.status = errorCount ? "error" : warningCount ? "warning" : "info";

    diagnostics.forEach((diagnostic) => {
      const item = element("li", "diagnostic-item");
      item.dataset.severity = diagnostic.severity || "warning";
      item.append(
        element("h4", "", diagnostic.title || "规则诊断"),
        element("p", "diagnostic-certainty", diagnostic.certaintyText || (
          diagnostic.canDetermine
            ? "能够确定触发现象；具体根因仍需检查。"
            : "现有证据不足以定位根因，仅列出可能原因。"
        )),
        diagnosticTextList("触发证据", diagnostic.triggerEvidence || diagnostic.evidence),
        diagnosticTextList("可能原因", diagnostic.possibleCauses),
        diagnosticReferenceList(diagnostic),
        diagnosticDocumentList(diagnostic)
      );
      dom.diagnostics_list.appendChild(item);
    });
    return diagnostics;
  }

  function renderRunDiagnostics(run, label = "本次运行") {
    return renderDiagnosticsInput(diagnosticInputFromRun(run), label);
  }

  function renderPreflightDiagnostics(result) {
    const failedChecks = Array.isArray(result?.preflight?.checks)
      ? result.preflight.checks.filter((check) => check && check.ok === false)
      : [];
    const evidence = [result?.error || ""];
    failedChecks.forEach((check) => {
      evidence.push(`Linux run preflight failed: ${check.name}.`);
      if (check.detail) evidence.push(`${check.name}: ${check.detail}`);
    });
    return renderDiagnosticsInput({
      lab: state.context?.lab,
      role: state.context?.variant,
      buildResult: null,
      events: [],
      serialOutput: evidence,
      finalStatus: "preflight-failed"
    }, "Linux 环境检查");
  }

  function updateActiveRunLifecycle(message = {}) {
    if (!state.activeRun) return;
    const lifecycle = state.activeRun.lifecycle || (
      state.activeRun.lifecycle = { buildResult: null, runResult: null, completed: false }
    );
    if (["success", "failure"].includes(message.buildResult)) {
      lifecycle.buildResult = message.buildResult;
    }
    if (["running", "finished", "failure", "timeout", "stopped"].includes(message.runResult)) {
      lifecycle.runResult = message.runResult;
    }
    if (message.phase === "running") {
      lifecycle.buildResult = "success";
      lifecycle.runResult = "running";
    }
    if (["finished", "error", "stopped"].includes(message.phase)) lifecycle.completed = true;
  }

  function beginActiveRun(message) {
    clearReplayForLiveRun();
    const prediction = predictionMatchesContext() ? state.prediction : null;
    state.activeRun = {
      id: message.runId || `run-${message.timestamp || Date.now()}`,
      context: message.context || state.context,
      prediction,
      events: [],
      stableOutput: [],
      lifecycle: { buildResult: null, runResult: null, completed: false },
      startedAt: message.timestamp || Date.now()
    };
    state.prediction = null;
    storePrediction(null);
    setPredictionForm(null);
    state.completedRun = null;
    state.lastPredictionAssessment = "预测已锁定，正在等待真实运行结果。";
    dom.save_run.disabled = true;
    renderPredictionGate();
    renderEventDetails();
    renderPredictionComparison(null);
    resetDiagnostics("运行进行中；结束后再根据完整证据执行诊断。");
  }

  function captureRunEvent(event) {
    if (!state.activeRun || !event) return;
    if (event.runId && state.activeRun.id !== event.runId) return;
    state.activeRun.events.push(event);
  }

  function finishActiveRun(message) {
    if (!window.OsRunHistory) return;
    const active = state.activeRun || {
      id: message.runId || `run-${message.timestamp || Date.now()}`,
      context: message.context || state.context,
      prediction: null,
      events: [...state.recentEvents].reverse(),
      stableOutput: collectStableOutput(state.consoleLines),
      lifecycle: { buildResult: null, runResult: null, completed: false },
      startedAt: message.startedAt || message.timestamp || Date.now()
    };
    const lifecycle = {
      ...(active.lifecycle || {}),
      buildResult: ["success", "failure"].includes(message.buildResult)
        ? message.buildResult
        : active.lifecycle?.buildResult || null,
      runResult: ["running", "finished", "failure", "timeout", "stopped"].includes(message.runResult)
        ? message.runResult
        : active.lifecycle?.runResult || null,
      completed: true
    };
    state.completedRun = window.OsRunHistory.createRunRecord({
      ...active,
      lifecycle,
      endedAt: message.timestamp || Date.now(),
      exitCode: message.exitCode,
      stopped: message.stopped,
      error: message.message || ""
    });
    state.activeRun = null;
    dom.save_run.disabled = false;
    const assessment = state.completedRun.predictionAssessment;
    if (assessment) {
      state.lastPredictionAssessment = `${assessment.overallLabel}：已根据真实构建状态和 ${assessment.actual.evidenceCount} 条 QEMU 事件核对。`;
    } else {
      state.lastPredictionAssessment = `本次结果：${resultLabel(state.completedRun.result)}。此次运行没有保存学生预测。`;
    }
    renderPredictionComparison(assessment);
    renderRunDiagnostics(state.completedRun);
    renderPredictionGate();
    renderRunState();
  }

  function saveCompletedRun() {
    if (!state.completedRun || !window.OsRunHistory) return;
    try {
      const savedRuns = window.OsRunHistory.saveRun(browserLocalStorage(), state.completedRun);
      if (!savedRuns.some((run) => run.id === state.completedRun.id)) {
        throw new Error("浏览器本地存储不可用");
      }
      state.savedRuns = savedRuns;
      dom.save_run.disabled = true;
      dom.replay_status.textContent = `已保存 ${state.completedRun.context.branch} 的 ${state.completedRun.events.length} 个事件。`;
      renderSavedRuns();
    } catch (error) {
      dom.save_run.disabled = false;
      dom.replay_status.textContent = `保存失败：${error.message}`;
    }
  }

  function selectedTransferRun() {
    return state.savedRuns.find((run) => run.id === dom.saved_run_select.value)
      || state.completedRun
      || null;
  }

  function downloadRunFile(filename, content, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function setRunTransferStatus(message, status = "info") {
    dom.run_transfer_status.textContent = message;
    dom.run_transfer_status.dataset.status = status;
    if (presentationEnabled()) setPresentationStatus(message, status);
  }

  function exportSelectedRun(format) {
    const run = selectedTransferRun();
    if (!run || !window.OsRunTransfer) {
      setRunTransferStatus("请先保存或选择一次可导出的运行记录。", "error");
      return;
    }
    try {
      if (format === "markdown") {
        downloadRunFile(
          window.OsRunTransfer.runFilename(run, "md"),
          window.OsRunTransfer.buildRunMarkdown(run),
          "text/markdown;charset=utf-8"
        );
        setRunTransferStatus(`已在本地导出 ${run.id} 的 Markdown 运行总结。`, "success");
        return;
      }
      downloadRunFile(
        window.OsRunTransfer.runFilename(run, "json"),
        window.OsRunTransfer.serializeRunJson(run),
        "application/json;charset=utf-8"
      );
      setRunTransferStatus(`已在本地导出 ${run.id} 的 ${window.OsRunTransfer.RUN_SCHEMA_VERSION} JSON。`, "success");
    } catch (error) {
      setRunTransferStatus(`导出失败：${error.message}`, "error");
    }
  }

  async function importRunFile(file) {
    if (!file || !window.OsRunTransfer || !window.OsRunHistory) return;
    try {
      if (file.size > window.OsRunTransfer.MAX_IMPORT_BYTES) {
        throw new Error(`文件超过 ${Math.floor(window.OsRunTransfer.MAX_IMPORT_BYTES / 1024)} KiB 限制。`);
      }
      const source = await file.text();
      let imported;
      try {
        imported = window.OsRunTransfer.importRunJson(source, { existingRuns: state.savedRuns });
      } catch (error) {
        if (error.code !== "duplicate_run_id") throw error;
        const overwrite = window.confirm(
          `运行 ID 已存在：${error.message}\n\n选择“确定”覆盖本机旧记录；选择“取消”为导入记录生成新 ID。`
        );
        imported = window.OsRunTransfer.importRunJson(source, {
          existingRuns: state.savedRuns,
          duplicateStrategy: overwrite ? "overwrite" : "new-id"
        });
      }

      state.savedRuns = window.OsRunHistory.saveRun(browserLocalStorage(), imported.record);
      const saved = state.savedRuns.find((run) => run.id === imported.record.id);
      if (!saved) throw new Error("浏览器未能保存导入记录，请检查本地存储空间。");
      renderSavedRuns();
      dom.saved_run_select.value = saved.id;
      loadRunIntoReplay(saved);
      const action = imported.action === "overwritten"
        ? "已覆盖同 ID 的本机记录"
        : imported.action === "renamed" ? `已生成新 ID：${saved.id}` : "已保存为新的本机记录";
      setRunTransferStatus(
        `导入成功：${saved.context.branch}，${saved.events.length} 个事件；${action}。页面没有切换 Git 分支。`,
        "success"
      );
    } catch (error) {
      setRunTransferStatus(`导入失败：${error.message}`, "error");
    } finally {
      dom.import_run_file.value = "";
    }
  }

  function currentTimelineFilters() {
    return {
      status: dom.timeline_status_filter.value,
      source: dom.timeline_source_filter.value,
      lab: dom.timeline_lab_filter.value,
      step: dom.timeline_step_filter.value,
      keyword: dom.timeline_keyword_filter.value
    };
  }

  function fillTimelineFilter(select, values, placeholder, labelFor = (value) => value) {
    const selected = select.value;
    select.innerHTML = "";
    const empty = element("option", "", placeholder);
    empty.value = "";
    select.appendChild(empty);
    values.forEach((value) => {
      const option = element("option", "", labelFor(value));
      option.value = value;
      select.appendChild(option);
    });
    if (values.includes(selected)) select.value = selected;
  }

  function populateTimelineFilters(run, resetStep = false) {
    const events = Array.isArray(run?.events) ? run.events : [];
    const unique = (values) => [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
    fillTimelineFilter(dom.timeline_source_filter, unique(events.map((event) => event.source)), "全部来源");
    fillTimelineFilter(
      dom.timeline_lab_filter,
      unique(events.map((event) => event.lab)),
      "全部 Lab",
      (value) => value.toUpperCase()
    );
    if (resetStep) dom.timeline_step_filter.value = "";
    const selectedLab = dom.timeline_lab_filter.value;
    const steps = unique(events
      .filter((event) => !selectedLab || event.lab === selectedLab)
      .map((event) => event.step));
    fillTimelineFilter(
      dom.timeline_step_filter,
      steps,
      "全部步骤",
      (value) => value.replaceAll("-", " → ")
    );
  }

  function resetTimelineFilters() {
    dom.timeline_status_filter.value = "";
    dom.timeline_source_filter.value = "";
    dom.timeline_lab_filter.value = "";
    dom.timeline_step_filter.value = "";
    dom.timeline_keyword_filter.value = "";
  }

  function renderPlaybackControls(snapshot = state.timelineController?.getSnapshot()) {
    const playing = Boolean(snapshot?.playing);
    dom.replay_play_pause.textContent = playing ? "暂停" : "播放";
    dom.replay_play_pause.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  function ensureTimelineController() {
    if (state.timelineController || !window.OsTimelineController?.createTimelineController) {
      return state.timelineController;
    }
    state.timelineController = window.OsTimelineController.createTimelineController({
      onIndex(index, _snapshot, reason) {
        replayTo(index, { fromController: true, reason });
      },
      onPlayingChange(playing, snapshot) {
        renderPlaybackControls({ ...snapshot, playing });
      }
    });
    state.timelineController.setSpeed(Number(dom.replay_speed.value));
    return state.timelineController;
  }

  function timelineSnapshot(run) {
    const controller = ensureTimelineController();
    if (controller) return controller.getSnapshot();
    return {
      index: state.replay.index,
      speed: 1,
      playing: false,
      visibleIndexes: Array.isArray(run?.events) ? run.events.map((_event, index) => index) : []
    };
  }

  function renderReplayTimeline() {
    dom.replay_timeline.innerHTML = "";
    const run = state.replay.run;
    if (!run) {
      dom.replay_timeline.appendChild(element("li", "empty-state", "保存运行后可在这里逐步回放。"));
      dom.replay_previous.disabled = true;
      dom.replay_next.disabled = true;
      dom.replay_play_pause.disabled = true;
      dom.replay_first_failure.disabled = true;
      dom.replay_first_difference.disabled = true;
      dom.timeline_summary.textContent = "总时长与事件数量将在载入后显示。";
      renderPlaybackControls();
      return;
    }

    const api = window.OsTimelineController;
    const snapshot = timelineSnapshot(run);
    const visibleIndexes = snapshot.visibleIndexes;
    const visibleSet = new Set(visibleIndexes);
    if (visibleIndexes.length === 0) {
      dom.replay_timeline.appendChild(element("li", "empty-state", "当前筛选没有匹配事件；原始运行记录没有改变。"));
    }
    visibleIndexes.forEach((index) => {
      const event = run.events[index];
      const item = element("li", "replay-event");
      item.dataset.eventStatus = event.status || "running";
      if (index < state.replay.index) item.dataset.status = "played";
      if (index === state.replay.index) item.dataset.status = "current";
      if (state.selectedEvent?.scope === "时间线回放" && state.selectedEvent.event === event) {
        item.dataset.selected = "true";
      }
      const button = element("button", "event-row-button");
      button.type = "button";
      const duration = api?.eventDurationMs(run.events, index);
      const durationLabel = index === 0
        ? "运行起点"
        : `距前一原始事件 ${api?.formatDuration(duration) || "无法判断"}`;
      button.append(
        element("span", "event-sequence", `#${index + 1}`),
        element("strong", "", resolveEventKnowledge(event).eventName),
        element("span", "", event.detail || event.step),
        element("small", "replay-event-meta", `${event.status || "running"} · ${event.source || "unknown"} · ${durationLabel}`)
      );
      button.addEventListener("click", () => jumpReplayTo(index, "event-click"));
      item.appendChild(button);
      dom.replay_timeline.appendChild(item);
    });

    dom.replay_previous.disabled = state.replay.index < 0;
    dom.replay_next.disabled = !visibleIndexes.some((index) => index > state.replay.index);
    dom.replay_play_pause.disabled = visibleIndexes.length === 0;
    dom.replay_first_failure.disabled = (api?.firstFailureIndex(run.events) ?? -1) < 0;
    dom.replay_first_difference.disabled = false;
    const stats = api?.timelineStats(run) || {
      durationMs: run.durationMs,
      eventCount: run.events.length,
      interrupted: Boolean(run.stopped)
    };
    const interrupted = stats.interrupted ? " · 运行已中断" : "";
    dom.timeline_summary.textContent = `运行总时长 ${api?.formatDuration(stats.durationMs) || "无法判断"} · 原始 ${stats.eventCount} 个事件 · 当前显示 ${visibleIndexes.length} 个${interrupted}`;
    if (state.replay.index >= 0 && !visibleSet.has(state.replay.index)) {
      dom.timeline_summary.textContent += " · 当前回放事件被筛选隐藏，系统状态仍按完整事件序列计算";
    }
    renderPlaybackControls(snapshot);
  }

  function replayTo(index, options = {}) {
    const run = state.replay.run;
    if (!run) return;
    const requestedIndex = Number(index);
    const nextIndex = Number.isInteger(requestedIndex)
      ? Math.max(-1, Math.min(requestedIndex, run.events.length - 1))
      : -1;
    const controller = ensureTimelineController();
    if (!options.fromController) {
      controller?.pause();
      controller?.setIndex(nextIndex);
    }
    state.progress = {};
    state.manualSteps = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
    state.recentEvents = [];
    state.consoleLines = [];
    const targetIndex = stageIndexById[run.context.lab];
    if (targetIndex !== undefined) state.stageIndex = targetIndex;
    for (let eventIndex = 0; eventIndex <= nextIndex; eventIndex += 1) {
      applyRuntimeEvent(run.events[eventIndex], false);
    }
    state.replay.index = nextIndex;
    state.selectedEvent = nextIndex >= 0
      ? { event: run.events[nextIndex], scope: "时间线回放", index: nextIndex }
      : null;
    if (state.selectedEvent) syncEventKnowledge(state.selectedEvent.event);
    else state.selectedKnowledgeNode = null;
    renderDimensionTabs();
    renderEventFeed();
    renderConsole();
    renderStage(nextIndex >= 0 ? run.events[nextIndex] : null);
    renderEventDetails();
    dom.replay_status.textContent = nextIndex < 0
      ? `${run.context.branch}：预测已加载，等待播放第一个事件。`
      : `${run.context.branch}：第 ${nextIndex + 1} / ${run.events.length} 个原始事件。`;
    renderReplayTimeline();
    if (state.presentationReady && presentationEnabled()) {
      persistPresentationState({
        lab: run.context.lab,
        runId: run.id,
        replayIndex: nextIndex,
        dimension: state.activeDimension
      });
    }
  }

  function jumpReplayTo(index, reason = "jump") {
    const controller = ensureTimelineController();
    controller?.pause();
    if (!controller || !controller.jump(index, reason)) replayTo(index);
  }

  function moveReplay(direction) {
    const controller = ensureTimelineController();
    if (!controller || !state.replay.run) return;
    controller.pause();
    const moved = direction < 0 ? controller.previous("previous") : controller.next("next");
    if (!moved && direction > 0) dom.replay_status.textContent = "已经到达当前筛选结果的末尾。";
  }

  function toggleTimelinePlayback() {
    const controller = ensureTimelineController();
    if (!controller || !state.replay.run) return;
    if (controller.getSnapshot().playing) controller.pause();
    else if (!controller.play()) dom.replay_status.textContent = "当前筛选没有可播放的事件。";
    renderReplayTimeline();
  }

  function applyTimelineFilters() {
    const controller = ensureTimelineController();
    if (!controller || !state.replay.run) {
      renderReplayTimeline();
      return;
    }
    const snapshot = controller.setFilters(currentTimelineFilters());
    dom.replay_status.textContent = `筛选显示 ${snapshot.visibleIndexes.length} / ${snapshot.eventCount} 个事件；原始事件和回放状态均未修改。`;
    renderReplayTimeline();
  }

  function jumpToFirstFailure() {
    const run = state.replay.run;
    const index = window.OsTimelineController?.firstFailureIndex(run?.events);
    if (!Number.isInteger(index) || index < 0) {
      dom.replay_status.textContent = "这次运行没有可定位的失败事件证据。";
      return;
    }
    jumpReplayTo(index, "first-failure");
  }

  function jumpToFirstDifference() {
    const run = state.replay.run;
    const starter = state.savedRuns.find((item) => item.id === dom.starter_run_select.value);
    const solution = state.savedRuns.find((item) => item.id === dom.solution_run_select.value);
    const comparison = window.OsRunHistory?.compareRuns(starter, solution);
    if (!run || !comparison) {
      dom.replay_status.textContent = "请先在右侧选择同一 Lab 的 starter 与 solution 运行。";
      return;
    }
    const role = starter?.id === run.id ? "starter" : solution?.id === run.id ? "solution" : "";
    if (!role) {
      dom.replay_status.textContent = "当前回放记录不在右侧所选的 starter / solution 对比中。";
      return;
    }
    const difference = window.OsTimelineController?.firstRunDifference(comparison, role);
    const index = role === "starter" ? difference?.starterIndex : difference?.solutionIndex;
    if (!Number.isInteger(index)) {
      dom.replay_status.textContent = "当前回放侧没有可定位的事件差异。";
      return;
    }
    jumpReplayTo(index, "first-difference");
  }

  function loadRunIntoReplay(run) {
    if (!run) return;
    state.timelineController?.pause();
    state.replay = { run, index: -1 };
    if (state.presentationReady && presentationEnabled()) {
      persistPresentationState({ lab: run.context.lab, runId: run.id, replayIndex: -1 });
      updatePresentationUrl(true, run.context.lab);
    }
    resetTimelineFilters();
    populateTimelineFilters(run);
    const controller = ensureTimelineController();
    controller?.setEvents(run.events);
    controller?.setSpeed(Number(dom.replay_speed.value));
    controller?.setFilters(currentTimelineFilters());
    if (run.context.variant === "starter") dom.starter_run_select.value = run.id;
    if (run.context.variant === "solution") dom.solution_run_select.value = run.id;
    const assessment = run.predictionAssessment
      || window.OsPredictionModel?.comparePrediction(run.prediction, run)
      || null;
    renderPredictionComparison(assessment);
    renderRunDiagnostics(run, "已载入运行");
    replayTo(-1, { fromController: true });
  }

  function clearReplayForLiveRun() {
    state.timelineController?.setEvents([]);
    state.replay = { run: null, index: -1 };
    state.selectedEvent = null;
    state.selectedKnowledgeNode = null;
    resetTimelineFilters();
    populateTimelineFilters(null);
    dom.replay_status.textContent = "尚未选择已保存运行。";
    dom.timeline_summary.textContent = "总时长与事件数量将在载入后显示。";
    renderReplayTimeline();
  }

  function loadSelectedReplay() {
    const run = state.savedRuns.find((item) => item.id === dom.saved_run_select.value);
    if (!run) {
      dom.replay_status.textContent = "请先选择一次已保存运行。";
      return;
    }
    loadRunIntoReplay(run);
  }

  function renderStateDiffList(container, rows, scope, emptyText) {
    container.innerHTML = "";
    if (!rows?.length || !window.OsStateModel?.formatField) {
      container.appendChild(element("li", "empty-state", emptyText));
      return;
    }
    rows.forEach((row) => {
      const item = element("li", "state-diff-item");
      item.dataset.scope = scope;
      const field = row.starter || row.solution;
      item.appendChild(element("strong", "", field.label));
      if (scope === "same") {
        item.appendChild(element("span", "", window.OsStateModel.formatField(row.starter)));
      } else if (scope === "changed") {
        item.append(
          element("span", "", `starter：${window.OsStateModel.formatField(row.starter)}`),
          element("span", "", `solution：${window.OsStateModel.formatField(row.solution)}`)
        );
      } else if (scope === "starter-only") {
        item.appendChild(element("span", "", `starter：${window.OsStateModel.formatField(row.starter)}`));
      } else if (scope === "solution-only") {
        item.appendChild(element("span", "", `solution：${window.OsStateModel.formatField(row.solution)}`));
      } else {
        item.appendChild(element("span", "", "starter 与 solution 都没有足够运行证据。"));
      }
    });
  }

  function renderStateComparison(comparison) {
    if (!comparison) {
      dom.state_comparison_status.textContent = "请选择同一 Lab 的 starter 与 solution 运行。";
      renderStateFieldList(dom.starter_state_list, null, "尚未选择 starter 运行。");
      renderStateFieldList(dom.solution_state_list, null, "尚未选择 solution 运行。");
      renderStateDiffList(dom.same_state_list, [], "same", "比较后显示相同状态。");
      renderStateDiffList(dom.changed_state_list, [], "changed", "比较后显示发生变化的状态。");
      renderStateDiffList(dom.starter_only_state_list, [], "starter-only", "比较后显示仅 starter 有证据的状态。");
      renderStateDiffList(dom.solution_only_state_list, [], "solution-only", "比较后显示仅 solution 有证据的状态。");
      renderStateDiffList(dom.insufficient_state_list, [], "insufficient", "比较后显示双方均缺少证据的状态。");
      return;
    }

    const oneSided = comparison.starterOnly.length + comparison.solutionOnly.length;
    dom.state_comparison_status.textContent = `${comparison.lab.toUpperCase()}：相同 ${comparison.same.length} 项，变化 ${comparison.changed.length} 项，单侧有证据 ${oneSided} 项，双方证据不足 ${comparison.insufficient.length} 项。`;
    renderStateFieldList(dom.starter_state_list, comparison.starterState);
    renderStateFieldList(dom.solution_state_list, comparison.solutionState);
    renderStateDiffList(dom.same_state_list, comparison.same, "same", "没有可确认的相同状态。");
    renderStateDiffList(dom.changed_state_list, comparison.changed, "changed", "没有发生变化的状态。");
    renderStateDiffList(dom.starter_only_state_list, comparison.starterOnly, "starter-only", "没有仅 starter 有证据的状态。");
    renderStateDiffList(dom.solution_only_state_list, comparison.solutionOnly, "solution-only", "没有仅 solution 有证据的状态。");
    renderStateDiffList(dom.insufficient_state_list, comparison.insufficient, "insufficient", "没有双方均缺少证据的状态。");
  }

  function renderComparison() {
    dom.comparison_list.innerHTML = "";
    const starter = state.savedRuns.find((run) => run.id === dom.starter_run_select.value);
    const solution = state.savedRuns.find((run) => run.id === dom.solution_run_select.value);
    const comparison = window.OsRunHistory?.compareRuns(starter, solution);
    if (!comparison) {
      dom.comparison_summary.textContent = "请选择同一 Lab 的 starter 与 solution 运行。";
      renderStateComparison(null);
      return;
    }
    const stateComparison = window.OsStateDiff?.compareRuns(starter, solution) || null;
    dom.comparison_summary.textContent = stateComparison
      ? `${comparison.lab.toUpperCase()}：事件共同 ${comparison.shared}、仅 starter ${comparison.starterOnly}、仅 solution ${comparison.solutionOnly}；状态相同 ${stateComparison.same.length}、变化 ${stateComparison.changed.length}、单侧 ${stateComparison.starterOnly.length + stateComparison.solutionOnly.length}、双方证据不足 ${stateComparison.insufficient.length}。`
      : `${comparison.lab.toUpperCase()}：共同 ${comparison.shared}，仅 starter ${comparison.starterOnly}，仅 solution ${comparison.solutionOnly}；状态模型暂不可用。`;
    renderStateComparison(stateComparison);
    comparison.rows.forEach((row) => {
      const event = row.starter || row.solution;
      const item = element("li", "comparison-event");
      item.dataset.scope = row.scope;
      const scope = {
        shared: "两者都有",
        "starter-only": "仅 starter",
        "solution-only": "仅 solution"
      }[row.scope];
      item.append(
        element("span", "comparison-scope", scope),
        element("strong", "", event.step.replaceAll("-", " → ")),
        element("span", "", event.detail)
      );
      dom.comparison_list.appendChild(item);
    });
  }

  function renderRunState() {
    const current = state.runState;
    dom.run_state.textContent = current.detail || current.phase;
    const predictionReady = predictionMatchesContext();
    const presentationLocked = presentationEnabled();
    dom.run_current.disabled = presentationLocked || !state.live || current.running || !predictionReady;
    dom.stop_current.disabled = presentationLocked || !state.live || !current.running || current.phase === "stopping";
    dom.run_current.textContent = current.running
      ? "当前运行进行中…"
      : predictionReady ? "构建并运行当前分支" : "先保存预测再运行";
    dom.runtime_hint.textContent = presentationLocked
      ? "演示模式不会启动或停止 QEMU；退出演示模式后才能执行真实运行。"
      : current.phase === "error"
      ? "查看下方构建/串口输出定位问题；修复后可再次运行。"
      : predictionReady
        ? "预测已经锁定；运行后可保存并回放完整事件时间线。"
        : "先填写预测；切换 Git 分支后需要为新分支重新预测。";
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
    state.selectedEvent = null;
    state.selectedKnowledgeNode = null;
    renderEventFeed();
    renderConsole();
    renderEventDetails();
  }

  function handleSocketMessage(message) {
    if (presentationEnabled()) return;
    if (message.type === "history") {
      const replaying = Boolean(state.replay.run);
      state.runState = message.runState || state.runState;
      applyContext(message.context, !replaying);
      if (message.activeRun) {
        state.activeRun = {
          id: message.activeRun.runId,
          context: message.activeRun.context || message.context,
          prediction: predictionMatchesContext() ? state.prediction : null,
          events: [...(message.events || [])],
          stableOutput: collectStableOutput(message.console || []),
          lifecycle: { buildResult: null, runResult: null, completed: false },
          startedAt: message.activeRun.startedAt || Date.now()
        };
        updateActiveRunLifecycle(message.runState || {});
        if (!replaying) resetDiagnostics("检测到正在进行的运行；结束后再根据完整证据执行诊断。");
      } else {
        state.activeRun = null;
      }
      if (!replaying) {
        state.recentEvents = [];
        state.consoleLines = message.console || [];
        (message.events || []).forEach((event) => applyRuntimeEvent(event, false));
        renderEventFeed();
        renderConsole();
        renderStage(state.recentEvents[0] || null);
      }
      renderRunState();
    }
    if (message.type === "branch-change") {
      resetRunEvidence();
      clearReplayForLiveRun();
      applyContext(message.context, true);
      dom.last_event.textContent = `已检测到分支切换：${message.previous.branch} → ${message.context.branch}`;
      renderPredictionComparison(null);
      resetDiagnostics("分支已切换；完成当前分支运行后再执行诊断。");
      renderRunState();
    }
    if (message.type === "run-start") {
      resetRunEvidence();
      applyContext(message.context, true);
      beginActiveRun(message);
      dom.last_event.textContent = `开始运行 ${message.context.branch}，等待真实 marker`;
    }
    if (message.type === "run-state") {
      state.runState = message.state;
      updateActiveRunLifecycle(message.state);
      renderRunState();
    }
    if (message.type === "console") {
      captureRunOutput(message);
      if (!state.replay.run) appendConsole(message);
    }
    if (message.type === "telemetry") {
      captureRunEvent(message);
      if (!state.replay.run) applyRuntimeEvent(message);
    }
    if (message.type === "run-error") {
      if (!state.replay.run) dom.last_event.textContent = `运行失败：${message.message}`;
      updateActiveRunLifecycle({ ...message, phase: "error" });
      finishActiveRun(message);
    }
    if (message.type === "run-end") {
      if (!state.replay.run) {
        dom.last_event.textContent = message.stopped
          ? `已停止 ${message.context.branch}，可以切换或重新运行分支`
          : `QEMU 运行结束：exit code ${message.exitCode}`;
      }
      updateActiveRunLifecycle({ ...message, phase: message.stopped ? "stopped" : "finished" });
      finishActiveRun(message);
    }
  }

  function connectTelemetry() {
    if (presentationEnabled()) {
      setConnection("演示模式：不会连接实时运行，也不会自动启动 QEMU", false);
      renderRunState();
      return;
    }
    if (!["http:", "https:"].includes(window.location.protocol)) {
      setConnection("离线知识模式：请用启动脚本进入实时模式", false);
      renderRunState();
      return;
    }

    if (state.socket && state.socket.readyState < 2) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let socket;
    try {
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      state.socket = socket;
    } catch (_) {
      setConnection("本地桥接器不可用：仍可手动推演", false);
      return;
    }

    socket.addEventListener("open", () => {
      if (state.socket !== socket || presentationEnabled()) return;
      state.live = true;
      setConnection("实时连接：正在跟踪 Git 分支与 QEMU", true);
      renderRunState();
    });
    socket.addEventListener("message", (raw) => {
      if (state.socket !== socket || presentationEnabled()) return;
      try {
        handleSocketMessage(JSON.parse(raw.data));
      } catch (_) {
        setConnection("收到无法识别的本地事件", false);
      }
    });
    socket.addEventListener("close", () => {
      if (state.socket !== socket) return;
      state.socket = null;
      state.live = false;
      setConnection("实时连接已断开：保留手动推演", false);
      renderRunState();
      window.clearTimeout(state.reconnectTimer);
      if (!presentationEnabled()) state.reconnectTimer = window.setTimeout(connectTelemetry, 1800);
    });
    socket.addEventListener("error", () => {
      if (state.socket !== socket || presentationEnabled()) return;
      setConnection("本地桥接器暂不可用", false);
    });
  }

  async function runCurrentBranch() {
    if (presentationEnabled()) {
      setPresentationStatus("演示模式不会启动 QEMU；请先退出演示模式。", "error");
      return;
    }
    if (!predictionMatchesContext()) {
      dom.prediction_status.textContent = "请先为当前分支保存预测。";
      dom.prediction_reasoning.focus();
      return;
    }
    dom.run_current.disabled = true;
    try {
      const response = await fetch("/api/run", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        if (result.preflight) renderPreflightDiagnostics(result);
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      dom.runtime_hint.textContent = `已请求运行 ${result.context.branch}。`;
    } catch (error) {
      dom.runtime_hint.textContent = `无法启动：${error.message}`;
      dom.run_current.disabled = false;
    }
  }

  async function stopCurrentRun() {
    if (presentationEnabled()) {
      setPresentationStatus("演示模式不会操作 QEMU；请先退出演示模式。", "error");
      return;
    }
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

  function savePrediction(event) {
    event.preventDefault();
    const expectedBuild = dom.prediction_build.value;
    const expectedRun = dom.prediction_run.value;
    const expectedPass = dom.prediction_pass.value;
    const expectedEvents = selectedPredictionEvents();
    const reasoning = dom.prediction_reasoning.value.trim();
    if (!state.context) {
      dom.prediction_status.textContent = "尚未识别当前 Git 分支，请先连接本地桥接器。";
      return;
    }
    if (!expectedBuild || !expectedRun || !expectedPass || !reasoning) {
      dom.prediction_status.textContent = "请完整填写构建、运行、PASS 预测和预测依据。";
      return;
    }
    const eventOptionCount = dom.prediction_event_options.querySelectorAll('input[name="prediction-events"]').length;
    if (eventOptionCount > 0 && expectedEvents.length === 0) {
      dom.prediction_status.textContent = "请至少选择一个预计出现的关键事件。";
      return;
    }
    state.prediction = window.OsPredictionModel?.createPrediction({
      expectedBuild,
      expectedRun,
      expectedEvents,
      expectedPass: expectedPass === "true",
      reasoning,
      branch: state.context.branch,
      commit: state.context.commit,
      lab: state.context.lab,
      savedAt: Date.now()
    }, state.context) || null;
    if (!state.prediction) {
      dom.prediction_status.textContent = "预测内容格式无效，请检查后重试。";
      return;
    }
    storePrediction(state.prediction);
    state.lastPredictionAssessment = "";
    renderPredictionComparison(null);
    renderPredictionGate();
    renderRunState();
  }

  function handleTimelineShortcut(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    const isInteractive = target instanceof HTMLElement && Boolean(
      target.closest("input, textarea, select, button, a, [tabindex], [contenteditable]")
    );
    if (event.key === "Escape") {
      state.timelineController?.pause();
      renderReplayTimeline();
      return;
    }
    if (isInteractive || !state.replay.run) return;

    const snapshot = timelineSnapshot(state.replay.run);
    if ((event.code === "Space" || event.key === " ") && !event.repeat) {
      event.preventDefault();
      toggleTimelinePlayback();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveReplay(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveReplay(1);
      return;
    }
    if (event.key === "Home" && snapshot.visibleIndexes.length) {
      event.preventDefault();
      jumpReplayTo(snapshot.visibleIndexes[0], "first-visible");
      return;
    }
    if (event.key === "End" && snapshot.visibleIndexes.length) {
      event.preventDefault();
      jumpReplayTo(snapshot.visibleIndexes[snapshot.visibleIndexes.length - 1], "last-visible");
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      jumpToFirstFailure();
      return;
    }
    if (event.key.toLowerCase() === "d") {
      event.preventDefault();
      jumpToFirstDifference();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      dom.timeline_keyword_filter.focus();
    }
  }

  dom.previous_stage.addEventListener("click", () => setStage(state.stageIndex - 1));
  dom.next_stage.addEventListener("click", () => setStage(state.stageIndex + 1));
  dom.auto_play.addEventListener("click", toggleAuto);
  dom.run_current.addEventListener("click", runCurrentBranch);
  dom.stop_current.addEventListener("click", stopCurrentRun);
  dom.clear_events.addEventListener("click", () => {
    state.recentEvents = [];
    state.selectedEvent = null;
    state.selectedKnowledgeNode = null;
    renderEventFeed();
    renderEventDetails();
    renderFramework();
  });
  dom.prediction_form.addEventListener("submit", savePrediction);
  dom.save_run.addEventListener("click", saveCompletedRun);
  dom.export_run_json.addEventListener("click", () => exportSelectedRun("json"));
  dom.export_run_markdown.addEventListener("click", () => exportSelectedRun("markdown"));
  dom.import_run_trigger.addEventListener("click", () => dom.import_run_file.click());
  dom.import_run_file.addEventListener("change", () => importRunFile(dom.import_run_file.files?.[0]));
  dom.replay_start.addEventListener("click", loadSelectedReplay);
  dom.replay_play_pause.addEventListener("click", toggleTimelinePlayback);
  dom.replay_speed.addEventListener("change", () => {
    state.timelineController?.setSpeed(Number(dom.replay_speed.value));
    renderReplayTimeline();
  });
  dom.timeline_status_filter.addEventListener("change", applyTimelineFilters);
  dom.timeline_source_filter.addEventListener("change", applyTimelineFilters);
  dom.timeline_lab_filter.addEventListener("change", () => {
    populateTimelineFilters(state.replay.run, true);
    applyTimelineFilters();
  });
  dom.timeline_step_filter.addEventListener("change", applyTimelineFilters);
  dom.timeline_keyword_filter.addEventListener("input", applyTimelineFilters);
  dom.timeline_clear_filters.addEventListener("click", () => {
    resetTimelineFilters();
    populateTimelineFilters(state.replay.run);
    applyTimelineFilters();
  });
  dom.replay_previous.addEventListener("click", () => moveReplay(-1));
  dom.replay_next.addEventListener("click", () => moveReplay(1));
  dom.replay_first_failure.addEventListener("click", jumpToFirstFailure);
  dom.replay_first_difference.addEventListener("click", jumpToFirstDifference);
  dom.compare_runs.addEventListener("click", renderComparison);
  dom.presentation_mode_toggle?.addEventListener("click", () => {
    setPresentationMode(!presentationEnabled(), { lab: stages[state.stageIndex].id });
  });
  dom.presentation_exit?.addEventListener("click", () => setPresentationMode(false));
  dom.presentation_import?.addEventListener("click", () => dom.import_run_file.click());
  dom.presentation_reset?.addEventListener("click", resetPresentationView);
  dom.presentation_fullscreen?.addEventListener("click", togglePresentationFullscreen);
  document.querySelectorAll("[data-presentation-lab]").forEach((button) => {
    button.addEventListener("click", () => openPresentationLab(button.dataset.presentationLab));
  });
  document.querySelectorAll("[data-presentation-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const selector = button.dataset.presentationTarget;
      if (!selector?.startsWith("#")) return;
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.addEventListener("fullscreenchange", updateFullscreenControl);
  document.addEventListener("keydown", handleTimelineShortcut);
  window.addEventListener("pagehide", () => {
    state.timelineController?.pause();
    if (presentationEnabled()) {
      persistPresentationState({
        lab: stages[state.stageIndex].id,
        runId: state.replay.run?.id || null,
        replayIndex: state.replay.index,
        dimension: state.activeDimension
      });
    }
  });

  window.OsFeedback?.initFeedbackCenter();
  renderDimensionTabs();
  renderEventFeed();
  renderEventDetails();
  renderConsole();
  renderSavedRuns();
  renderReplayTimeline();
  renderPredictionGate();
  renderPredictionComparison(null);
  resetDiagnostics();
  renderRunState();
  if (presentationEnabled()) {
    disconnectPresentationTelemetry();
    syncPresentationUi();
    restorePresentationView();
    state.presentationReady = true;
    persistPresentationState({
      lab: stages[state.stageIndex].id,
      runId: state.replay.run?.id || null,
      replayIndex: state.replay.index,
      dimension: state.activeDimension
    });
  } else {
    setStage(0);
    state.presentationReady = true;
    syncPresentationUi();
    connectTelemetry();
  }
})();
