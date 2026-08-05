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
      title: "OS 实验知识地图教学评价",
      description: "请评价完整实验路线、知识联系与可视化展示是否真正帮助学习。",
      questions: Object.freeze([
        question("overview-chain", "帮助程度", "知识地图把 P0、启动、Trap、内存、调度、用户态和文件系统串联起来的方式，是否帮助你理解各实验的先后依赖？", "没有帮助", "帮助很大"),
        question("overview-branch", "清晰度", "页面对当前 Git 分支、实验阶段和 starter/solution 角色的说明是否清楚？", "完全不清楚", "非常清楚"),
        question("overview-evidence", "帮助度", "真实构建与 QEMU 串口证据是否帮助你区分“代码已运行”和“只是静态说明”？", "没有帮助", "帮助很大"),
        question("overview-dimensions", "可视化效果", "执行链、系统层次、资源管理和保护边界等不同视角，是否帮助你从多个维度理解同一实验？", "没有帮助", "帮助很大")
      ]),
      variantQuestions: Object.freeze({
        main: question("overview-main-use", "路线引导", "整体路线展示是否帮助你判断接下来适合学习或演示哪个 Lab 分支？", "没有帮助", "帮助很大"),
        demo: question("overview-demo-switch", "帮助度", "切换教学分支后页面自动更新实验上下文，这一功能对连续学习是否有帮助？", "没有帮助", "帮助很大"),
        default: question("overview-next-lab", "路线引导", "知识地图对选择下一步实验及理解选择原因是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    p0: Object.freeze({
      title: "P0 · 最小运行基线教学评价",
      description: "请结合环境搭建体验，评价步骤、讲解、提示和运行反馈。",
      questions: Object.freeze([
        question("p0-environment", "难度合适度", "Rust 目标、Cargo 和 qemu-system-riscv64 的配置步骤及检查提示，是否适合第一次搭建环境的同学？", "很不合适", "非常合适"),
        question("p0-handoff", "讲解清晰度", "QEMU 启动 OpenSBI、再把控制权交给 S-mode 内核的说明和展示是否清晰？", "完全不清晰", "非常清晰"),
        question("p0-entry", "帮助程度", "链接入口、_start、启动栈和 Rust 入口的流程展示，是否帮助你理解最小内核如何开始运行？", "没有帮助", "帮助很大"),
        question("p0-diagnose", "反馈有效性", "构建与 QEMU 输出中的错误提示，是否帮助你定位工具链、目标架构或启动环境问题？", "没有帮助", "帮助很大")
      ]),
      variantQuestions: Object.freeze({
        baseline: question("p0-repeat", "流程完整度", "P0 的环境检查、构建和运行流程，是否足以支持你在另一台 Ubuntu/VMware 环境中重复实验？", "完全不足", "非常充分"),
        default: question("p0-repeat", "流程完整度", "P0 的环境检查、构建和运行说明，是否足以支持你重复完成实验？", "完全不足", "非常充分")
      })
    }),
    lab1: Object.freeze({
      title: "Lab1 · 启动与 SBI 控制台教学评价",
      description: "请结合 _start、启动栈、SBI 控制台和正常关机实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab1-boot-chain", "讲解清晰度", "ENTRY(_start)、BOOT_STACK、_start 到 kernel_main 的分步说明和流程展示是否清晰？", "完全不清晰", "非常清晰"),
        question("lab1-sbi", "帮助程度", "SBI console 任务和串口证据，是否帮助你理解裸机输出为何需要通过 ecall 完成？", "没有帮助", "帮助很大"),
        question("lab1-console", "难度合适度", "console_putchar、按字节输出字符串和处理换行的任务难度及提示是否合适？", "很不合适", "非常合适"),
        question("lab1-marker-reset", "反馈有效性", "PASS 标志与 SBI system reset 的测试反馈，是否让你清楚实验何时真正完成并正常退出？", "完全不清楚", "非常清楚")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab1-starter-boundary", "任务设计", "Lab1 的三个 TODO、Stage 测试和分级提示，是否帮助你按顺序理解并完成启动、输出和关机实验？", "没有帮助", "帮助很大"),
        solution: question("lab1-solution-explain", "参考说明", "参考实现及其说明，是否帮助你理解启动、输出和关机三条路径，而不只是看到最终代码？", "没有帮助", "帮助很大"),
        default: question("lab1-overall", "教学效果", "完成 Lab1 后，这套实验对理解最小内核启动过程是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    lab2: Object.freeze({
      title: "Lab2 · Trap 与异常处理教学评价",
      description: "请结合 stvec、breakpoint、异常寄存器和返回路径实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab2-stvec", "可视化效果", "stvec direct 模式和 CPU 跳转到 trap 入口的流程展示，是否让异常入口更容易理解？", "没有帮助", "帮助很大"),
        question("lab2-csrs", "讲解清晰度", "scause、sepc、stval 的对照说明和 breakpoint 输出示例是否清晰？", "完全不清晰", "非常清晰"),
        question("lab2-sepc", "帮助程度", "ebreak 后让 sepc 加 4 的任务与测试反馈，是否帮助你理解为什么异常会重复触发？", "没有帮助", "帮助很大"),
        question("lab2-cause", "对比效果", "实验对 exception code 与 interrupt bit 的对比，是否帮助你区分异常和中断？", "没有帮助", "帮助很大")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab2-starter-debug", "任务设计", "分阶段触发、解码和返回 breakpoint 的任务及提示，是否帮助你定位 trap 路径中的错误？", "没有帮助", "帮助很大"),
        solution: question("lab2-solution-transfer", "参考说明", "参考实现及其返回路径说明，是否帮助你理解同一思路如何继续用于系统调用？", "没有帮助", "帮助很大"),
        default: question("lab2-overall", "教学效果", "完成 Lab2 后，这套实验对理解一次可控异常的完整处理过程是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    lab3: Object.freeze({
      title: "Lab3 · 物理内存管理教学评价",
      description: "请结合地址换算、页帧分配、释放与复用实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab3-address", "难度合适度", "PhysAddr、PhysPageNum、floor、ceil 和 page_offset 的示例与练习难度是否合适？", "很不合适", "非常合适"),
        question("lab3-range", "帮助程度", "[start, end) 半开区间和顺序分配的可视化，是否帮助你理解页帧分配范围？", "没有帮助", "帮助很大"),
        question("lab3-recycle", "反馈有效性", "分配、释放、优先复用、非法释放和重复释放的测试反馈是否清楚指出问题？", "完全不清楚", "非常清楚"),
        question("lab3-kernel-range", "讲解清晰度", "内核镜像和启动栈占用页不能加入空闲范围的说明是否清晰？", "完全不清晰", "非常清晰")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab3-starter-order", "任务设计", "先做地址计算、再做 alloc、最后做 dealloc 的任务顺序，是否帮助你逐步理解页帧分配器？", "没有帮助", "帮助很大"),
        solution: question("lab3-solution-invariant", "参考说明", "参考实现对范围、唯一性和复用不变量的说明，是否帮助你理解分配器设计？", "没有帮助", "帮助很大"),
        default: question("lab3-overall", "教学效果", "完成 Lab3 后，这套实验对理解最小页帧分配器是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    lab4: Object.freeze({
      title: "Lab4 · Sv39 虚拟内存教学评价",
      description: "请结合三级页表、映射查询与分页激活实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab4-vpn-pte", "可视化效果", "Sv39 的 VPN[2:0]、PTE 中 PPN 与权限位的图示是否帮助你理解页表项结构？", "没有帮助", "帮助很大"),
        question("lab4-walk", "帮助程度", "三级页表 walk 以及 map、unmap、translate 的动态结构展示是否容易跟随？", "很难跟随", "非常容易跟随"),
        question("lab4-activate", "反馈有效性", "写入 satp、执行 sfence.vma 和启用分页后的运行反馈，是否帮助你理解分页何时生效？", "没有帮助", "帮助很大"),
        question("lab4-identity", "讲解清晰度", "恒等映射以及代码、栈、数据权限的任务说明是否清晰？", "完全不清晰", "非常清晰")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab4-starter-stages", "任务设计", "地址/PTE、映射查询、激活分页三个 Stage，是否帮助你按安全顺序完成实验？", "没有帮助", "帮助很大"),
        solution: question("lab4-solution-debug", "参考说明", "参考实现对映射、权限、satp 与 TLB 的排错说明，是否帮助你理解分页异常？", "没有帮助", "帮助很大"),
        default: question("lab4-overall", "教学效果", "完成 Lab4 后，这套实验对理解虚拟地址到物理地址的转换是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    lab5: Object.freeze({
      title: "Lab5 · 协作式调度教学评价",
      description: "请结合任务状态、round-robin 和上下文切换实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab5-context", "可视化效果", "TaskContext 保存 ra、sp、s0..s11 以及任务栈 16 字节对齐的图示，是否帮助你理解上下文？", "没有帮助", "帮助很大"),
        question("lab5-state", "帮助程度", "任务栈、TCB 与 Ready、Running、Exited 状态变化的动态展示是否容易理解？", "很难理解", "非常容易理解"),
        question("lab5-round-robin", "难度合适度", "round-robin 扫描和 yield 状态更新的任务难度及提示是否合适？", "很不合适", "非常合适"),
        question("lab5-switch", "反馈有效性", "A/B/C 交替输出与 __switch 时间线，是否帮助你看清寄存器保存、恢复和返回过程？", "没有帮助", "帮助很大")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab5-starter-debug", "任务设计", "任务表、调度状态、上下文切换三个 Stage，是否帮助你逐步定位任务不轮转或返回地址错误？", "没有帮助", "帮助很大"),
        solution: question("lab5-solution-compare", "参考说明", "参考实现对协作式与抢占式调度差异的说明，是否帮助你理解本实验的设计边界？", "没有帮助", "帮助很大"),
        default: question("lab5-overall", "教学效果", "完成 Lab5 后，这套实验对理解一次任务切换是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    lab6: Object.freeze({
      title: "Lab6 · 用户态与系统调用教学评价",
      description: "请结合用户态切换、ecall 和系统调用 ABI 实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab6-user-context", "可视化效果", "sepc、用户栈和 sstatus.SPP/SPIE 到 sret 返回 U-mode 的流程图是否帮助你理解特权级切换？", "没有帮助", "帮助很大"),
        question("lab6-sret", "讲解清晰度", "内核准备 UserContext、再通过 sret 进入用户态的分步说明是否清晰？", "完全不清晰", "非常清晰"),
        question("lab6-abi", "任务设计", "a7、a0..a5 和返回值约定的表格、练习及提示，是否帮助你理解系统调用 ABI？", "没有帮助", "帮助很大"),
        question("lab6-ecall", "反馈有效性", "ecall 后推进 sepc 并分发 write、yield、exit 的运行轨迹，是否帮助你看清完整往返路径？", "没有帮助", "帮助很大")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab6-starter-boundary", "任务设计", "用户上下文、系统调用 ABI、用户程序验收三个 Stage，是否帮助你区分特权级切换和系统调用服务？", "没有帮助", "帮助很大"),
        solution: question("lab6-solution-safety", "参考说明", "参考实现对用户页权限、用户栈映射和用户指针安全边界的说明是否清晰？", "完全不清晰", "非常清晰"),
        default: question("lab6-overall", "教学效果", "完成 Lab6 后，这套实验对理解一次用户态 ecall 往返是否有帮助？", "没有帮助", "帮助很大")
      })
    }),
    lab7: Object.freeze({
      title: "Lab7 · 设备与简化文件系统教学评价",
      description: "请结合 RAM 设备、SimpleFs、fd 和文件 I/O 实验，评价教学设计是否有效。",
      questions: Object.freeze([
        question("lab7-device", "难度合适度", "RamDevice::read_at/write_at 和 offset + len 越界检查的任务难度及提示是否合适？", "很不合适", "非常合适"),
        question("lab7-layers", "可视化效果", "设备层、SimpleFs 和 fd 层的结构图，是否帮助你理解各层职责边界？", "没有帮助", "帮助很大"),
        question("lab7-fd", "反馈有效性", "fd 表、偏移推进、invalid fd 和 close 错误的测试反馈是否清楚指出问题？", "完全不清楚", "非常清楚"),
        question("lab7-syscall", "帮助程度", "用户程序经系统调用访问 SimpleFs 再到设备字节数组的流程展示，是否帮助你理解文件 I/O？", "没有帮助", "帮助很大")
      ]),
      variantQuestions: Object.freeze({
        starter: question("lab7-starter-layers", "任务设计", "RAM 设备、SimpleFs/fd、用户态 I/O 三个 Stage，是否帮助你逐层学习而不是一次实现全部功能？", "没有帮助", "帮助很大"),
        solution: question("lab7-solution-boundary", "参考说明", "参考实现对教学版内存文件系统与真实块设备、多目录和用户指针校验边界的说明是否清晰？", "完全不清晰", "非常清晰"),
        default: question("lab7-overall", "教学效果", "完成 Lab7 后，这套实验对理解从 fd 到设备字节数组的一次文件 I/O 是否有帮助？", "没有帮助", "帮助很大")
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
