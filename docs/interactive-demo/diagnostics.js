(() => {
  "use strict";

  const DIAGNOSTICS_VERSION = 1;
  const EVENT_PROTOCOL = "os-demo.event/v1";
  const VALID_LABS = new Set(["p0", "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"]);
  const TERMINAL_PROBLEMS = new Set(["fail", "failure", "timeout", "finished"]);

  const LAB_LOCATIONS = Object.freeze({
    p0: [{ file: "kernel/src/main.rs", symbol: "kernel_main" }],
    lab1: [
      { file: "kernel/src/console.rs", symbol: "print_line" },
      { file: "kernel/src/sbi.rs", symbol: "console_putchar" }
    ],
    lab2: [{ file: "kernel/src/trap.rs", symbol: "init / rust_trap_handler / __trap_entry" }],
    lab3: [{ file: "kernel/src/memory/frame_allocator.rs", symbol: "StackFrameAllocator::alloc / dealloc" }],
    lab4: [{ file: "kernel/src/memory/page_table.rs", symbol: "PageTable::map / MemorySet::activate" }],
    lab5: [
      { file: "kernel/src/task/mod.rs", symbol: "yield_now / run_ready_tasks / switch_context" },
      { file: "kernel/src/task/switch.S", symbol: "__switch" }
    ],
    lab6: [
      { file: "kernel/src/trap.rs", symbol: "handle_user_ecall / rust_trap_handler" },
      { file: "kernel/src/syscall.rs", symbol: "dispatch" }
    ],
    lab7: [
      { file: "kernel/src/fs/mod.rs", symbol: "SimpleFs::open / read / write / close" },
      { file: "kernel/src/trap.rs", symbol: "handle_user_ecall" }
    ]
  });

  function text(value, limit = 500) {
    return String(value ?? "")
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\b(?:glpat-|ghp_|github_pat_)[A-Za-z0-9_-]+/gi, "[访问令牌已隐藏]")
      .replace(/\b(Bearer\s+)[^\s]+/gi, "$1[访问令牌已隐藏]")
      .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1[访问令牌已隐藏]")
      .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, "C:\\Users\\<user>")
      .replace(/\/home\/[^/\s]+/g, "/home/<user>")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, limit);
  }

  function normalizeLab(value) {
    const lab = text(value, 20).toLowerCase();
    return VALID_LABS.has(lab) ? lab : null;
  }

  function normalizeEvents(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 512).flatMap((event, index) => {
      if (!event || typeof event !== "object" || event.protocol !== EVENT_PROTOCOL) return [];
      const lab = normalizeLab(event.lab);
      const step = text(event.step, 80).toLowerCase();
      const status = text(event.status, 20).toLowerCase();
      if (!lab || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(step)) return [];
      return [{
        event: {
          protocol: EVENT_PROTOCOL,
          lab,
          step,
          status,
          source: text(event.source, 40) || "unknown",
          detail: text(event.detail || event.raw || step, 500),
          sequence: Number.isInteger(Number(event.sequence)) && Number(event.sequence) > 0
            ? Number(event.sequence)
            : 0
        },
        originalIndex: index
      }];
    });
  }

  function normalizeSerialOutput(value) {
    const items = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/);
    return items.slice(-120).map((item) => text(item?.line ?? item, 500)).filter(Boolean);
  }

  function normalizeInput(value = {}) {
    value = value && typeof value === "object" ? value : {};
    const lab = normalizeLab(value.lab);
    const events = normalizeEvents(value.events);
    return {
      lab,
      role: text(value.role, 40).toLowerCase() || "custom",
      buildResult: text(value.buildResult, 20).toLowerCase() || null,
      finalStatus: text(value.finalStatus, 20).toLowerCase() || "unknown",
      events,
      labEvents: lab ? events.filter((item) => item.event.lab === lab) : [],
      serialOutput: normalizeSerialOutput(value.serialOutput)
    };
  }

  function labDocument(lab) {
    return lab && lab !== "p0" ? `docs/labs/${lab}.md` : "README.md";
  }

  function locationsFor(lab) {
    return (LAB_LOCATIONS[lab] || LAB_LOCATIONS.p0).map((item) => ({ ...item }));
  }

  function eventEvidence(item) {
    const event = item.event;
    const sequence = event.sequence > 0 ? `#${event.sequence}` : `#${item.originalIndex + 1}`;
    return `事件 ${sequence} ${event.lab}:${event.step}（${event.status || "unknown"}）：${event.detail}`;
  }

  function eventItems(input, predicate) {
    return input.labEvents.filter(({ event }, index) => predicate(event, index));
  }

  function distinctOccurrences(items) {
    const seen = new Set();
    return items.filter((item) => {
      const sequence = Number(item.event.sequence);
      if (sequence <= 0) return false;
      const key = `${item.event.step}:sequence:${sequence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function matchingLines(input, pattern, limit = 3) {
    return input.serialOutput.filter((line) => pattern.test(line)).slice(0, limit);
  }

  function diagnostic(input, options) {
    const canDetermine = Boolean(options.canDetermine);
    const triggerEvidence = options.triggerEvidence.map((item) => text(item, 500)).filter(Boolean).slice(0, 6);
    const codeLocations = (options.codeLocations || locationsFor(input.lab)).map((item) => ({
      file: text(item.file, 180),
      symbol: text(item.symbol, 180)
    }));
    return {
      id: options.id,
      category: options.category || "runtime",
      severity: options.severity || (canDetermine ? "error" : "warning"),
      isError: (options.severity || (canDetermine ? "error" : "warning")) === "error",
      title: options.title,
      lab: input.lab,
      role: input.role,
      triggerEvidence,
      evidence: [...triggerEvidence],
      possibleCauses: options.possibleCauses.map((item) => text(item, 500)).filter(Boolean).slice(0, 5),
      codeLocations,
      checks: codeLocations.map((item) => ({ ...item })),
      document: text(options.document || labDocument(input.lab), 180),
      guideDocument: text(options.guideDocument, 180) || null,
      canDetermine,
      certain: canDetermine,
      certainty: canDetermine ? "confirmed" : "possible",
      certaintyText: canDetermine
        ? "能够确定上述触发现象；具体根因仍需按建议位置检查。"
        : "现有证据不足以定位根因，以下内容仅作为可能原因。"
    };
  }

  function environmentDiagnostics(input) {
    const results = [];
    const cargoLines = matchingLines(input, /cargo build failed|could not compile|error:\s+could not compile/i);
    if (input.buildResult === "failure" || cargoLines.length) {
      results.push(diagnostic(input, {
        id: "cargo-build-failed",
        category: "environment",
        severity: "error",
        title: "Cargo 构建失败",
        triggerEvidence: ["构建结果：failure", ...cargoLines],
        possibleCauses: ["当前实验代码存在编译错误，或 Rust target、依赖与构建配置不完整。"],
        codeLocations: [
          { file: "Cargo.toml", symbol: "workspace / ai-os-kernel 配置" },
          ...locationsFor(input.lab)
        ],
        document: labDocument(input.lab),
        guideDocument: "docs/interactive-demo/README.md",
        canDetermine: true
      }));
    }

    const targetLines = matchingLines(
      input,
      /Linux run preflight failed:.*Rust target|(?:Missing|Rust) target[^\n]*(?:unavailable|not installed|riscv64gc-unknown-none-elf)|can't find crate for [`']?(?:core|compiler_builtins)|rustup target add riscv64gc-unknown-none-elf/i
    );
    if (targetLines.length) {
      const confirmed = targetLines.some((line) => (
        /preflight failed:.*Rust target|Missing Rust target|Rust target .* unavailable/i.test(line)
      ));
      results.push(diagnostic(input, {
        id: "riscv-target-missing",
        category: "environment",
        severity: confirmed ? "error" : "warning",
        title: confirmed ? "RISC-V target 不可用" : "可能：缺少 RISC-V target",
        triggerEvidence: targetLines,
        possibleCauses: ["rustup 尚未安装 riscv64gc-unknown-none-elf，或当前 rustc 工具链与 target 不匹配。"],
        codeLocations: [
          { file: "scripts/run-interactive-demo.sh", symbol: "check_kernel_dependencies / TARGET" },
          { file: "scripts/check-env.sh", symbol: "REQUIRED_TARGET" }
        ],
        document: labDocument(input.lab),
        guideDocument: "docs/interactive-demo/README.md",
        canDetermine: confirmed
      }));
    }

    const qemuLines = matchingLines(
      input,
      /Linux run preflight failed:.*QEMU|Missing dependency:\s*qemu-system-riscv64|QEMU could not start:.*(?:ENOENT|not found|cannot find)|spawn\s+qemu-system-riscv64\s+ENOENT/i
    );
    if (qemuLines.length) {
      results.push(diagnostic(input, {
        id: "qemu-missing",
        category: "environment",
        severity: "error",
        title: "QEMU 不存在或无法启动",
        triggerEvidence: qemuLines,
        possibleCauses: ["qemu-system-riscv64 未安装，或命令不在当前 Linux 用户的 PATH 中。"],
        codeLocations: [
          { file: "scripts/run-interactive-demo.sh", symbol: "check_kernel_dependencies / QEMU" },
          { file: "docs/interactive-demo/server.js", symbol: "runQemuAndBridge / qemuCommand" }
        ],
        document: labDocument(input.lab),
        guideDocument: "docs/interactive-demo/README.md",
        canDetermine: true
      }));
    }
    return results;
  }

  function teachingStopDiagnostic(input) {
    if (input.role !== "starter") return null;
    const todoEvents = eventItems(input, (event) => event.status === "todo");
    const hasFailureOrPass = input.labEvents.some(({ event }) => event.status === "fail" || event.status === "pass");
    if (input.buildResult !== "success"
      || !["todo", "stopped"].includes(input.finalStatus)
      || todoEvents.length === 0
      || hasFailureOrPass) return null;
    return diagnostic(input, {
      id: "starter-todo",
      category: "teaching",
      severity: "info",
      title: "Starter 正常停在 TODO",
      triggerEvidence: [eventEvidence(todoEvents[0]), `最终运行状态：${input.finalStatus}`],
      possibleCauses: ["当前 starter 分支保留了需要学生补全的教学停点，这不是运行错误。"],
      document: labDocument(input.lab),
      canDetermine: true
    });
  }

  function runtimeDiagnostics(input, starterTodo) {
    const results = [];
    if (input.finalStatus === "timeout") {
      results.push(diagnostic(input, {
        id: "qemu-timeout",
        severity: "error",
        title: "QEMU 运行超时",
        triggerEvidence: ["最终运行状态：timeout"],
        possibleCauses: ["内核可能陷入循环、重复 Trap、死锁，或没有产生预期的结束标志。"],
        document: labDocument(input.lab),
        guideDocument: "docs/interactive-demo/README.md",
        canDetermine: true
      }));
    }

    if (starterTodo || !TERMINAL_PROBLEMS.has(input.finalStatus)) return results;

    if (input.lab === "lab2") {
      const trapEntries = distinctOccurrences(eventItems(input, (event) => event.step === "trap-enter"));
      const decodedEntries = distinctOccurrences(eventItems(input, (event) => event.step === "breakpoint-decoded"));
      const traps = trapEntries.length >= 2 ? trapEntries : decodedEntries.length >= 2 ? decodedEntries : [];
      const repeatedTrapLines = matchingLines(input, /^\[Lab2\]\s+trap:\s+breakpoint exception$/i, 6);
      if (traps.length >= 2 || repeatedTrapLines.length >= 2) {
        results.push(diagnostic(input, {
          id: "trap-repeated",
          title: "Trap 重复触发",
          triggerEvidence: [
            traps[0] ? eventEvidence(traps[0]) : "",
            traps[1] ? eventEvidence(traps[1]) : "",
            ...repeatedTrapLines.slice(0, 2),
            `最终运行状态：${input.finalStatus}`
          ],
          possibleCauses: ["sepc 可能没有越过 ebreak，或 TrapFrame 恢复后再次回到同一异常指令。"],
          codeLocations: [{ file: "kernel/src/trap.rs", symbol: "rust_trap_handler / TrapFrame::sepc / __trap_entry" }],
          document: labDocument(input.lab),
          canDetermine: true
        }));
      }

      const lastTrigger = traps.at(-1);
      const advancedAfter = lastTrigger && input.labEvents.some((item) => (
        item.originalIndex > lastTrigger.originalIndex
        && item.event.step === "sepc-advanced"
      ));
      if (traps.length >= 2
        && ["fail", "failure", "timeout"].includes(input.finalStatus)
        && !advancedAfter) {
        results.push(diagnostic(input, {
          id: "sepc-not-advanced",
          title: "可能：sepc 没有推进",
          triggerEvidence: [eventEvidence(lastTrigger), `之后未观察到明确的 sepc-advanced 证据；最终状态：${input.finalStatus}`],
          possibleCauses: ["Trap handler 可能遗漏 sepc += 4，或对应事件没有被内核输出。"],
          codeLocations: [{ file: "kernel/src/trap.rs", symbol: "rust_trap_handler / TrapFrame::sepc" }],
          document: labDocument(input.lab),
          canDetermine: false
        }));
      }
    }

    if (input.lab === "lab4") {
      const activated = eventItems(input, (event) => event.step === "satp-activated").at(-1);
      const recoveredAfter = activated && input.labEvents.find((item) => (
        item.originalIndex > activated.originalIndex
        && ["paging-active", "translate-verified", "pass"].includes(item.event.step)
      ));
      const failureAfter = activated && !recoveredAfter && input.labEvents.find((item) => (
        item.originalIndex > activated.originalIndex
        && (item.event.status === "fail" || item.event.step === "panic")
      ));
      const faultLines = matchingLines(input, /(?:instruction|load|store(?:\/amo)?) page fault|access fault|panic.*(?:page|satp|mapping)/i);
      const stoppedAtActivation = activated
        && !recoveredAfter
        && ["fail", "failure", "timeout"].includes(input.finalStatus)
        && input.labEvents.at(-1)?.originalIndex === activated.originalIndex;
      if (activated && !recoveredAfter && (failureAfter || faultLines.length || stoppedAtActivation)) {
        const confirmed = faultLines.length > 0;
        results.push(diagnostic(input, {
          id: "satp-activation-fault",
          title: confirmed ? "satp 激活后出现地址访问异常" : "可能：satp 激活后发生异常",
          triggerEvidence: [eventEvidence(activated), failureAfter ? eventEvidence(failureAfter) : "", ...faultLines],
          possibleCauses: ["关键代码、数据、栈或页表页可能缺少映射，PTE 权限也可能与访问方式不一致。"],
          codeLocations: [{ file: "kernel/src/memory/page_table.rs", symbol: "MemorySet::activate / PageTable::map / PageTableEntry::new" }],
          document: labDocument(input.lab),
          canDetermine: confirmed
        }));
      }
    }

    if (["lab3", "lab4"].includes(input.lab)) {
      const frameLines = matchingLines(input, /out of (?:physical |page-table )?frames|no (?:free )?(?:frame|page frame)|frame allocation (?:failed|exhausted)|allocator exhausted|页帧不足/i);
      const frameEvents = eventItems(input, (event) => (
        (event.status === "fail" || event.step === "panic")
        && /out of (?:physical |page-table )?frames|no (?:free )?(?:frame|page frame)|frame allocation (?:failed|exhausted)|页帧不足/i.test(event.detail)
      ));
      const possibleFrameLines = matchingLines(input, /could not allocate (?:root page table|test frame)|unable to allocate (?:a )?(?:frame|page)/i);
      if (frameLines.length || frameEvents.length || possibleFrameLines.length) {
        const confirmed = frameLines.length > 0 || frameEvents.length > 0;
        results.push(diagnostic(input, {
          id: "page-frame-exhausted",
          title: confirmed ? "页帧不足或分配器耗尽" : "可能：页帧分配失败",
          triggerEvidence: [...frameEvents.slice(0, 2).map(eventEvidence), ...frameLines, ...possibleFrameLines],
          possibleCauses: ["可管理物理页区间可能过小、页帧未正确回收，或页表创建消耗了超出预期的页帧。"],
          codeLocations: [{ file: "kernel/src/memory/frame_allocator.rs", symbol: "StackFrameAllocator::init / alloc / dealloc" }],
          document: labDocument(input.lab),
          canDetermine: confirmed
        }));
      }
    }

    if (input.lab === "lab5") {
      const ready = eventItems(input, (event) => event.step === "scheduler-ready").at(-1);
      const yielded = eventItems(input, (event) => event.step === "yield-called").length > 0;
      const taskNames = new Set(eventItems(input, (event) => /^task-[abc]-step-[12]$/.test(event.step))
        .map(({ event }) => event.step.split("-")[1]));
      const switched = eventItems(input, (event) => event.step === "context-switched").length > 0 || taskNames.size >= 2;
      const attemptedScheduling = yielded || taskNames.size === 1;
      if (ready
        && attemptedScheduling
        && !switched
        && ["fail", "failure", "timeout"].includes(input.finalStatus)) {
        results.push(diagnostic(input, {
          id: "scheduler-no-switch",
          title: "可能：调度没有发生任务切换",
          triggerEvidence: [eventEvidence(ready), `未观察到 context-switched 或两个不同任务的执行证据；最终状态：${input.finalStatus}`],
          possibleCauses: ["Ready 队列可能没有选出下一任务，yield 路径可能没有返回调度器，或 __switch 没有恢复新上下文。"],
          document: labDocument(input.lab),
          canDetermine: false
        }));
      }
    }

    if (input.lab === "lab6") {
      const ecall = eventItems(input, (event) => event.step === "user-ecall").at(-1);
      const handledAfter = ecall && input.labEvents.some((item) => (
        item.originalIndex > ecall.originalIndex
        && ["syscall-dispatched", "console-write", "syscall-yield", "user-return", "user-exit"].includes(item.event.step)
      ));
      if (ecall
        && !handledAfter
        && ["fail", "failure", "timeout"].includes(input.finalStatus)) {
        results.push(diagnostic(input, {
          id: "user-ecall-not-dispatched",
          title: "可能：用户态 ecall 未进入系统调用处理",
          triggerEvidence: [eventEvidence(ecall), `之后未观察到 syscall-dispatched 或系统调用结果；最终状态：${input.finalStatus}`],
          possibleCauses: ["Trap 原因可能没有识别为 U-mode ecall，sepc/寄存器参数可能未正确读取，或 dispatch 没有返回。"],
          document: labDocument(input.lab),
          canDetermine: false
        }));
      }
    }

    if (input.lab === "lab7") {
      const fileLines = matchingLines(input, /file (?:open|write|read|close) failed|invalid (?:user )?(?:read|write|verification) buffer|file I\/O was not verified|(?:open|read|write) failed/i);
      const fileFailures = eventItems(input, (event) => (
        (event.status === "fail" || event.step === "panic")
        && /file (?:open|write|read|close) failed|invalid (?:user )?(?:read|write|verification) buffer|file I\/O was not verified|文件(?:打开|读取|写入|关闭)失败/i.test(event.detail)
      ));
      if (fileLines.length || fileFailures.length) {
        results.push(diagnostic(input, {
          id: "file-io-failed",
          title: "文件打开或读写失败",
          triggerEvidence: [
            ...fileFailures.slice(0, 2).map(eventEvidence),
            ...fileLines,
            `最终运行状态：${input.finalStatus}`
          ],
          possibleCauses: ["fd 生命周期、offset 更新、用户缓冲区检查或 RamDevice 读写路径可能没有形成完整闭环。"],
          document: labDocument(input.lab),
          canDetermine: true
        }));
      }
    }
    return results;
  }

  function diagnose(value = {}) {
    const input = normalizeInput(value);
    const results = environmentDiagnostics(input);
    const teachingStop = teachingStopDiagnostic(input);
    if (teachingStop) results.push(teachingStop);
    results.push(...runtimeDiagnostics(input, Boolean(teachingStop)));
    return results;
  }

  const api = {
    DIAGNOSTICS_VERSION,
    EVENT_PROTOCOL,
    diagnose,
    normalizeInput
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OsDiagnostics = api;
})();
