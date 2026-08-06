(() => {
  "use strict";

  const CATALOG_VERSION = 1;
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const VALID_LABS = new Set(["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  const catalog = Object.create(null);

  function text(value, limit = 500) {
    return String(value ?? "").trim().slice(0, limit);
  }

  function eventKey(lab, step) {
    return `${text(lab, 20).toLowerCase()}:${text(step, 80).toLowerCase()}`;
  }

  function isRepositoryPath(value) {
    const candidate = text(value, 240).replaceAll("\\", "/");
    if (!candidate || candidate.startsWith("/") || /^[a-z]:/i.test(candidate)) return false;
    if (candidate.includes("\0") || candidate.includes("?") || candidate.includes("#")) return false;
    const segments = candidate.split("/");
    return segments.every((segment) => (
      segment
      && segment !== "."
      && segment !== ".."
      && /^[a-z0-9._-]+$/i.test(segment)
    ));
  }

  function define(lab, step, entry) {
    const key = eventKey(lab, step);
    if (!VALID_LABS.has(lab) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(step)) {
      throw new Error(`Invalid event catalog key: ${key}`);
    }
    if (!isRepositoryPath(entry.file)) throw new Error(`Unsafe event catalog path: ${entry.file}`);
    catalog[key] = Object.freeze({
      key,
      lab,
      step,
      eventName: text(entry.eventName, 120),
      knowledge: text(entry.knowledge, 160),
      file: text(entry.file, 240).replaceAll("\\", "/"),
      symbol: text(entry.symbol, 160),
      cause: text(entry.cause, 500),
      effect: text(entry.effect, 500),
      next: Object.freeze(Array.from(entry.next || [], (value) => text(value, 80)).filter(Boolean)),
      knowledgeNode: text(entry.knowledgeNode, 80)
    });
  }

  const NODE = Object.freeze({
    console: "sequence-console",
    trap: "sequence-trap",
    memory: "sequence-memory",
    schedule: "sequence-schedule",
    privilege: "sequence-privilege",
    file: "sequence-file"
  });

  define("p0", "kernel-main", {
    eventName: "进入 kernel_main",
    knowledge: "启动汇编到 Rust 内核入口的控制权交接",
    file: "kernel/src/main.rs",
    symbol: "kernel_main",
    cause: "OpenSBI 已进入 S-mode，启动入口已经建立有效内核栈。",
    effect: "Rust 内核开始执行，后续实验初始化和教学事件可以按顺序发生。",
    next: ["pass", "lab1:start"],
    knowledgeNode: NODE.console
  });

  define("p0", "pass", {
    eventName: "最小启动基线完成",
    knowledge: "QEMU、OpenSBI、启动入口与 Rust 内核的控制权交接",
    file: "kernel/src/main.rs",
    symbol: "kernel_main",
    cause: "内核已经完成启动、输出和关机的最小闭环。",
    effect: "P0 状态变为通过，后续实验获得可运行、可观察的共同基线。",
    next: ["lab1:start"],
    knowledgeNode: NODE.console
  });

  define("lab1", "start", {
    eventName: "调用 print_line",
    knowledge: "无标准库环境中的内核控制台输出",
    file: "kernel/src/console.rs",
    symbol: "print_line",
    cause: "Lab1 启动后需要输出稳定标记，让后续行为可以被观察。",
    effect: "字符串被拆成字节并交给 putchar，开始 SBI 控制台调用链。",
    next: ["print-line", "sbi-ecall", "console-available"],
    knowledgeNode: NODE.console
  });
  define("lab1", "print-line", {
    eventName: "print_line 遍历输出",
    knowledge: "裸机 Rust 字符串到字节输出的转换",
    file: "kernel/src/console.rs",
    symbol: "print_line / print_str / putchar",
    cause: "内核日志需要逐字节送入底层控制台接口。",
    effect: "当前字节被传给 SBI 封装，内核不依赖标准输出库。",
    next: ["sbi-ecall"],
    knowledgeNode: NODE.console
  });
  define("lab1", "sbi-ecall", {
    eventName: "发起 SBI ecall",
    knowledge: "S-mode 与 M-mode 之间的 SBI ABI",
    file: "kernel/src/sbi.rs",
    symbol: "console_putchar",
    cause: "S-mode 内核不能直接假设已有通用设备驱动，需要请求固件服务。",
    effect: "字符和 SBI 扩展号进入约定寄存器，ecall 把控制权交给 OpenSBI。",
    next: ["opensbi-console"],
    knowledgeNode: NODE.console
  });
  define("lab1", "opensbi-console", {
    eventName: "OpenSBI 处理控制台请求",
    knowledge: "M-mode 固件服务与内核边界",
    file: "kernel/src/sbi.rs",
    symbol: "console_putchar / SBI legacy extension 0x01",
    cause: "OpenSBI 收到来自 S-mode 的 console_putchar ecall。",
    effect: "固件解释 SBI 参数，并把字符输出请求交给 QEMU virt 控制台设备。",
    next: ["uart-write", "console-available"],
    knowledgeNode: NODE.console
  });
  define("lab1", "uart-write", {
    eventName: "UART 显示字符",
    knowledge: "QEMU virt 串口作为内核运行证据通道",
    file: "kernel/src/sbi.rs",
    symbol: "console_putchar",
    cause: "OpenSBI 已完成控制台调用并将字符送达模拟串口。",
    effect: "字符出现在终端，桥接器可以从串口文本提取教学事件。",
    next: ["console-available"],
    knowledgeNode: NODE.console
  });
  define("lab1", "console-available", {
    eventName: "SBI 控制台可用",
    knowledge: "print_line → ecall → OpenSBI → UART 完整输出链",
    file: "kernel/src/console.rs",
    symbol: "print_line",
    cause: "控制台字符已经经过 SBI 固件路径并成为可见输出。",
    effect: "Lab1 获得稳定观察通道，后续 Lab 的事件可以通过同一路径被捕获。",
    next: ["pass"],
    knowledgeNode: NODE.console
  });

  define("lab2", "stvec-installed", {
    eventName: "安装 stvec",
    knowledge: "S-mode Trap 入口配置",
    file: "kernel/src/trap.rs",
    symbol: "init / __trap_entry",
    cause: "CPU 必须先知道异常发生时跳转到哪个入口。",
    effect: "stvec 指向 __trap_entry，后续 breakpoint 可以安全进入 Trap 路径。",
    next: ["breakpoint-triggered"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "breakpoint-triggered", {
    eventName: "触发 breakpoint",
    knowledge: "同步异常与控制流打断",
    file: "kernel/src/trap.rs",
    symbol: "trigger_demo_exception",
    cause: "演示代码执行 ebreak，主动制造可控的同步异常。",
    effect: "CPU 保存异常位置并按 stvec 转入 __trap_entry。",
    next: ["trap-enter", "breakpoint-decoded"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "trap-enter", {
    eventName: "进入 Trap",
    knowledge: "TrapFrame 与寄存器现场保存",
    file: "kernel/src/trap.rs",
    symbol: "__trap_entry / TrapFrame",
    cause: "ebreak 已触发，硬件按 stvec 把控制权交给 Trap 入口。",
    effect: "通用寄存器、scause、sepc 与 stval 被保存，Rust handler 可以安全分析异常。",
    next: ["scause-read", "breakpoint-decoded"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "scause-read", {
    eventName: "读取 scause",
    knowledge: "RISC-V 异常原因编码",
    file: "kernel/src/trap.rs",
    symbol: "rust_trap_handler / TrapFrame::scause",
    cause: "Trap handler 需要判断进入原因是中断、breakpoint 还是其他异常。",
    effect: "cause code 被解析，breakpoint 对应的异常编号 3 得到确认。",
    next: ["breakpoint-decoded"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "breakpoint-decoded", {
    eventName: "识别 breakpoint 原因",
    knowledge: "scause 解码与异常分派",
    file: "kernel/src/trap.rs",
    symbol: "rust_trap_handler",
    cause: "scause 表明本次同步异常是 breakpoint。",
    effect: "handler 进入 breakpoint 分支，准备修正返回地址。",
    next: ["sepc-advanced", "breakpoint-handled"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "sepc-advanced", {
    eventName: "推进 sepc",
    knowledge: "异常处理后的返回地址修正",
    file: "kernel/src/trap.rs",
    symbol: "rust_trap_handler / TrapFrame::sepc",
    cause: "若仍返回 ebreak 指令，CPU 会重复触发同一异常。",
    effect: "sepc 增加 4，sret 将从 breakpoint 后一条指令继续。",
    next: ["breakpoint-handled"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "breakpoint-handled", {
    eventName: "breakpoint 处理完成",
    knowledge: "Trap 恢复与 sret 返回",
    file: "kernel/src/trap.rs",
    symbol: "rust_trap_handler / __trap_entry",
    cause: "异常原因已经处理，sepc 已指向下一条指令。",
    effect: "TrapFrame 被恢复，sret 返回原执行流且不会再次执行 ebreak。",
    next: ["pass"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "stvec-missing", {
    eventName: "stvec 尚未配置",
    knowledge: "Starter 的 Trap 入口待实现点",
    file: "kernel/src/trap.rs",
    symbol: "init",
    cause: "starter 分支尚未完成 Trap 入口安装任务。",
    effect: "页面停在 TODO，不会把未配置入口误判为完成。",
    next: ["stvec-installed"],
    knowledgeNode: NODE.trap
  });
  define("lab2", "breakpoint-missing", {
    eventName: "breakpoint 尚未触发",
    knowledge: "Starter 的异常触发待实现点",
    file: "kernel/src/trap.rs",
    symbol: "trigger_demo_exception",
    cause: "starter 分支尚未执行用于验收的 ebreak。",
    effect: "Trap 往返没有真实证据，页面保持 TODO 状态。",
    next: ["breakpoint-triggered"],
    knowledgeNode: NODE.trap
  });

  define("lab3", "allocator-ready", {
    eventName: "页帧分配器就绪",
    knowledge: "物理页帧区间与 recycled 回收栈",
    file: "kernel/src/memory/frame_allocator.rs",
    symbol: "StackFrameAllocator::init",
    cause: "内核已经确定可分配物理页号的半开区间。",
    effect: "next 和 recycled 状态初始化，后续可以分配、释放并复用页帧。",
    next: ["frame-allocated"],
    knowledgeNode: NODE.memory
  });
  define("lab3", "frame-allocated", {
    eventName: "分配物理页帧",
    knowledge: "页帧唯一性、对齐与耗尽处理",
    file: "kernel/src/memory/frame_allocator.rs",
    symbol: "StackFrameAllocator::alloc",
    cause: "内核或页表需要一页新的物理内存。",
    effect: "优先弹出 recycled 页，否则推进 next；该页进入已分配状态。",
    next: ["frame-freed", "frame-reused"],
    knowledgeNode: NODE.memory
  });
  define("lab3", "frame-freed", {
    eventName: "释放物理页帧",
    knowledge: "页帧所有权与 double free 防护",
    file: "kernel/src/memory/frame_allocator.rs",
    symbol: "StackFrameAllocator::dealloc",
    cause: "页帧使用结束，需要把资源归还分配器。",
    effect: "合法页号进入 recycled；越界、未分配或重复释放会返回错误。",
    next: ["frame-reused", "pass"],
    knowledgeNode: NODE.memory
  });
  define("lab3", "frame-reused", {
    eventName: "复用已释放页帧",
    knowledge: "物理内存资源复用",
    file: "kernel/src/memory/frame_allocator.rs",
    symbol: "StackFrameAllocator::alloc",
    cause: "recycled 中已有被合法释放的页号。",
    effect: "分配器优先返回回收页，next 不必增长。",
    next: ["pass"],
    knowledgeNode: NODE.memory
  });
  define("lab3", "frame-checks-start", {
    eventName: "开始页帧分配检查",
    knowledge: "页帧分配、释放、复用与错误边界的组合验证",
    file: "kernel/src/main.rs",
    symbol: "kernel_main / run_frame_allocator_checks",
    cause: "页帧分配器已经初始化，实验开始执行真实分配和释放序列。",
    effect: "运行状态进入页帧检查阶段，但尚未提前判定通过。",
    next: ["frame-allocated", "frame-freed", "frame-checks-pass"],
    knowledgeNode: NODE.memory
  });
  define("lab3", "frame-checks-pass", {
    eventName: "页帧检查通过",
    knowledge: "分配唯一性、回收复用和非法释放防护",
    file: "kernel/src/main.rs",
    symbol: "kernel_main / run_frame_allocator_checks",
    cause: "分配、释放、优先复用和错误检查均返回预期结果。",
    effect: "Lab3 的页帧机制获得完整运行证据，可以进入最终 PASS。",
    next: ["pass"],
    knowledgeNode: NODE.memory
  });

  define("lab4", "allocator-ready", {
    eventName: "页表页帧来源就绪",
    knowledge: "物理页帧是 Sv39 页表的资源基础",
    file: "kernel/src/memory/frame_allocator.rs",
    symbol: "StackFrameAllocator::init",
    cause: "三级页表的根页和中间页都需要真实物理页帧。",
    effect: "Lab4 可以分配根页表并逐级创建页表页。",
    next: ["root-page-table"],
    knowledgeNode: NODE.memory
  });
  define("lab4", "root-page-table", {
    eventName: "分配根页表",
    knowledge: "Sv39 三级页表根节点",
    file: "kernel/src/memory/page_table.rs",
    symbol: "PageTable::new / PageTable::root_ppn",
    cause: "地址空间需要一个可写入 satp 的根物理页号。",
    effect: "根页表页被清零并由 PageTable 持有。",
    next: ["page-table-built", "pte-written"],
    knowledgeNode: NODE.memory
  });
  define("lab4", "page-table-built", {
    eventName: "建立三级页表结构",
    knowledge: "VPN[2:0] 逐级查找与中间页表",
    file: "kernel/src/memory/page_table.rs",
    symbol: "PageTable::find_pte_create / PageTable::map",
    cause: "虚拟页号需要沿三级索引找到或创建叶子 PTE。",
    effect: "缺失的中间页表得到分配，目标叶子位置可以写入映射。",
    next: ["pte-written", "text-mapped"],
    knowledgeNode: NODE.memory
  });
  define("lab4", "pte-written", {
    eventName: "写入叶子 PTE",
    knowledge: "PPN 与 R/W/X/U 权限编码",
    file: "kernel/src/memory/page_table.rs",
    symbol: "PageTableEntry::new / PageTable::map",
    cause: "虚拟页已经找到叶子位置，需要绑定物理页与最小权限。",
    effect: "叶子 PTE 获得 V 位、物理页号和权限，地址可以被翻译。",
    next: ["text-mapped", "data-mapped", "user-pages-mapped", "satp-activated"],
    knowledgeNode: NODE.memory
  });
  for (const [step, eventName, knowledge, effect] of [
    ["text-mapped", "映射 .text", "可执行但不可写的代码段权限", ".text 建立 R-X 恒等映射。"],
    ["rodata-mapped", "映射 .rodata", "只读数据段权限", ".rodata 建立 R-- 恒等映射。"],
    ["data-mapped", "映射 .data", "可读写数据段权限", ".data 建立 RW- 恒等映射。"],
    ["bss-mapped", "映射 .bss 与启动栈", "零初始化数据和栈的读写权限", ".bss 与启动栈建立 RW- 恒等映射。"],
    ["user-pages-mapped", "映射用户代码和栈", "PTE U 位与用户空间最小权限", "用户代码页和栈页获得 U 位及各自所需权限。"]
  ]) {
    define("lab4", step, {
      eventName,
      knowledge,
      file: "kernel/src/memory/page_table.rs",
      symbol: "MemorySet::map_identity_range / PageTable::map",
      cause: "启用分页前必须覆盖当前或后续会访问的地址范围。",
      effect,
      next: ["page-table-built", "satp-activated"],
      knowledgeNode: NODE.memory
    });
  }
  define("lab4", "satp-activated", {
    eventName: "激活 satp",
    knowledge: "Sv39 地址翻译与 TLB 刷新",
    file: "kernel/src/memory/page_table.rs",
    symbol: "MemorySet::activate / write_satp_and_sfence",
    cause: "页表结构和必要映射已经准备完成。",
    effect: "CPU 使用 Sv39 根页表，sfence.vma 清除旧地址翻译。",
    next: ["paging-active", "translate-verified"],
    knowledgeNode: NODE.memory
  });
  define("lab4", "paging-active", {
    eventName: "分页后继续执行",
    knowledge: "启用页表前后的地址连续性",
    file: "kernel/src/memory/page_table.rs",
    symbol: "MemorySet::activate",
    cause: "satp 已写入且关键代码、数据和栈均已正确映射。",
    effect: "内核在分页状态下继续运行，证明激活没有破坏当前控制流。",
    next: ["translate-verified", "pass"],
    knowledgeNode: NODE.memory
  });
  define("lab4", "translate-verified", {
    eventName: "验证 map/translate",
    knowledge: "虚拟地址到物理地址的三级翻译",
    file: "kernel/src/memory/page_table.rs",
    symbol: "PageTable::translate / MemorySet::translate",
    cause: "测试映射已经写入叶子 PTE。",
    effect: "查询结果与期望物理地址一致，映射逻辑获得运行证据。",
    next: ["pass"],
    knowledgeNode: NODE.memory
  });

  define("lab5", "task-created", {
    eventName: "创建任务",
    knowledge: "TCB、独立内核栈与初始上下文",
    file: "kernel/src/task/mod.rs",
    symbol: "TaskControlBlock::new / spawn_kernel_task",
    cause: "调度器需要先把入口、栈顶和任务身份组织成可调度对象。",
    effect: "新任务进入 Ready 状态，并拥有独立的 TaskContext 与栈。",
    next: ["scheduler-ready"],
    knowledgeNode: NODE.schedule
  });
  define("lab5", "scheduler-ready", {
    eventName: "调度器与任务就绪",
    knowledge: "Ready 队列与 Round-Robin 调度",
    file: "kernel/src/task/mod.rs",
    symbol: "spawn_kernel_task / TaskManager::add_task",
    cause: "固定教学任务已经创建并加入任务表。",
    effect: "三个任务处于 Ready，调度器可以选择第一个任务运行。",
    next: ["task-a-step-1", "context-switched"],
    knowledgeNode: NODE.schedule
  });
  define("lab5", "yield-called", {
    eventName: "任务主动 yield",
    knowledge: "协作式调度的让出点",
    file: "kernel/src/task/mod.rs",
    symbol: "yield_now / TaskManager::mark_current_ready",
    cause: "当前任务主动放弃 CPU，让其他 Ready 任务获得运行机会。",
    effect: "当前任务从 Running 回到 Ready，控制权返回调度器上下文。",
    next: ["context-switched"],
    knowledgeNode: NODE.schedule
  });
  define("lab5", "context-switched", {
    eventName: "切换任务上下文",
    knowledge: "ra、sp 与 callee-saved 寄存器保存恢复",
    file: "kernel/src/task/switch.S",
    symbol: "__switch / switch_context",
    cause: "Round-Robin 已选出下一个 Ready 任务。",
    effect: "旧 TaskContext 保存 CPU 现场，新 TaskContext 恢复并成为 Running。",
    next: ["yield-called", "scheduler-finished"],
    knowledgeNode: NODE.schedule
  });
  for (const task of ["a", "b", "c"]) {
    for (const turn of ["1", "2"]) {
      const nextTask = task === "a" ? "b" : task === "b" ? "c" : "a";
      define("lab5", `task-${task}-step-${turn}`, {
        eventName: `任务 ${task.toUpperCase()} 执行第 ${turn} 步`,
        knowledge: "Round-Robin 顺序与任务状态变化",
        file: "kernel/src/task/mod.rs",
        symbol: "run_ready_tasks / yield_now / switch_context",
        cause: `调度器恢复了任务 ${task.toUpperCase()} 的上下文。`,
        effect: `任务 ${task.toUpperCase()} 处于 Running，其他未退出任务保持 Ready。`,
        next: turn === "1" ? ["yield-called", `task-${nextTask}-step-1`] : ["yield-called", "scheduler-finished"],
        knowledgeNode: NODE.schedule
      });
    }
  }
  define("lab5", "scheduler-finished", {
    eventName: "调度完成",
    knowledge: "任务退出与调度终止条件",
    file: "kernel/src/task/mod.rs",
    symbol: "TaskManager::all_tasks_exited / run_ready_tasks",
    cause: "所有教学任务都已执行完成并进入 Exited。",
    effect: "调度循环结束，不再选择已退出任务。",
    next: ["pass"],
    knowledgeNode: NODE.schedule
  });

  define("lab6", "user-context-ready", {
    eventName: "准备用户上下文",
    knowledge: "sepc、sstatus、sscratch 与用户栈",
    file: "kernel/src/user.rs",
    symbol: "UserContext::new / prepare_user_context",
    cause: "进入 U-mode 前必须准备入口、栈和返回特权级。",
    effect: "用户入口写入 sepc，内核 Trap 栈写入 sscratch，SPP 被设置为用户态返回。",
    next: ["entering-user", "user-mode-entered"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "entering-user", {
    eventName: "准备进入 U-mode",
    knowledge: "sret 驱动的特权级下降",
    file: "kernel/src/user.rs",
    symbol: "enter_demo_user / __lab6_enter_user",
    cause: "用户页、入口、栈与 CSR 上下文已经准备完成。",
    effect: "sret 将控制权从 S-mode 交给用户程序。",
    next: ["user-mode-entered", "user-ecall"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "user-mode-entered", {
    eventName: "进入用户态",
    knowledge: "U-mode 权限边界",
    file: "kernel/src/user.rs",
    symbol: "__lab6_enter_user / __lab6_user_entry",
    cause: "内核执行 sret，且 sstatus.SPP 指示返回 U-mode。",
    effect: "用户程序只能执行用户权限允许的指令，并通过 ecall 请求内核服务。",
    next: ["user-ecall"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "user-ecall", {
    eventName: "用户程序发起 ecall",
    knowledge: "系统调用 ABI 与 U-mode Trap",
    file: "kernel/src/trap.rs",
    symbol: "rust_trap_handler / handle_user_ecall",
    cause: "用户程序需要 write、yield 或 exit 等受保护服务。",
    effect: "CPU 从 U-mode 进入 S-mode Trap，参数保留在 a0-a5，系统调用号位于 a7。",
    next: ["syscall-dispatched", "console-write", "syscall-yield", "user-exit"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "syscall-dispatched", {
    eventName: "分发系统调用",
    knowledge: "系统调用号、参数与内核服务分派",
    file: "kernel/src/syscall.rs",
    symbol: "dispatch / SyscallRequest",
    cause: "Trap handler 已读取 a7 和参数寄存器并构造请求。",
    effect: "请求被转换为 Write、Yield、Exit、Open、Read 或 Close 等受控结果。",
    next: ["console-write", "syscall-yield", "user-exit", "user-return"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "console-write", {
    eventName: "完成 write 系统调用",
    knowledge: "用户请求到内核控制台服务的受控路径",
    file: "kernel/src/trap.rs",
    symbol: "handle_user_ecall",
    cause: "dispatch 已识别 stdout write 请求并验证参数。",
    effect: "内核输出用户消息，返回值写入 a0，准备恢复用户态。",
    next: ["user-return", "user-ecall"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "syscall-yield", {
    eventName: "完成 yield 系统调用",
    knowledge: "用户态协作让出 CPU",
    file: "kernel/src/trap.rs",
    symbol: "handle_user_ecall / syscall::dispatch",
    cause: "用户程序通过 ecall 请求 Yield。",
    effect: "内核确认请求并返回成功；教学实现保留清晰的 syscall 往返证据。",
    next: ["user-return", "user-ecall"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "user-return", {
    eventName: "返回用户态",
    knowledge: "系统调用返回值、sepc 与 sret",
    file: "kernel/src/trap.rs",
    symbol: "handle_user_ecall / __trap_restore_user",
    cause: "系统调用已经完成，sepc 已越过用户 ecall 指令。",
    effect: "a0 携带返回值，TrapFrame 恢复后继续执行用户程序。",
    next: ["user-ecall", "user-exit"],
    knowledgeNode: NODE.privilege
  });
  define("lab6", "user-exit", {
    eventName: "用户程序退出",
    knowledge: "用户态生命周期与 exit 系统调用",
    file: "kernel/src/trap.rs",
    symbol: "handle_user_ecall",
    cause: "用户程序通过 ecall 请求 Exit。",
    effect: "内核记录退出状态，Lab6 用户态往返闭环完成。",
    next: ["pass"],
    knowledgeNode: NODE.privilege
  });

  define("lab7", "start", {
    eventName: "进入文件 I/O 实验",
    knowledge: "用户系统调用、fd、文件对象与设备的组合链路",
    file: "kernel/src/trap.rs",
    symbol: "handle_user_ecall",
    cause: "用户程序开始执行文件打开、写入、关闭和读回流程。",
    effect: "文件实验进入运行状态，等待 open 请求。",
    next: ["file-open"],
    knowledgeNode: NODE.file
  });
  define("lab7", "file-open", {
    eventName: "打开文件",
    knowledge: "文件描述符表与打开文件状态",
    file: "kernel/src/fs/mod.rs",
    symbol: "SimpleFs::open",
    cause: "用户 open 系统调用已被内核分发到 SimpleFs。",
    effect: "空闲槽位被标记为打开并返回 fd，offset 从 0 开始。",
    next: ["file-write", "file-read"],
    knowledgeNode: NODE.file
  });
  define("lab7", "file-write", {
    eventName: "写入文件",
    knowledge: "用户缓冲区、文件 offset 与字节设备写入",
    file: "kernel/src/fs/mod.rs",
    symbol: "SimpleFs::write / ByteDevice::write_at",
    cause: "已打开 fd 收到 write 请求，用户缓冲区检查通过。",
    effect: "字节写入 RamDevice，文件 offset 按实际写入长度推进。",
    next: ["file-close"],
    knowledgeNode: NODE.file
  });
  define("lab7", "file-close", {
    eventName: "关闭文件",
    knowledge: "fd 生命周期与失效规则",
    file: "kernel/src/fs/mod.rs",
    symbol: "SimpleFs::close",
    cause: "本轮写入完成，需要结束当前打开文件状态。",
    effect: "fd 对应槽位失效；后续访问必须重新 open。",
    next: ["file-open", "file-read"],
    knowledgeNode: NODE.file
  });
  define("lab7", "file-read", {
    eventName: "读回文件内容",
    knowledge: "文件 offset、设备读取与用户缓冲区复制",
    file: "kernel/src/fs/mod.rs",
    symbol: "SimpleFs::read / ByteDevice::read_at",
    cause: "文件重新打开后，用户发起 read 请求验证已写内容。",
    effect: "RamDevice 字节复制到用户缓冲区，offset 按读取长度推进。",
    next: ["file-verified", "file-close"],
    knowledgeNode: NODE.file
  });
  define("lab7", "file-verified", {
    eventName: "验证文件内容一致",
    knowledge: "open/write/close/read 的端到端文件语义",
    file: "kernel/src/trap.rs",
    symbol: "handle_user_ecall / fs::mark_verified",
    cause: "用户缓冲区已经收到从 RamDevice 读回的字节。",
    effect: "读回内容与预期字节一致，文件 I/O 闭环获得真实运行证据。",
    next: ["file-close", "pass"],
    knowledgeNode: NODE.file
  });

  function labDocument(lab) {
    return lab === "p0" ? "README.md" : `docs/labs/${lab}.md`;
  }

  function genericEntry(lab, step) {
    if (!VALID_LABS.has(lab)) return null;
    const labLabel = lab === "p0" ? "P0" : lab.replace("lab", "Lab");
    if (["start", "pass", "todo", "fail", "panic"].includes(step)) {
      const values = {
        start: ["开始运行", "实验入口与运行生命周期", "当前 Lab 的入口已经执行。", "实验状态进入运行中，等待更细粒度证据。"],
        pass: ["实验验收通过", "目标 PASS 标记与阶段完成证据", "验收条件已经被真实输出满足。", "当前实验状态变为通过。"],
        todo: ["Starter 停在 TODO", "未完成任务作为教学停点", "当前 starter 尚未实现这一任务。", "状态保持 TODO，不会被当作完成。"],
        fail: ["实验运行失败", "失败证据与故障定位", "构建、运行或显式检查报告失败。", "当前实验状态变为失败，后续进度停止。"],
        panic: ["内核发生 panic", "不可恢复错误与串口诊断", "内核触发不可恢复错误。", "运行状态变为失败，并保留原始诊断信息。"]
      }[step];
      return {
        key: eventKey(lab, step), lab, step,
        eventName: `${labLabel} ${values[0]}`,
        knowledge: values[1],
        file: labDocument(lab),
        symbol: `[${labLabel}] ${step.toUpperCase()} marker`,
        cause: values[2],
        effect: values[3],
        next: step === "start" && lab !== "p0" ? ["task-1-evidence"] : [],
        knowledgeNode: lab === "p0" || lab === "lab1" ? NODE.console
          : lab === "lab2" ? NODE.trap
            : ["lab3", "lab4"].includes(lab) ? NODE.memory
              : lab === "lab5" ? NODE.schedule
                : lab === "lab6" ? NODE.privilege : NODE.file
      };
    }

    const task = step.match(/^task-([1-3])-(pass|todo|evidence)$/);
    if (!task || lab === "p0") return null;
    const statusText = { pass: "阶段检查通过", todo: "任务尚待完成", evidence: "记录阶段证据" }[task[2]];
    return {
      key: eventKey(lab, step), lab, step,
      eventName: `任务 ${task[1]}：${statusText}`,
      knowledge: `${labLabel} 分阶段任务与证据链`,
      file: labDocument(lab),
      symbol: `[${labLabel}-T${task[1]}] marker`,
      cause: "实验输出了稳定的任务级标记。",
      effect: task[2] === "pass" ? "对应任务获得通过证据。" : task[2] === "todo" ? "页面保留教学停点。" : "页面记录过程证据但不提前判定通过。",
      next: task[2] === "pass" && Number(task[1]) < 3 ? [`task-${Number(task[1]) + 1}-pass`] : ["pass"],
      knowledgeNode: lab === "lab1" ? NODE.console : lab === "lab2" ? NODE.trap
        : ["lab3", "lab4"].includes(lab) ? NODE.memory : lab === "lab5" ? NODE.schedule
          : lab === "lab6" ? NODE.privilege : NODE.file
    };
  }

  function rawSummary(candidate) {
    const event = candidate && typeof candidate === "object" ? candidate : { raw: candidate };
    const raw = {};
    for (const field of ["protocol", "lab", "step", "status", "detail", "source", "raw"]) {
      if (event[field] !== undefined && event[field] !== null && text(event[field])) {
        raw[field] = text(event[field], field === "detail" || field === "raw" ? 500 : 120);
      }
    }
    return JSON.stringify(raw, null, 2) || "{}";
  }

  function lookupCatalogEntry(labValue, stepValue) {
    const lab = text(labValue, 20).toLowerCase();
    const step = text(stepValue, 80).toLowerCase();
    const entry = catalog[eventKey(lab, step)] || genericEntry(lab, step);
    return entry ? { ...entry, next: [...entry.next] } : null;
  }

  function resolveEventKnowledge(candidate) {
    const event = candidate && typeof candidate === "object" ? candidate : { raw: candidate };
    const protocol = text(event.protocol, 40);
    const lab = text(event.lab, 20).toLowerCase();
    const step = text(event.step, 80).toLowerCase();
    const entry = protocol === EVENT_PROTOCOL ? lookupCatalogEntry(lab, step) : null;
    const original = text(event.detail || event.raw || step || "未提供事件内容", 500);

    if (!entry) {
      return {
        catalogVersion: CATALOG_VERSION,
        key: eventKey(lab || "unknown", step || "unknown"),
        known: false,
        lab: lab || "unknown",
        step: step || "unknown",
        eventName: step ? `未登记事件：${step.replaceAll("-", " ")}` : "无法识别的旧格式事件",
        explanation: original,
        knowledge: "未登记知识节点",
        file: null,
        symbol: "未提供",
        cause: original,
        effect: `保留原始状态：${text(event.status, 40) || "unknown"}；不自动推进知识地图。`,
        nextEvents: [],
        knowledgeNode: null,
        raw: rawSummary(event)
      };
    }

    const nextEvents = entry.next.map((next) => {
      const splitAt = next.indexOf(":");
      const nextLab = splitAt > 0 ? next.slice(0, splitAt) : lab;
      const nextStep = splitAt > 0 ? next.slice(splitAt + 1) : next;
      const nextEntry = lookupCatalogEntry(nextLab, nextStep);
      return {
        lab: nextLab,
        step: nextStep,
        name: nextEntry?.eventName || nextStep.replaceAll("-", " ")
      };
    });
    return {
      catalogVersion: CATALOG_VERSION,
      key: entry.key,
      known: true,
      lab,
      step,
      eventName: entry.eventName,
      explanation: original,
      knowledge: entry.knowledge,
      file: entry.file,
      symbol: entry.symbol,
      cause: entry.cause,
      effect: entry.effect,
      nextEvents,
      knowledgeNode: entry.knowledgeNode,
      raw: rawSummary(event)
    };
  }

  const EVENT_CATALOG = Object.freeze({ ...catalog });
  const api = {
    CATALOG_VERSION,
    EVENT_PROTOCOL,
    EVENT_CATALOG,
    eventKey,
    isRepositoryPath,
    lookupCatalogEntry,
    resolveEventKnowledge
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsEventCatalog = api;
})();
