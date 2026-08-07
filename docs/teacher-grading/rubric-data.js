(function (root, factory) {
    const data = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = data;
    }
    root.OS_TEACHER_RUBRICS = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const commonChecks = [
        { id: "fmt", label: "cargo fmt --all -- --check", kind: "automatic" },
        { id: "build", label: "cargo build -p ai-os-kernel", kind: "automatic" },
        { id: "clippy", label: "cargo clippy -p ai-os-kernel -- -D warnings", kind: "automatic" },
        { id: "qemu", label: "对应 scripts/test-labN.ps1", kind: "automatic" },
        { id: "scope", label: "未修改禁止变更的基础设施或测试判定", kind: "manual" },
        { id: "explain", label: "学生能解释关键控制流、状态或安全前提", kind: "manual" }
    ];

    const labs = [
        {
            id: "lab1",
            name: "Lab1 启动与 SBI 控制台",
            passMarker: "[Lab1] PASS",
            todoMarker: "[Lab1] TODO",
            previousMarkers: [],
            estimatedHours: "2–4 小时",
            objectives: [
                "理解 OpenSBI、S-mode 内核与 QEMU virt 的启动关系。",
                "解释 _start 如何建立启动栈并进入 kernel_main。",
                "追踪 console 到 SBI ecall 的逐字符输出路径。"
            ],
            criteria: [
                { id: "boot", title: "启动入口与栈", max: 20, evidence: "_start 正确设置 64 KiB 启动栈；sp 指向对齐后的栈顶；跳转 kernel_main。" },
                { id: "console", title: "控制台封装", max: 20, evidence: "print_line/print_str 逐字节输出并补换行，职责边界清楚。" },
                { id: "sbi", title: "SBI 调用路径", max: 25, evidence: "a0 传字符、a7 传 SBI console id，并能解释 ecall 的特权级边界。" },
                { id: "run", title: "运行与退出", max: 20, evidence: "QEMU 输出稳定 PASS；SBI reset 能结束运行；未通过修改测试脚本绕过任务。" },
                { id: "oral", title: "代码说明与口试", max: 15, evidence: "能区分 OpenSBI banner 与内核日志，并解释 no_std/no_main。" }
            ],
            codeChecks: ["kernel/src/boot.rs", "kernel/src/console.rs", "kernel/src/sbi.rs", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "只看到 OpenSBI banner", cause: "内核入口、栈或 console 路径未到达。", deduction: "根据启动入口和输出链完成度扣 5–20 分。" },
                { symptom: "日志存在但测试不识别", cause: "标志拼写、换行或输出顺序不稳定。", deduction: "运行与退出项扣 3–10 分。" },
                { symptom: "QEMU 超时", cause: "未调用 reset 或控制流进入死循环。", deduction: "运行与退出项最高得 8/20。" }
            ],
            oralQuestions: [
                { q: "为什么 Rust 裸机入口必须手动设置 sp？", points: ["没有宿主运行时替内核建立栈", "Rust 函数调用需要合法栈", "栈顶应满足 ABI 对齐"] },
                { q: "SBI 和系统调用有什么区别？", points: ["SBI 是 S-mode 内核调用 M-mode 固件", "系统调用通常是 U-mode 程序调用 S-mode 内核", "两者都可使用 ecall，但调用方和 ABI 不同"] },
                { q: "为什么先实现 console？", points: ["裸机早期缺少调试设施", "串口日志可观察启动路径", "后续实验依赖稳定诊断输出"] }
            ]
        },
        {
            id: "lab2",
            name: "Lab2 Trap 与异常处理",
            passMarker: "[Lab2] PASS",
            todoMarker: "[Lab2] TODO",
            previousMarkers: ["[Lab1] PASS"],
            estimatedHours: "4–6 小时",
            objectives: ["设置 stvec 并进入统一 trap 入口。", "保存/恢复上下文并解释关键 CSR。", "处理 breakpoint 后推进 sepc。"],
            criteria: [
                { id: "stvec", title: "Trap 入口安装", max: 20, evidence: "stvec 指向对齐的有效入口，direct mode 使用正确。" },
                { id: "frame", title: "上下文保存与恢复", max: 25, evidence: "汇编保存布局与 Rust TrapFrame 一致，返回前完整恢复。" },
                { id: "handler", title: "异常识别与返回", max: 25, evidence: "正确读取 scause/sepc/stval；识别 cause=3；32 位 ebreak 后 sepc += 4。" },
                { id: "run", title: "测试与回归", max: 15, evidence: "真实触发 breakpoint，日志显示进入 handler，Lab1 不回归。" },
                { id: "oral", title: "安全前提与口试", max: 15, evidence: "能解释 unsafe、入口对齐、指令长度和重复异常风险。" }
            ],
            codeChecks: ["kernel/src/trap.rs", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "ebreak 后反复输出或卡死", cause: "sepc 未推进或推进长度错误。", deduction: "异常识别与返回项最高得 12/25。" },
                { symptom: "进入 trap 后立即崩溃", cause: "保存区大小、偏移或恢复顺序不一致。", deduction: "上下文项扣 10–25 分。" },
                { symptom: "unexpected cause", cause: "未屏蔽 interrupt bit 或 cause code 判断错误。", deduction: "handler 项扣 5–15 分。" }
            ],
            oralQuestions: [
                { q: "为什么 breakpoint 处理后需要修改 sepc？", points: ["sepc 指向异常指令", "不推进会重复执行 ebreak", "本实验使用明确的 32 位指令，因此加 4"] },
                { q: "scause 的最高位表示什么？", points: ["表示中断还是同步异常", "剩余位保存 cause code"] },
                { q: "TrapFrame 为什么必须与汇编布局一致？", points: ["Rust 通过固定偏移解释栈上数据", "布局不一致会读错寄存器并破坏恢复现场"] }
            ]
        },
        {
            id: "lab3",
            name: "Lab3 物理内存管理",
            passMarker: "[Lab3] PASS",
            todoMarker: "[Lab3] TODO",
            previousMarkers: ["[Lab1] PASS", "[Lab2] PASS"],
            estimatedHours: "6–8 小时",
            objectives: ["区分物理地址和物理页号。", "实现固定范围页帧分配与回收。", "检测越界释放和重复释放。"],
            criteria: [
                { id: "address", title: "地址与页号运算", max: 20, evidence: "floor、ceil、offset、start_address 对齐和边界行为正确。" },
                { id: "alloc", title: "初始化与分配", max: 25, evidence: "管理 [start,end)；不覆盖 ekernel；唯一、对齐、耗尽行为正确。" },
                { id: "dealloc", title: "释放与一致性", max: 25, evidence: "回收页优先复用；拒绝越界、未分配和 double free。" },
                { id: "tests", title: "单元测试与 QEMU", max: 15, evidence: "主机测试覆盖边界；QEMU PASS；Lab1–2 不回归。" },
                { id: "oral", title: "设计说明与口试", max: 15, evidence: "能解释半开区间、固定回收栈和 ekernel 安全边界。" }
            ],
            codeChecks: ["kernel/src/memory/address.rs", "kernel/src/memory/frame_allocator.rs", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "对齐地址 ceil 后多一页", cause: "ceil 公式对整除情况处理错误。", deduction: "地址运算项扣 5–12 分。" },
                { symptom: "分配页覆盖内核或启动数据", cause: "起点未使用 ceil(ekernel) 或上界错误。", deduction: "严重安全错误，本实验总分建议封顶 59。" },
                { symptom: "同一页被返回两次", cause: "重复释放未检测或回收栈状态损坏。", deduction: "释放项最高得 10/25。" }
            ],
            oralQuestions: [
                { q: "为什么使用 [start, end) 半开区间？", points: ["长度为 end-start", "空区间表达自然", "边界判断和迭代更简单"] },
                { q: "为什么不能从 0x80200000 开始分配？", points: ["该区域包含内核镜像", "还可能包含 BSS 和启动栈", "应从链接符号 ekernel 之后开始"] },
                { q: "double free 为什么危险？", points: ["同一页可能进入回收池多次", "后续会把同一物理页分给多个所有者", "导致数据互相覆盖"] }
            ]
        },
        {
            id: "lab4",
            name: "Lab4 Sv39 虚拟内存",
            passMarker: "[Lab4] PASS",
            todoMarker: "[Lab4] TODO",
            previousMarkers: ["[Lab1] PASS", "[Lab2] PASS", "[Lab3] PASS"],
            estimatedHours: "8–12 小时",
            objectives: ["拆分 Sv39 VPN 索引并理解 PTE。", "创建三级页表和叶子映射。", "以分段权限激活 satp。"],
            criteria: [
                { id: "pte", title: "地址结构与 PTE", max: 20, evidence: "VPN2/1/0、offset、PPN 和 V/R/W/X/A/D 位解析正确。" },
                { id: "walk", title: "三级页表操作", max: 25, evidence: "按需分配中间页表，实现 map/unmap/translate 并处理重复映射。" },
                { id: "mapping", title: "映射与权限", max: 25, evidence: "text RX、rodata R、data/bss RW；映射当前代码和栈；页表页所有权清楚。" },
                { id: "activate", title: "激活与真实运行", max: 15, evidence: "satp mode=8，根 PPN 正确，执行 sfence.vma，激活后继续运行。" },
                { id: "oral", title: "测试与口试", max: 15, evidence: "主机/QEMU 测试通过，能解释恒等映射和最小权限。" }
            ],
            codeChecks: ["kernel/src/memory/virtual_address.rs", "kernel/src/memory/page_table.rs", "kernel/src/main.rs", "kernel/linker.ld"],
            commonErrors: [
                { symptom: "写 satp 后无输出", cause: "当前代码、数据、BSS 或栈映射缺失。", deduction: "映射与激活两项合计最高得 18/40。" },
                { symptom: "translate 找不到已映射页", cause: "VPN 顺序反、PTE V 位遗漏或非叶子判断错误。", deduction: "三级页表项扣 8–20 分。" },
                { symptom: "所有段统一 RWX", cause: "没有落实最小权限原则。", deduction: "映射与权限项扣 8–15 分。" }
            ],
            oralQuestions: [
                { q: "Sv39 为什么每级索引是 9 位？", points: ["页表页 4 KiB", "每项 8 字节", "一页 512 项即 2^9"] },
                { q: "叶子 PTE 与非叶子 PTE 如何区分？", points: ["有效位必须设置", "R/W/X 至少一位表示叶子", "非叶子通常只有 V 并指向下一级"] },
                { q: "为什么写 satp 后执行 sfence.vma？", points: ["刷新旧地址翻译缓存", "确保后续访问使用新页表"] }
            ]
        },
        {
            id: "lab5",
            name: "Lab5 协作式调度",
            passMarker: "[Lab5] PASS",
            todoMarker: "[Lab5] TODO",
            previousMarkers: ["[Lab1] PASS", "[Lab2] PASS", "[Lab3] PASS", "[Lab4] PASS"],
            estimatedHours: "8–12 小时",
            objectives: ["建立任务上下文、TCB 和独立内核栈。", "实现 Ready/Running/Exited 状态机。", "实现 round-robin 与真实上下文切换。"],
            criteria: [
                { id: "tcb", title: "任务抽象与初始上下文", max: 20, evidence: "ra 指向入口，sp 16 字节对齐，静态任务表/栈边界正确。" },
                { id: "schedule", title: "轮转调度与状态机", max: 25, evidence: "next_scan 轮转；yield 返回 Ready；Exited 不再被调度。" },
                { id: "switch", title: "上下文切换", max: 25, evidence: "__switch 保存并恢复 ra、sp、s0..s11，偏移与 TaskContext 一致。" },
                { id: "run", title: "QEMU 顺序与回归", max: 15, evidence: "A1/B1/C1/A2/B2/C2 稳定，调度器结束，Lab1–4 不回归。" },
                { id: "oral", title: "边界说明与口试", max: 15, evidence: "能解释协作式与抢占式差别、callee-saved 边界和独立栈。" }
            ],
            codeChecks: ["kernel/src/task/mod.rs", "kernel/src/task/switch.S", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "第一个任务运行后其他任务不执行", cause: "任务未 yield，或切回调度器上下文失败。", deduction: "调度与切换项合计扣 15–40 分。" },
                { symptom: "任务第二步顺序混乱", cause: "next_scan 更新或状态回写错误。", deduction: "轮转调度项扣 6–15 分。" },
                { symptom: "切换后崩溃", cause: "sp 未对齐、ra 错误或 s 寄存器偏移不匹配。", deduction: "上下文切换项最高得 10/25。" }
            ],
            oralQuestions: [
                { q: "为什么这里只保存 callee-saved 寄存器？", points: ["切换发生在函数调用边界", "调用者保存寄存器由调用约定处理", "ra/sp 和 s0..s11 必须跨调用保持"] },
                { q: "任务永远不 yield 会怎样？", points: ["协作式调度不会强制抢占", "其他任务会饥饿"] },
                { q: "为什么任务需要独立栈？", points: ["保存各自调用链和局部变量", "切换后能从原调用位置继续"] }
            ]
        },
        {
            id: "lab6",
            name: "Lab6 用户态与系统调用",
            passMarker: "[Lab6] PASS",
            todoMarker: "[Lab6] TODO",
            previousMarkers: ["[Lab1] PASS", "[Lab2] PASS", "[Lab3] PASS", "[Lab4] PASS", "[Lab5] PASS"],
            estimatedHours: "8–12 小时",
            objectives: ["准备 U-mode 上下文并通过 sret 进入用户态。", "通过 sscratch 切换到内核 trap 栈。", "实现最小 syscall ABI 和分发。"],
            criteria: [
                { id: "user", title: "用户上下文与映射", max: 25, evidence: "用户 text 为 U|R|X，栈为 U|R|W；sepc/栈顶/SPP/SPIE 正确。" },
                { id: "trap", title: "用户 Trap 路径", max: 20, evidence: "sscratch 指向内核 trap 栈，U-mode ecall 能安全进入并返回 S-mode handler。" },
                { id: "syscall", title: "系统调用 ABI", max: 25, evidence: "a7/a0..a5/a0 约定一致；write/exit/yield 分发；ecall 后 sepc += 4。" },
                { id: "run", title: "用户程序与回归", max: 15, evidence: "真实 sret/ecall 路径输出 hello、write/exit marker 和 PASS；Lab1–5 不回归。" },
                { id: "oral", title: "权限与口试", max: 15, evidence: "能解释 U/S 权限边界、内核栈和用户指针限制。" }
            ],
            codeChecks: ["kernel/src/user.rs", "kernel/src/syscall.rs", "kernel/src/trap.rs", "kernel/src/memory/page_table.rs"],
            commonErrors: [
                { symptom: "sret 后立即异常", cause: "SPP、sepc、U 位、用户栈或 sscratch 配置错误。", deduction: "用户上下文与 trap 两项合计扣 12–35 分。" },
                { symptom: "write syscall 反复触发", cause: "ecall 后 sepc 未加 4。", deduction: "系统调用项最高得 14/25。" },
                { symptom: "handler 使用用户栈保存内核现场", cause: "sscratch 切栈路径缺失。", deduction: "严重权限边界错误，用户 Trap 项最高得 8/20。" }
            ],
            oralQuestions: [
                { q: "sstatus.SPP 为什么必须清零？", points: ["sret 根据 SPP 决定返回特权级", "清零表示返回 U-mode"] },
                { q: "系统调用号和参数放在哪里？", points: ["a7 是 syscall id", "a0..a5 是参数", "a0 返回结果"] },
                { q: "为什么要切换到内核 trap 栈？", points: ["用户栈不可信且容量未知", "内核上下文必须保存在受控内存"] }
            ]
        },
        {
            id: "lab7",
            name: "Lab7 设备与简化文件系统",
            passMarker: "[Lab7] PASS",
            todoMarker: "[Lab7] TODO",
            previousMarkers: ["[Lab1] PASS", "[Lab2] PASS", "[Lab3] PASS", "[Lab4] PASS", "[Lab5] PASS", "[Lab6] PASS"],
            estimatedHours: "8–12 小时",
            objectives: ["实现按 offset 读写的 RAM 字节设备。", "实现 fd 表、独立 offset 与 close 语义。", "通过用户系统调用完成文件 I/O 闭环。"],
            criteria: [
                { id: "device", title: "内存设备抽象", max: 20, evidence: "read_at/write_at 正确处理 offset、长度和越界，读回内容一致。" },
                { id: "fs", title: "文件系统与 fd", max: 25, evidence: "open/read/write/close、fd>=3、独立 offset、容量和失效检查正确。" },
                { id: "syscall", title: "用户 I/O 与安全边界", max: 25, evidence: "syscall 分发正确；console/file write 区分；用户缓冲区检查与 SUM 恢复正确。" },
                { id: "run", title: "测试与端到端运行", max: 15, evidence: "主机测试覆盖错误路径；QEMU write/read verified；Lab6 不回归。" },
                { id: "oral", title: "抽象说明与口试", max: 15, evidence: "能解释设备、文件对象、fd 表、offset 和教学版边界。" }
            ],
            codeChecks: ["kernel/src/drivers/mod.rs", "kernel/src/fs/mod.rs", "kernel/src/syscall.rs", "kernel/src/trap.rs", "kernel/src/user.rs"],
            commonErrors: [
                { symptom: "重复读总是从文件开头开始", cause: "fd 的当前 offset 未推进。", deduction: "文件系统项扣 6–12 分。" },
                { symptom: "close 后仍能访问", cause: "fd 表项未清空或查找未验证有效性。", deduction: "文件系统项扣 5–10 分。" },
                { symptom: "任意用户地址都能被 S-mode 访问", cause: "用户缓冲区校验缺失或 SUM 未恢复。", deduction: "严重安全错误，用户 I/O 项最高得 10/25。" }
            ],
            oralQuestions: [
                { q: "为什么 fd 从 3 开始？", points: ["类 Unix 约定 0/1/2 对应标准输入输出错误", "教学文件从 3 开始便于区分"] },
                { q: "为什么每个打开文件需要独立 offset？", points: ["不同打开实例有独立读取进度", "fd 是打开状态而不只是文件编号"] },
                { q: "SUM 的作用和使用边界是什么？", points: ["允许 S-mode 访问 U 页面", "只在复制用户数据时临时开启", "操作后恢复原 sstatus"] }
            ]
        }
    ];

    return {
        schema: "os-teacher-grading/v1",
        commonChecks,
        labs
    };
});
