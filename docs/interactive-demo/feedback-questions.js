(function initFeedbackQuestions(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OsFeedbackQuestions = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createFeedbackQuestions() {
  "use strict";

  function question(id, dimension, prompt, lowLabel, highLabel) {
    return Object.freeze({ id, dimension, prompt, lowLabel, highLabel });
  }

  const SETS = Object.freeze({
    overview: Object.freeze({
      title: "OS 实验知识地图专项评价",
      description: "当前分支展示完整实验路线，下面的问题关注知识联系与可视化是否清楚。",
      questions: Object.freeze([
        question("overview-chain", "掌握度", "你能否说明 P0、启动、Trap、内存、调度、用户态和文件系统之间的先后依赖？", "完全不能", "能够独立说明"),
        question("overview-branch", "清晰度", "页面对当前 Git 分支、实验阶段和 starter/solution 角色的说明是否清楚？", "完全不清楚", "非常清楚"),
        question("overview-evidence", "帮助度", "真实构建与 QEMU 串口证据是否帮助你区分“代码已运行”和“只是静态说明”？", "没有帮助", "帮助很大"),
        question("overview-dimensions", "掌握度", "你能否从执行链、系统层次、资源管理和保护边界等不同维度解释同一实验？", "完全不能", "能够独立解释")
      ]),
      variantQuestions: Object.freeze({
        main: question("overview-main-use", "信心度", "看完整体路线后，你是否有信心选择合适的 Lab 分支继续学习或演示？", "没有信心", "很有信心"),
        demo: question("overview-demo-switch", "帮助度", "切换教学分支后页面自动更新实验上下文，这一功能对连续学习是否有帮助？", "没有帮助", "帮助很大"),
        default: question("overview-next-lab", "信心度", "使用知识地图后，你是否知道下一步应该学习哪个实验以及原因？", "完全不知道", "非常明确")
      })
    }),
    p0: Object.freeze({
      title: "P0 · 最小运行基线专项评价",
      description: "关注 Rust 裸机工程、QEMU/OpenSBI 启动环境和可重复运行基线。",
      questions: Object.freeze([
        question("p0-environment", "难度", "配置 Rust 目标、Cargo 和 qemu-system-riscv64 的过程对你来说有多困难？", "很容易", "很困难"),
        question("p0-handoff", "掌握度", "你是否理解 QEMU 启动 OpenSBI，再由 OpenSBI 把控制权交给 S-mode 内核的过程？", "完全没掌握", "能够独立解释"),
        question("p0-entry", "掌握度", "你是否理解链接入口、_start、启动栈和 Rust 入口之间的关系？", "完全没掌握", "能够独立解释"),
        question("p0-diagnose", "信心度", "遇到工具链、目标架构或 QEMU 启动失败时，你是否有信心根据输出定位问题？", "没有信心", "很有信心")
      ]),
      variantQuestions: Object.freeze({
        baseline: question("p0-repeat", "信心度", "你是否能够在另一台 Ubuntu/VMware 环境中重复搭建并运行 P0 基线？", "完全不能", "能够独立完成"),
        default: question("p0-repeat", "信心度", "你是否能够独立重复构建并运行 P0 基线？", "完全不能", "能够独立完成")
      })
    }),
    lab1: Object.freeze({
      title: "Lab1 · 启动与 SBI 控制台专项评价",
      description: "对应 _start、启动栈、Rust kernel_main、SBI 控制台和正常关机。",
      questions: Object.freeze([
        question("lab1-boot-chain", "难度", "理解 ENTRY(_start)、BOOT_STACK、_start 到 kernel_main 的启动路径有多困难？", "很容易", "很困难"),
        question("lab1-sbi", "掌握度", "你是否理解裸机内核为什么不能直接使用标准输出，以及 SBI console ecall 的作用？", "完全没掌握", "能够独立解释"),
        question("lab1-console", "掌握度", "你是否能够独立实现 console_putchar、按字节遍历字符串并正确输出换行？", "完全不能", "能够独立实现"),
        question("lab1-marker-reset", "掌握度", "你是否理解稳定 PASS 标志和 SBI system reset 对自动测试及 QEMU 正常退出的作用？", "完全没掌握", "能够独立解释")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab1-starter-boundary", "帮助度", "Lab1 的三个 TODO、Stage 测试和分级提示是否帮助你按顺序完成实验，而不是直接写死 PASS？", "没有帮助", "帮助很大"),
        solution: question("lab1-solution-explain", "信心度", "阅读参考实现后，你是否能不照抄代码，独立讲清启动、输出和关机三条路径？", "没有信心", "很有信心"),
        default: question("lab1-overall", "信心度", "完成 Lab1 后，你是否有信心独立解释一次最小内核启动？", "没有信心", "很有信心")
      })
    }),
    lab2: Object.freeze({
      title: "Lab2 · Trap 与异常处理专项评价",
      description: "对应 stvec、breakpoint、scause/sepc/stval 和异常返回。",
      questions: Object.freeze([
        question("lab2-stvec", "难度", "理解 stvec direct 模式以及 CPU 发生异常后跳到 trap 入口的过程有多困难？", "很容易", "很困难"),
        question("lab2-csrs", "掌握度", "你是否能区分 scause、sepc、stval，并用它们判断 breakpoint 异常？", "完全不能", "能够独立判断"),
        question("lab2-sepc", "掌握度", "你是否理解处理 32 位 ebreak 后为什么要让 sepc 加 4，否则会重复触发异常？", "完全没掌握", "能够独立解释"),
        question("lab2-cause", "掌握度", "你是否能够区分 exception code 与 interrupt bit，而不是把异常和中断混为一谈？", "完全不能", "能够清楚区分")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab2-starter-debug", "帮助度", "分阶段触发、解码和返回 breakpoint 的任务设计是否帮助你定位 trap 路径中的错误？", "没有帮助", "帮助很大"),
        solution: question("lab2-solution-transfer", "信心度", "阅读参考实现后，你是否有信心把同一 trap 返回思路迁移到系统调用处理？", "没有信心", "很有信心"),
        default: question("lab2-overall", "信心度", "完成 Lab2 后，你是否有信心独立分析一次可控异常？", "没有信心", "很有信心")
      })
    }),
    lab3: Object.freeze({
      title: "Lab3 · 物理内存管理专项评价",
      description: "对应 4 KiB 地址换算、半开区间、页帧分配、释放与复用。",
      questions: Object.freeze([
        question("lab3-address", "难度", "区分 PhysAddr 与 PhysPageNum，并正确实现 floor、ceil 和 page_offset 有多困难？", "很容易", "很困难"),
        question("lab3-range", "掌握度", "你是否理解 [start, end) 半开区间、顺序分配和耗尽后返回 None 的逻辑？", "完全没掌握", "能够独立实现"),
        question("lab3-recycle", "掌握度", "你是否能够处理物理页释放、优先复用、非法释放和重复释放？", "完全不能", "能够独立实现"),
        question("lab3-kernel-range", "掌握度", "你是否理解为什么不能把内核镜像和启动栈占用的页加入空闲分配范围？", "完全没掌握", "能够独立解释")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab3-starter-order", "帮助度", "先做纯地址计算、再做 alloc、最后做 dealloc 的任务顺序是否降低了实现难度？", "没有帮助", "帮助很大"),
        solution: question("lab3-solution-invariant", "信心度", "阅读参考实现后，你是否能独立说明分配器必须保持的范围、唯一性和复用不变量？", "没有信心", "很有信心"),
        default: question("lab3-overall", "信心度", "完成 Lab3 后，你是否有信心独立实现一个最小页帧分配器？", "没有信心", "很有信心")
      })
    }),
    lab4: Object.freeze({
      title: "Lab4 · Sv39 虚拟内存专项评价",
      description: "对应 VPN/PPN、三级页表、映射查询、satp 和 sfence.vma。",
      questions: Object.freeze([
        question("lab4-vpn-pte", "难度", "理解 Sv39 的 VPN[2:0]、PTE 中的 PPN 与权限位有多困难？", "很容易", "很困难"),
        question("lab4-walk", "掌握度", "你是否能够说明三级页表 walk，并实现 map、unmap 与 translate 的基本检查？", "完全不能", "能够独立实现"),
        question("lab4-activate", "掌握度", "你是否理解写入 satp 后执行 sfence.vma 的必要性？", "完全没掌握", "能够独立解释"),
        question("lab4-identity", "掌握度", "你是否理解第一版为什么采用恒等映射，以及代码、栈和数据需要怎样的权限？", "完全没掌握", "能够独立解释")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab4-starter-stages", "帮助度", "地址/PTE、映射查询、激活分页三个 Stage 是否帮助你避免在页表未准备好时直接开启分页？", "没有帮助", "帮助很大"),
        solution: question("lab4-solution-debug", "信心度", "阅读参考实现后，遇到启用分页后立即异常时，你是否有信心检查映射、权限、satp 与 TLB？", "没有信心", "很有信心"),
        default: question("lab4-overall", "信心度", "完成 Lab4 后，你是否有信心解释虚拟地址如何转换为物理地址？", "没有信心", "很有信心")
      })
    }),
    lab5: Object.freeze({
      title: "Lab5 · 协作式调度专项评价",
      description: "对应 TaskContext、TCB、任务状态、round-robin 和 __switch。",
      questions: Object.freeze([
        question("lab5-context", "难度", "理解 TaskContext 为什么保存 ra、sp、s0..s11，以及任务栈需要 16 字节对齐有多困难？", "很容易", "很困难"),
        question("lab5-state", "掌握度", "你是否理解任务栈、TCB 与 Ready、Running、Exited 状态之间的关系？", "完全没掌握", "能够独立解释"),
        question("lab5-round-robin", "掌握度", "你是否能够实现 round-robin 扫描，并在 yield 时正确更新当前任务和下一个任务状态？", "完全不能", "能够独立实现"),
        question("lab5-switch", "掌握度", "你是否能够根据 A/B/C 交替输出解释 __switch 的寄存器保存、恢复和返回过程？", "完全不能", "能够独立解释")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab5-starter-debug", "帮助度", "任务表、调度状态、上下文切换三个 Stage 是否帮助你逐步定位任务不轮转或返回地址错误？", "没有帮助", "帮助很大"),
        solution: question("lab5-solution-compare", "信心度", "阅读参考实现后，你是否能独立说明协作式调度与时钟中断驱动的抢占式调度有何不同？", "没有信心", "很有信心"),
        default: question("lab5-overall", "信心度", "完成 Lab5 后，你是否有信心独立解释一次任务切换？", "没有信心", "很有信心")
      })
    }),
    lab6: Object.freeze({
      title: "Lab6 · 用户态与系统调用专项评价",
      description: "对应 UserContext、sstatus/sepc、sret、ecall 和系统调用 ABI。",
      questions: Object.freeze([
        question("lab6-user-context", "难度", "理解 sepc、用户栈以及 sstatus.SPP/SPIE 对 sret 返回 U-mode 的作用有多困难？", "很容易", "很困难"),
        question("lab6-sret", "掌握度", "你是否能够说明内核准备 UserContext 后，CPU 如何通过 sret 进入用户态？", "完全不能", "能够独立说明"),
        question("lab6-abi", "掌握度", "你是否掌握 a7 传 syscall id、a0..a5 传参数、a0 返回结果的约定？", "完全没掌握", "能够独立使用"),
        question("lab6-ecall", "掌握度", "你是否理解处理 ecall 后推进 sepc，并分发 write、yield、exit 的完整路径？", "完全没掌握", "能够独立解释")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab6-starter-boundary", "帮助度", "用户上下文、系统调用 ABI、用户程序验收三个 Stage 是否帮助你区分特权级切换和系统调用服务？", "没有帮助", "帮助很大"),
        solution: question("lab6-solution-safety", "信心度", "阅读参考实现后，你是否能指出用户页 U 权限、用户栈映射和用户指针检查仍需注意的安全边界？", "没有信心", "很有信心"),
        default: question("lab6-overall", "信心度", "完成 Lab6 后，你是否有信心解释一次用户态 ecall 往返？", "没有信心", "很有信心")
      })
    }),
    lab7: Object.freeze({
      title: "Lab7 · 设备与简化文件系统专项评价",
      description: "对应 RAM 字节设备、SimpleFs、fd 表、文件偏移和用户态文件 I/O。",
      questions: Object.freeze([
        question("lab7-device", "难度", "实现 RamDevice::read_at/write_at，并正确检查 offset + len 越界有多困难？", "很容易", "很困难"),
        question("lab7-layers", "掌握度", "你是否理解设备层只负责按偏移读写字节，不应该知道 fd 和文件偏移？", "完全没掌握", "能够独立解释"),
        question("lab7-fd", "掌握度", "你是否能够实现 fd 表、读写偏移推进，并处理 invalid fd、close 后读写和重复 close？", "完全不能", "能够独立实现"),
        question("lab7-syscall", "掌握度", "你是否能说明用户程序如何通过系统调用访问 SimpleFs，并区分 console write 与 file write？", "完全不能", "能够独立说明")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab7-starter-layers", "帮助度", "RAM 设备、SimpleFs/fd、用户态 I/O 三个 Stage 是否帮助你逐层理解文件系统，而不是一次实现全部功能？", "没有帮助", "帮助很大"),
        solution: question("lab7-solution-boundary", "信心度", "阅读参考实现后，你是否能说明教学版内存文件系统与 virtio-block、多目录和真实用户指针校验之间的边界？", "没有信心", "很有信心"),
        default: question("lab7-overall", "信心度", "完成 Lab7 后，你是否有信心解释从 fd 到设备字节数组的一次文件 I/O？", "没有信心", "很有信心")
      })
    })
  });

  function normalizeVariant(context = {}) {
    if (["starter", "solution", "baseline", "main", "demo"].includes(context.variant)) {
      return context.variant;
    }
    if (context.branch === "main") return "main";
    if (String(context.branch || "").includes("interactive-demo")) return "demo";
    return "default";
  }

  function getQuestionSet(context = {}) {
    const key = SETS[context.lab] ? context.lab : "overview";
    const source = SETS[key];
    const variant = normalizeVariant(context);
    const variantQuestion = source.variantQuestions[variant] || source.variantQuestions.default;
    return Object.freeze({
      id: `${key}-${variant}`,
      lab: key,
      variant,
      title: source.title,
      description: source.description,
      questions: Object.freeze([...source.questions, variantQuestion])
    });
  }

  return Object.freeze({ SETS, getQuestionSet });
});
