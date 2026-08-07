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
        { id: "build", label: "cargo build -p ai-os-kernel --target riscv64gc-unknown-none-elf", kind: "automatic" },
        { id: "clippy", label: "cargo clippy -p ai-os-kernel --target riscv64gc-unknown-none-elf -- -D warnings", kind: "automatic" },
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
                { id: "stage1", title: "Stage 1：启动路径理解与输出", max: 25, evidence: "能说明 _start、启动栈与 kernel_main 的关系，并提供 Stage 1 输出证据。" },
                { id: "stage2", title: "Stage 2：console 接口实现", max: 35, evidence: "console_putchar/console_write 真正输出传入内容，SBI ecall 路径与换行处理正确。" },
                { id: "stage3", title: "Stage 3：完整日志与正常关机", max: 25, evidence: "最终输出顺序、[Lab1] PASS 与 SBI 正常关机符合验收要求。" },
                { id: "explanation", title: "代码清晰度和实验说明（含口试）", max: 15, evidence: "代码清晰；实验说明和口试能区分 OpenSBI 与内核日志，并解释 no_std/no_main。" }
            ],
            codeChecks: ["kernel/src/boot.rs", "kernel/src/console.rs", "kernel/src/sbi.rs", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "只看到 OpenSBI banner", cause: "内核入口、栈或 console 路径未到达。", deduction: "根据启动入口和输出链完成度扣 5–20 分。" },
                { symptom: "日志存在但测试不识别", cause: "标志拼写、换行或输出顺序不稳定。", deduction: "Stage 3 项扣 3–10 分。" },
                { symptom: "QEMU 超时", cause: "未调用 reset 或控制流进入死循环。", deduction: "Stage 3 项最高得 10/25。" }
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
                { id: "stage1", title: "Stage 1：trap 入口与 stvec", max: 30, evidence: "stvec 指向有效的 direct-mode trap 入口，保存/恢复布局与 Rust 结构一致。" },
                { id: "stage2", title: "Stage 2：异常原因读取和识别", max: 30, evidence: "正确读取并解释 scause、sepc、stval，识别同步 breakpoint。" },
                { id: "stage3", title: "Stage 3：sepc 推进和返回", max: 30, evidence: "真实触发 32 位 ebreak，sepc += 4 后恢复现场并继续执行。" },
                { id: "explanation", title: "说明文档和代码清晰度（含口试）", max: 10, evidence: "说明清楚；口试能解释 interrupt bit、指令长度和重复异常风险。" }
            ],
            codeChecks: ["kernel/src/trap.rs", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "ebreak 后反复输出或卡死", cause: "sepc 未推进或推进长度错误。", deduction: "Stage 3 项最高得 15/30。" },
                { symptom: "进入 trap 后立即崩溃", cause: "保存区大小、偏移或恢复顺序不一致。", deduction: "Stage 1/3 相关项合计扣 10–30 分。" },
                { symptom: "unexpected cause", cause: "未屏蔽 interrupt bit 或 cause code 判断错误。", deduction: "Stage 2 项扣 5–15 分。" }
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
                { id: "stage1", title: "Stage 1：地址和页号转换", max: 30, evidence: "floor、ceil、page_offset 与 start_address 的对齐和边界行为正确。" },
                { id: "stage2", title: "Stage 2：基本分配", max: 30, evidence: "正确管理 [start,end)，不覆盖 ekernel，分配唯一、对齐且能正确耗尽。" },
                { id: "stage3", title: "Stage 3：释放、复用和错误检查", max: 30, evidence: "释放页可复用，并拒绝越界、未分配和重复释放。" },
                { id: "explanation", title: "代码清晰度和解释（含口试）", max: 10, evidence: "代码清晰；口试能解释半开区间、固定回收栈和 ekernel 安全边界。" }
            ],
            codeChecks: ["kernel/src/memory/address.rs", "kernel/src/memory/frame_allocator.rs", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "对齐地址 ceil 后多一页", cause: "ceil 公式对整除情况处理错误。", deduction: "地址运算项扣 5–12 分。" },
                { symptom: "分配页覆盖内核或启动数据", cause: "起点未使用 ceil(ekernel) 或上界错误。", deduction: "严重安全错误，本实验总分建议封顶 59。" },
                { symptom: "同一页被返回两次", cause: "重复释放未检测或回收栈状态损坏。", deduction: "Stage 3 项最高得 12/30。" }
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
                { id: "stage1", title: "任务一：Sv39 地址和 PTE 基础", max: 25, evidence: "VPN2/1/0、offset、PPN 与 PTE flags 的解析符合 Sv39。" },
                { id: "stage2", title: "任务二：页表映射与查询", max: 35, evidence: "按需分配中间页表，实现 map/unmap/translate 并正确拒绝重复映射。" },
                { id: "stage3", title: "任务三：内核恒等映射与分页激活", max: 30, evidence: "分段权限正确；satp mode=8，执行 sfence.vma，激活后继续运行。" },
                { id: "explanation", title: "代码可读性和实验报告（含口试）", max: 10, evidence: "代码和报告清晰；口试能解释恒等映射、最小权限和实现边界。" }
            ],
            codeChecks: ["kernel/src/memory/virtual_address.rs", "kernel/src/memory/page_table.rs", "kernel/src/main.rs", "kernel/linker.ld"],
            commonErrors: [
                { symptom: "写 satp 后无输出", cause: "当前代码、数据、BSS 或栈映射缺失。", deduction: "任务三项最高得 18/30。" },
                { symptom: "translate 找不到已映射页", cause: "VPN 顺序反、PTE V 位遗漏或非叶子判断错误。", deduction: "任务二项扣 8–20 分。" },
                { symptom: "所有段统一 RWX", cause: "没有落实最小权限原则。", deduction: "任务三项扣 8–15 分。" }
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
                { id: "stage1", title: "任务一：任务抽象与任务表", max: 25, evidence: "ra 指向入口，sp 16 字节对齐，固定任务表和独立栈边界正确。" },
                { id: "stage2", title: "任务二：协作式轮转调度", max: 30, evidence: "next_scan 轮转；yield 返回 Ready；Exited 任务不再被调度。" },
                { id: "stage3", title: "任务三：上下文切换", max: 35, evidence: "__switch 保存/恢复 ra、sp、s0..s11，且 A/B/C 交替输出和退出正确。" },
                { id: "explanation", title: "代码可读性和实验报告（含口试）", max: 10, evidence: "代码和报告清晰；口试能解释协作式边界、callee-saved 与独立栈。" }
            ],
            codeChecks: ["kernel/src/task/mod.rs", "kernel/src/task/switch.S", "kernel/src/main.rs"],
            commonErrors: [
                { symptom: "第一个任务运行后其他任务不执行", cause: "任务未 yield，或切回调度器上下文失败。", deduction: "调度与切换项合计扣 15–40 分。" },
                { symptom: "任务第二步顺序混乱", cause: "next_scan 更新或状态回写错误。", deduction: "轮转调度项扣 6–15 分。" },
                { symptom: "切换后崩溃", cause: "sp 未对齐、ra 错误或 s 寄存器偏移不匹配。", deduction: "任务三项最高得 14/35。" }
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
                { id: "stage1", title: "任务一：用户态上下文边界", max: 25, evidence: "用户映射、sepc、栈顶、SPP 与 SPIE 设置正确，能通过 sret 进入 U-mode。" },
                { id: "stage2", title: "任务二：系统调用 ABI", max: 30, evidence: "a7/a0..a5/a0 约定一致，write/yield/exit 分发和未知调用处理正确。" },
                { id: "stage3", title: "任务三：最小用户程序验收", max: 35, evidence: "真实完成 sret/ecall、内核 trap 栈切换、sepc 推进与用户程序退出。" },
                { id: "explanation", title: "代码可读性和实验报告（含口试）", max: 10, evidence: "代码和报告清晰；口试能解释 U/S 权限、syscall ABI 和内核栈边界。" }
            ],
            codeChecks: ["kernel/src/user.rs", "kernel/src/syscall.rs", "kernel/src/trap.rs", "kernel/src/memory/page_table.rs"],
            commonErrors: [
                { symptom: "sret 后立即异常", cause: "SPP、sepc、U 位、用户栈或 sscratch 配置错误。", deduction: "用户上下文与 trap 两项合计扣 12–35 分。" },
                { symptom: "write syscall 反复触发", cause: "ecall 后 sepc 未加 4。", deduction: "任务二项最高得 17/30。" },
                { symptom: "handler 使用用户栈保存内核现场", cause: "sscratch 切栈路径缺失。", deduction: "严重权限边界错误，任务三项最高得 12/35。" }
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
                { id: "stage1", title: "任务一：RAM 字节设备", max: 30, evidence: "read_at/write_at 正确处理 offset、长度、溢出和越界，读回内容一致。" },
                { id: "stage2", title: "任务二：SimpleFs 与 fd 表", max: 35, evidence: "open/read/write/close、fd>=3、独立 offset、容量和失效检查正确。" },
                { id: "stage3", title: "任务三：用户态文件 I/O", max: 25, evidence: "用户 syscall 完成 open/write/read/close 闭环，缓冲区校验和 SUM 恢复正确。" },
                { id: "explanation", title: "文档、解释和代码可读性（含口试）", max: 10, evidence: "文档和代码清晰；口试能解释设备层、fd 表、offset 和教学边界。" }
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
