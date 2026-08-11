(() => {
  "use strict";

  const PREDICTION_STORAGE_KEY = "os-demo.pending-prediction.v1";
  const STABLE_DIAGNOSTIC_OUTPUT = /^\[(?:P0|Lab[1-7]|OS_DEMO)\](?:\s|$)|cargo build failed|could not compile|Linux run preflight failed|Missing dependency|Rust target|QEMU could not start|spawn\s+qemu-system-riscv64\s+ENOENT|page fault|access fault|panic|out of (?:physical |page-table )?frames|no (?:free )?(?:frame|page frame)|frame allocation|allocator exhausted|could not allocate (?:root page table|test frame)|file (?:open|write|read|close) failed|invalid (?:user )?(?:read|write|verification) buffer|file I\/O was not verified/i;

  const stages = [
    {
      id: "p0",
      label: "P0",
      tab: "å¯åŠ¨åŸºçº¿",
      title: "æœ€å°è¿è¡ŒåŸºçº¿",
      summary: "QEMU è£…è½½å†…æ ¸ï¼ŒOpenSBI ä»Ž M-mode å‡†å¤‡æœºå™¨å¹¶ä»¥ S-mode è¿›å…¥ _startï¼›æ±‡ç¼–å…¥å£å»ºç«‹å¯åŠ¨æ ˆåŽæ‰æŠŠæŽ§åˆ¶æƒäº¤ç»™ Rustã€‚",
      objective: "èƒ½ç”»å‡º QEMU â†’ OpenSBI â†’ _start â†’ kernel_main çš„æŽ§åˆ¶æƒè½¬ç§»ï¼Œå¹¶è§£é‡Šè£¸æœº Rust ä¸ºä»€ä¹ˆä¸èƒ½å‡è®¾å·²æœ‰è¿è¡Œæ—¶ã€‚",
      concepts: ["è£¸æœº", "é“¾æŽ¥è„šæœ¬", "å¯åŠ¨æ ˆ", "M/S-mode"],
      prerequisites: ["RISC-V åŸºæœ¬å¯„å­˜å™¨", "Rust no_std", "QEMU virt æœºå™¨"],
      invariants: ["å…¥å£åœ°å€ä¸Ž linker.ld ä¸€è‡´", "è¿›å…¥ Rust å‰ sp æœ‰æ•ˆä¸”å¯¹é½", "å†…æ ¸é•œåƒä¸èƒ½è¦†ç›–å¯åŠ¨æ•°æ®"],
      tasks: ["ç¡®è®¤äº¤å‰ç¼–è¯‘ä¸Žé•œåƒå…¥å£", "è§‚å¯Ÿ OpenSBI äº¤æŽ¥å‚æ•°", "éªŒè¯ kernel_main ä¸Žå…³æœºè·¯å¾„"],
      links: [["boot.rs", "kernel/src/boot.rs"], ["linker.ld", "kernel/linker.ld"], ["main.rs", "kernel/src/main.rs"]],
      explanation: "P0 ä¸å¢žåŠ  OS åŠŸèƒ½ï¼Œå®ƒå»ºç«‹æ‰€æœ‰åŽç»­å®žéªŒå…±äº«çš„â€œå¯è¿è¡Œã€å¯è§‚å¯Ÿã€å¯é€€å‡ºâ€çŽ°åœºã€‚",
      visual: "flow",
      steps: [
        { id: "qemu", kicker: "æ¨¡æ‹Ÿç¡¬ä»¶", title: "QEMU virt", detail: "è£…è½½å†…æ ¸é•œåƒ" },
        { id: "opensbi", kicker: "M-mode å›ºä»¶", title: "OpenSBI", detail: "åˆå§‹åŒ–å¹¶è¿›å…¥ S-mode" },
        { id: "start", kicker: "æ±‡ç¼–å…¥å£", title: "_start", detail: "sp â† boot_stack_top" },
        { id: "kernel-main", kicker: "Rust å†…æ ¸", title: "kernel_main", detail: "å¼€å§‹æ•™å­¦æ‰§è¡Œé“¾" },
        { id: "pass", kicker: "ç¨³å®šè¯æ®", title: "[P0] PASS", detail: "æœ€å°é—­çŽ¯å®Œæˆ" }
      ],
      eventSteps: { "kernel-main": 3, pass: 4 }
    },
    {
      id: "lab1",
      label: "Lab1",
      tab: "SBI æŽ§åˆ¶å°",
      title: "ä¸€æ¬¡ print å¦‚ä½•åˆ°è¾¾ QEMU æŽ§åˆ¶å°",
      summary: "å†…æ ¸æ²¡æœ‰æ ‡å‡†è¾“å‡ºã€‚console é€å­—èŠ‚è°ƒç”¨ SBI åŒ…è£…ï¼Œå°†å­—ç¬¦å’Œæ‰©å±•å·æ”¾å…¥çº¦å®šå¯„å­˜å™¨ï¼Œå†é€šè¿‡ ecall è¯·æ±‚ OpenSBI æœåŠ¡ã€‚",
      objective: "èƒ½æ²¿ç€ print_line â†’ putchar â†’ ecall â†’ OpenSBI â†’ UART è¿½è¸ªä¸€ä¸ªå­—ç¬¦ï¼Œå¹¶åŒºåˆ†å†…æ ¸æ—¥å¿—ä¸Žå›ºä»¶æ—¥å¿—ã€‚",
      concepts: ["SBI", "ecall", "a0/a7", "æ—©æœŸè°ƒè¯•"],
      prerequisites: ["P0 å¯åŠ¨çŽ°åœº", "RISC-V è°ƒç”¨çº¦å®š", "S-mode ä¸Ž M-mode åˆ†å·¥"],
      invariants: ["console ä¸ä¾èµ–æ ‡å‡†åº“", "SBI å‚æ•°å¯„å­˜å™¨ç¬¦åˆ ABI", "æˆåŠŸ marker ç¨³å®šä¸”å”¯ä¸€"],
      tasks: ["è¿½è¸ªå…¥å£ä¸Žå¯åŠ¨æ—¥å¿—", "è¡¥å…¨ console_write è·¯å¾„", "ä¿ç•™ PASS ä¸Ž system reset"],
      links: [["console.rs", "kernel/src/console.rs"], ["sbi.rs", "kernel/src/sbi.rs"], ["Lab1 æ–‡æ¡£", "docs/labs/lab1.md"]],
      explanation: "æŽ§åˆ¶å°æ—¢æ˜¯ Lab1 çš„å®žéªŒå¯¹è±¡ï¼Œä¹Ÿæ˜¯ Lab2â€“Lab7 çš„è§‚å¯Ÿé€šé“ï¼›åŽç»­å®žæ—¶å¯è§†åŒ–æ­£æ˜¯å¤ç”¨è¿™æ¡ä¸²å£é“¾è·¯ã€‚",
      visual: "flow",
      steps: [
        { id: "start", kicker: "Rust", title: "print_line", detail: "éåŽ†å­—ç¬¦ä¸²å­—èŠ‚" },
        { id: "putchar", kicker: "å†…æ ¸å°è£…", title: "putchar", detail: "å‡†å¤‡ SBI å‚æ•°" },
        { id: "registers", kicker: "å¯„å­˜å™¨", title: "a0 / a7", detail: "å­—ç¬¦ / æ‰©å±•å·" },
        { id: "ecall", kicker: "ç‰¹æƒæŒ‡ä»¤", title: "ecall", detail: "S-mode â†’ M-mode" },
        { id: "opensbi", kicker: "å›ºä»¶", title: "OpenSBI", detail: "å¤„ç† console_putchar" },
        { id: "console-available", kicker: "è®¾å¤‡", title: "QEMU UART", detail: "å­—ç¬¦æˆä¸ºå¯è§è¯æ®" }
      ],
      eventSteps: {
        start: 0, "print-line": 0, "sbi-ecall": 3, "opensbi-console": 4,
        "uart-write": 5, "console-available": 5, pass: 5, "task-1-pass": 1, "task-2-pass": 4
      }
    },
    {
      id: "lab2",
      label: "Lab2",
      tab: "Trap å¼‚å¸¸",
      title: "Trapï¼šæ‰“æ–­æ‰§è¡ŒåŽå¦‚ä½•å®‰å…¨è¿”å›ž",
      summary: "stvec å†³å®šå…¥å£ï¼›æ±‡ç¼–ä¿å­˜çŽ°åœºï¼›Rust handler è¯»å– scauseã€sepcã€stvalï¼Œå¤„ç† breakpoint åŽæŽ¨è¿› sepcï¼Œå†ç”± sret æ¢å¤æŽ§åˆ¶æµã€‚",
      objective: "èƒ½è§£é‡Šä¸€æ¬¡ ebreak çš„å®Œæ•´å¾€è¿”ï¼Œè¯´æ˜Žæ¯ä¸ª CSR å’Œ TrapFrame çš„èŒè´£ï¼Œå¹¶åˆ¤æ–­å¡æ­»å‘ç”Ÿåœ¨å“ªä¸ªè¾¹ç•Œã€‚",
      concepts: ["stvec", "scause", "sepc", "TrapFrame", "sret"],
      prerequisites: ["Lab1 æŽ§åˆ¶å°", "CSR åŸºç¡€", "RISC-V å¯„å­˜å™¨ä¿å­˜çº¦å®š"],
      invariants: ["ä¿å­˜ä¸Žæ¢å¤å¸ƒå±€å®Œå…¨ä¸€è‡´", "åªå¤„ç†å·²è¯†åˆ« cause", "32 ä½ ebreak å¤„ç†åŽ sepc += 4"],
      tasks: ["å®‰è£… stvec", "è¯»å–å¹¶è§£é‡Š trap CSR", "æŽ¨è¿› sepc å¹¶æ¢å¤çŽ°åœº"],
      links: [["trap.rs", "kernel/src/trap.rs"], ["Lab2 æ–‡æ¡£", "docs/labs/lab2.md"]],
      explanation: "Trap æ˜¯åŽç»­ç³»ç»Ÿè°ƒç”¨å’Œæ•…éšœå¤„ç†çš„å…±åŒéª¨æž¶ã€‚Lab2 å…ˆç”¨å¯æŽ§ breakpoint éš”ç¦»å­¦ä¹ è¿™æ¡æŽ§åˆ¶æµã€‚",
      visual: "flow",
      steps: [
        { id: "stvec-installed", kicker: "CSR", title: "stvec", detail: "å®‰è£… __trap_entry" },
        { id: "breakpoint-triggered", kicker: "å½“å‰æŒ‡ä»¤", title: "ebreak", detail: "åŒæ­¥å¼‚å¸¸å‘ç”Ÿ" },
        { id: "trap-frame", kicker: "å…¥å£æ±‡ç¼–", title: "TrapFrame", detail: "ä¿å­˜ GPR ä¸Ž CSR" },
        { id: "breakpoint-decoded", kicker: "Rust handler", title: "scause = 3", detail: "è¯†åˆ« breakpoint" },
        { id: "breakpoint-handled", kicker: "è¿”å›žåœ°å€", title: "sepc += 4", detail: "è·³è¿‡å·²å¤„ç†æŒ‡ä»¤" },
        { id: "pass", kicker: "è¿”å›ž", title: "sret", detail: "æ¢å¤åŽŸæ‰§è¡Œæµ" }
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
      tab: "ç‰©ç†é¡µå¸§",
      title: "ç‰©ç†å†…å­˜ï¼šåˆ†é…ã€é‡Šæ”¾ä¸Žå¤ç”¨",
      summary: "åˆ†é…å™¨ç®¡ç† [start,end) é¡µå·åŒºé—´ï¼šå…ˆä»Ž recycled æ ˆå¤ç”¨ï¼Œå†ä»Ž next é¡ºåºåˆ†é…ï¼›éžæ³•é‡Šæ”¾ä¸Ž double free å¿…é¡»è¢«æ‹’ç»ã€‚",
      objective: "èƒ½æŠŠåœ°å€ã€é¡µå·ã€å¯¹é½å’Œåˆ†é…å™¨çŠ¶æ€è”ç³»èµ·æ¥ï¼Œå¹¶ç”¨çŠ¶æ€å˜åŒ–è§£é‡Š alloc/dealloc çš„æ­£ç¡®æ€§ã€‚",
      concepts: ["4 KiB é¡µ", "PhysPageNum", "åŠå¼€åŒºé—´", "recycled", "Double Free"],
      prerequisites: ["Lab2 å¯è¯Šæ–­è¿è¡ŒçŽ¯å¢ƒ", "åœ°å€å¯¹é½", "Rust Option/Result"],
      invariants: ["ekernel ä¹‹å‰æ°¸ä¸åˆ†é…", "æ¯ä¸ªå·²åˆ†é…é¡µå”¯ä¸€", "è¶Šç•Œã€æœªåˆ†é…å’Œé‡å¤é‡Šæ”¾å‡æŠ¥é”™"],
      tasks: ["å®žçŽ°åœ°å€ä¸Žé¡µå·è½¬æ¢", "åˆå§‹åŒ–å¹¶åˆ†é…ç‰©ç†é¡µ", "éªŒè¯å›žæ”¶ã€è€—å°½ä¸Žéžæ³•é‡Šæ”¾"],
      links: [["address.rs", "kernel/src/memory/address.rs"], ["frame_allocator.rs", "kernel/src/memory/frame_allocator.rs"], ["Lab3 æ–‡æ¡£", "docs/labs/lab3.md"]],
      explanation: "Lab3 æä¾›â€œé¡µè¡¨é¡µä»Žå“ªé‡Œæ¥â€çš„ç­”æ¡ˆï¼Œå› æ­¤å®ƒæ˜¯ Lab4 çš„èµ„æºå‰æï¼›åˆ†é…å™¨æœ¬èº«è¿˜ä¸æ”¹å˜ CPU åœ°å€ç¿»è¯‘ã€‚",
      visual: "memory",
      steps: [
        { id: "start", title: "ä¿ç•™å†…æ ¸é¡µ" },
        { id: "address-ready", title: "åœ°å€å–æ•´ä¸Žé¡µå·" },
        { id: "allocator-ready", title: "åˆå§‹åŒ– [start,end)" },
        { id: "allocate", title: "next åˆ†é…æ–°é¡µ" },
        { id: "deallocate", title: "é‡Šæ”¾åˆ° recycled" },
        { id: "pass", title: "ä¼˜å…ˆå¤ç”¨å¹¶é€šè¿‡æ£€æŸ¥" }
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
      tab: "Sv39 é¡µè¡¨",
      title: "è™šæ‹Ÿåœ°å€å¦‚ä½•ç¿»è¯‘å¹¶å—åˆ°ä¿æŠ¤",
      summary: "Sv39 æŠŠè™šæ‹Ÿé¡µå·æ‹†ä¸ºä¸‰çº§ç´¢å¼•ã€‚éžå¶å­ PTE æŒ‡å‘ä¸‹ä¸€çº§é¡µè¡¨ï¼Œå¶å­ PTE åŒæ—¶ç»™å‡ºç‰©ç†é¡µå·å’Œ R/W/X/U æƒé™ã€‚",
      objective: "èƒ½ä»Žä¸€ä¸ª VA æ‰‹ç®— VPN[2:0] ä¸Ž offsetï¼Œæ²¿ä¸‰çº§é¡µè¡¨æ‰¾åˆ° PPNï¼Œå¹¶è§£é‡Š satpã€TLB å’Œæœ€å°æƒé™æ˜ å°„ã€‚",
      concepts: ["VPN[2:0]", "PTE", "R/W/X/U", "satp", "sfence.vma"],
      prerequisites: ["Lab3 é¡µå¸§åˆ†é…", "RISC-V Sv39", "é“¾æŽ¥æ®µè¾¹ç•Œ"],
      invariants: ["å¯ç”¨å‰æ˜ å°„å½“å‰ä»£ç ä¸Žæ ˆ", "éžå¶å­åªè®¾ç½® V", "text ä¸å¯å†™ã€data ä¸å¯æ‰§è¡Œ"],
      tasks: ["å®žçŽ°åœ°å€/PTE è¾…åŠ©ç±»åž‹", "å®žçŽ°ä¸‰çº§ map/translate", "å»ºç«‹æ˜ å°„å¹¶æ¿€æ´» satp"],
      links: [["page_table.rs", "kernel/src/memory/page_table.rs"], ["virtual_address.rs", "kernel/src/memory/virtual_address.rs"], ["Lab4 æ–‡æ¡£", "docs/labs/lab4.md"]],
      explanation: "Lab4 æŠŠ Lab3 çš„ç‰©ç†é¡µç»„ç»‡æˆå—æƒé™çº¦æŸçš„åœ°å€ç©ºé—´ï¼Œä¸º Lab6 çš„ U-mode é¡µé¢å»ºç«‹éš”ç¦»è¾¹ç•Œã€‚",
      visual: "paging",
      steps: [
        { id: "allocator-ready", title: "é¡µå¸§æ¥æº" },
        { id: "root-page-table", title: "æ ¹é¡µè¡¨" },
        { id: "page-table-built", title: "ä¸‰çº§ walk" },
        { id: "segments-mapped", title: "åˆ†æ®µæƒé™" },
        { id: "satp-activated", title: "å¯ç”¨ Sv39" },
        { id: "pass", title: "ç¿»è¯‘éªŒè¯" }
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
      tab: "åä½œè°ƒåº¦",
      title: "å¤šä¸ªä»»åŠ¡å¦‚ä½•å…±äº«ä¸€ä¸ª CPU",
      summary: "TaskControlBlock ä¿å­˜çŠ¶æ€ä¸Žä¸Šä¸‹æ–‡ï¼›ä»»åŠ¡ä¸»åŠ¨ yield å›žåˆ°è°ƒåº¦å™¨ï¼›Round-Robin é€‰æ‹©ä¸‹ä¸€ä¸ª Ready ä»»åŠ¡å¹¶æ¢å¤ callee-saved å¯„å­˜å™¨ã€‚",
      objective: "èƒ½åŒæ—¶ä»ŽçŠ¶æ€æœºã€CPU ä¸Šä¸‹æ–‡å’Œæ—¶é—´é¡ºåºè§£é‡Šä¸€æ¬¡ä»»åŠ¡åˆ‡æ¢ï¼Œå¹¶è¯´æ˜Žåä½œå¼è°ƒåº¦çš„é™åˆ¶ã€‚",
      concepts: ["TCB", "Ready/Running/Exited", "Round-Robin", "ra/sp/s0â€¦s11"],
      prerequisites: ["Lab4 å¯ç”¨åœ°å€ç©ºé—´", "RISC-V è°ƒç”¨çº¦å®š", "ç‹¬ç«‹å†…æ ¸æ ˆ"],
      invariants: ["æ¯æ¬¡åªæœ‰ä¸€ä¸ª Running", "Exited ä¸å†è°ƒåº¦", "sp 16 å­—èŠ‚å¯¹é½ä¸”å„ä»»åŠ¡æ ˆç‹¬ç«‹"],
      tasks: ["å»ºç«‹ä»»åŠ¡æŠ½è±¡ä¸ŽçŠ¶æ€æœº", "å®žçŽ° Round-Robin ä¸Ž yield", "å®Œæˆ __switch ä¸Žä¸‰ä»»åŠ¡éªŒæ”¶"],
      links: [["task/mod.rs", "kernel/src/task/mod.rs"], ["switch.S", "kernel/src/task/switch.S"], ["Lab5 æ–‡æ¡£", "docs/labs/lab5.md"]],
      explanation: "Lab5 æš‚ä¸é€šè¿‡æ—¶é’Ÿä¸­æ–­æŠ¢å ï¼›è¿™ä¸ªå–èˆè®©å­¦ç”Ÿå…ˆè§‚å¯Ÿâ€œä¿å­˜è°ã€æ¢å¤è°ã€çŠ¶æ€å¦‚ä½•æ”¹å˜â€ã€‚",
      visual: "scheduler",
      steps: [
        { id: "scheduler-ready", title: "3 ä¸ª Ready ä»»åŠ¡" },
        { id: "task-a-step-1", title: "Aâ‚" },
        { id: "task-b-step-1", title: "Bâ‚" },
        { id: "task-c-step-1", title: "Câ‚" },
        { id: "task-a-step-2", title: "Aâ‚‚" },
        { id: "task-b-step-2", title: "Bâ‚‚" },
        { id: "task-c-step-2", title: "Câ‚‚" },
        { id: "pass", title: "å…¨éƒ¨ Exited" }
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
      tab: "ç”¨æˆ·æ€ / syscall",
      title: "U-mode ä¸Ž S-mode çš„å—æŽ§å¾€è¿”",
      summary: "å†…æ ¸å‡†å¤‡ sepcã€sstatusã€ç”¨æˆ·æ ˆå’Œ sscratchï¼Œä»¥ sret è¿›å…¥ U-modeï¼›ç”¨æˆ·ç”¨ ecall è¿›å…¥åŒä¸€æ¡ Trap éª¨æž¶ï¼Œå†…æ ¸æŒ‰ a7 åˆ†å‘ç³»ç»Ÿè°ƒç”¨ã€‚",
      objective: "èƒ½è§£é‡Šä¸€æ¬¡ write syscall çš„æƒé™ã€æŽ§åˆ¶æµã€æ ˆå’Œ ABI å˜åŒ–ï¼Œå¹¶è¯´æ˜Žä¸ºä»€ä¹ˆç”¨æˆ·ç¨‹åºä¸èƒ½ç›´æŽ¥è°ƒç”¨å†…æ ¸å‡½æ•°ã€‚",
      concepts: ["U-mode", "SPP/SPIE", "sscratch", "ecall", "Syscall ABI"],
      prerequisites: ["Lab2 Trap éª¨æž¶", "Lab4 U ä½é¡µæ˜ å°„", "Lab5 ä¸Šä¸‹æ–‡æ¦‚å¿µ"],
      invariants: ["ç”¨æˆ·é¡µå¿…é¡»å¸¦ U ä¸Žæœ€å°æƒé™", "trap åŽåˆ‡åˆ°å†…æ ¸æ ˆ", "ç³»ç»Ÿè°ƒç”¨å¤„ç†åŽ sepc += 4"],
      tasks: ["å‡†å¤‡ç”¨æˆ·ä¸Šä¸‹æ–‡å¹¶è¿›å…¥ U-mode", "å®žçŽ° write/yield/exit åˆ†å‘", "å®Œæˆç”¨æˆ·ç¨‹åºçœŸå®žå¾€è¿”"],
      links: [["user.rs", "kernel/src/user.rs"], ["syscall.rs", "kernel/src/syscall.rs"], ["trap.rs", "kernel/src/trap.rs"], ["Lab6 æ–‡æ¡£", "docs/labs/lab6.md"]],
      explanation: "Lab6 å¤ç”¨ Lab2 çš„ Trapã€Lab4 çš„æƒé™å’Œ Lab5 çš„ä¸Šä¸‹æ–‡æ¦‚å¿µï¼ŒæŠŠå®ƒä»¬ç»„åˆæˆç¬¬ä¸€ä¸ªçœŸæ­£çš„ç”¨æˆ·/å†…æ ¸è¾¹ç•Œã€‚",
      visual: "privilege",
      steps: [
        { id: "user-context-ready", title: "å‡†å¤‡ CSR/ç”¨æˆ·æ ˆ" },
        { id: "entering-user", title: "sret â†’ U-mode" },
        { id: "user-ecall", title: "ecall â†’ Trap" },
        { id: "console-write", title: "dispatch(write)" },
        { id: "user-exit", title: "dispatch(exit)" },
        { id: "pass", title: "ç”¨æˆ·æ€é—­çŽ¯" }
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
      tab: "æ–‡ä»¶ I/O",
      title: "ä»Žç”¨æˆ·å­—èŠ‚åˆ° RAM æ–‡ä»¶",
      summary: "ç”¨æˆ·ç³»ç»Ÿè°ƒç”¨ç©¿è¿‡ Trap ä¸Ž ABIï¼Œfd è¡¨è®°å½•æ‰“å¼€çŠ¶æ€å’Œ offsetï¼ŒSimpleFs ç»„ç»‡æ–‡ä»¶è¯­ä¹‰ï¼ŒRamDevice æœ€ç»ˆæŒ‰ offset è¯»å†™å›ºå®šå­—èŠ‚ã€‚",
      objective: "èƒ½æ²¿ open/write/close/read è¿½è¸ªæ•°æ®ä¸ŽæŽ§åˆ¶æµï¼Œå¹¶ä»Žè®¾å¤‡ã€æ–‡ä»¶å¯¹è±¡ã€fd å’Œç”¨æˆ·ç¼“å†²åŒºå››å±‚è§£é‡ŠæŠ½è±¡è¾¹ç•Œã€‚",
      concepts: ["ByteDevice", "SimpleFs", "fd/offset", "SUM", "ç”¨æˆ·ç¼“å†²åŒº"],
      prerequisites: ["Lab6 syscall è·¯å¾„", "Lab4 ç”¨æˆ·é¡µæƒé™", "Rust Result ä¸Žé”™è¯¯æžšä¸¾"],
      invariants: ["æ¯ä¸ª fd ç‹¬ç«‹ç»´æŠ¤ offset", "close åŽ fd å¤±æ•ˆ", "ç”¨æˆ·ç¼“å†²åŒºæ£€æŸ¥é€šè¿‡æ—¶æ‰ä¸´æ—¶å¼€å¯ SUM"],
      tasks: ["å®žçŽ° RAM å­—èŠ‚è®¾å¤‡", "å®žçŽ° fd è¡¨ä¸Ž SimpleFs", "å®Œæˆç”¨æˆ·æ€æ–‡ä»¶ I/O éªŒæ”¶"],
      links: [["drivers/mod.rs", "kernel/src/drivers/mod.rs"], ["fs/mod.rs", "kernel/src/fs/mod.rs"], ["trap.rs", "kernel/src/trap.rs"], ["Lab7 æ–‡æ¡£", "docs/labs/lab7.md"]],
      explanation: "Lab7 æ˜¯æ•´æ¡çŸ¥è¯†é“¾çš„ç»¼åˆå®žéªŒï¼šæƒé™è¾¹ç•Œä¿æŠ¤ç”¨æˆ·æ•°æ®ï¼Œç³»ç»Ÿè°ƒç”¨ä¼ é€’æ„å›¾ï¼Œæ–‡ä»¶æŠ½è±¡ç®¡ç†çŠ¶æ€ï¼Œè®¾å¤‡æŠ½è±¡æ¬è¿å­—èŠ‚ã€‚",
      visualß~;êÚ$z{-®éÜj×¾ŠÎy¨N‹ùŠÎûÉ¾{¹>iÙþYîXhÞjžhÚîZèÎi[NŠøhÚîhš~ŠÎŠø®ijÞ8""“°¢ÒVÇ6R°¢7FFRæ7F—fU'VâÒçVÆÃ°¢Ð¢–b‚&WÆ––ær’°¢7FFRç&V6VçDWfVçG2ÒµÓ°¢7FFRæ6öç6öÆTÆ–æW2ÒÖW76vRæ6öç6öÆRÇÂµÓ°¢†ÖW76vRæWfVçG2ÇÂµÒ’æf÷$V6‚‚†WfVçB’ÓâÇ•'VçF–ÖTWfVçB†WfVçBÂfÇ6R’“°¢&VæFW$WfVçDfVVB‚“°¢&VæFW$6öç6öÆR‚“°¢&VæFW%7FvR‡7FFRç&V6VçDWfVçG5³ÒÇÂçVÆÂ“°¢Ð¢&VæFW%'Vå7FFR‚“°¢Ð¢–b†ÖW76vRçG—RÓÓÒ&'&æ6‚Ö6†ævR"’°¢&W6WE'VäWf–FVæ6R‚“°¢6ÆV%&WÆ”f÷$Æ—fU'Vâ‚“°¢Ç”6öçFW‡B†ÖW76vRæ6öçFW‡BÂG'VR“°¢FöÒæÆ7EöWfVçBçFW‡D6öçFVçBÒ[{.j8kX¾X‹XˆniJþXˆ~hÚ.ûÉ¢G¶ÖW76vRç&Wf–÷W2æ'&æ6‡Ò(i"G¶ÖW76vRæ6öçFW‡Bæ'&æ6‡Ö°¢&VæFW%&VF–7F–öä6ö×&—6öâ†çVÆÂ“°¢&W6WDF–væ÷7F–72‚.XˆniJþ[{.Xˆ~hÚ.ûÉ¾ZèÎh‰[Ù>X˜ÞXˆniJþ‹ùŠÎYîXhÞhš~ŠÎŠø®ijÞ8""“°¢&VæFW%'Vå7FFR‚“°¢Ð¢–b†ÖW76vRçG—RÓÓÒ''Vâ×7F'B"’°¢&W6WE'VäWf–FVæ6R‚“°¢Ç”6öçFW‡B†ÖW76vRæ6öçFW‡BÂG'VR“°¢&Vv–ä7F—fU'Vâ†ÖW76vR“°¢FöÒæÆ7EöWfVçBçFW‡D6öçFVçBÒ[ÈZx¾‹ùŠÂG¶ÖW76vRæ6öçFW‡Bæ'&æ6‡ÞûÈÎzØž[è^yÉþZéâÖ&¶W&°¢Ð¢–b†ÖW76vRçG—RÓÓÒ''Vâ×7FFR"’°¢7FFRç'Vå7FFRÒÖW76vRç7FFS°¢WFFT7F—fU'VäÆ–fV7–6ÆR†ÖW76vRç7FFR“°¢&VæFW%'Vå7FFR‚“°¢Ð¢–b†ÖW76vRçG—RÓÓÒ&6öç6öÆR"’°¢6GW&U'Vä÷WGWB†ÖW76vR“°¢–b‚7FFRç&WÆ’ç'Vâ’VæD6öç6öÆR†ÖW76vR“°¢Ð¢–b†ÖW76vRçG—RÓÓÒ'FVÆVÖWG'’"’°¢6GW&U'VäWfVçB†ÖW76vR“°¢–b‚7FFRç&WÆ’ç'Vâ’Ç•'VçF–ÖTWfVçB†ÖW76vR“°¢Ð¢–b†ÖW76vRçG—RÓÓÒ''VâÖW'&÷""’°¢–b‚7FFRç&WÆ’ç'Vâ’FöÒæÆ7EöWfVçBçFW‡D6öçFVçBÒ‹ùŠÎZK‹J^ûÉ¢G¶ÖW76vRæÖW76vWÖ°¢WFFT7F—fU'VäÆ–fV7–6ÆR‡²ââæÖW76vRÂ†6S¢&W'&÷""Ò“°¢f–æ—6„7F—fU'Vâ†ÖW76vR“°¢Ð¢–b†ÖW76vRçG—RÓÓÒ''VâÖVæB"’°¢–b‚7FFRç&WÆ’ç'Vâ’°¢FöÒæÆ7EöWfVçBçFW‡D6öçFVçBÒÖW76vRç7F÷V@¢ò[{.XÎjÚ"G¶ÖW76vRæ6öçFW‡Bæ'&æ6‡ÞûÈÎXúþKº^Xˆ~hÚ.h‰n˜xÞik‹ùŠÎXˆniJö ¢¢TÕR‹ùŠÎ{¹>iÙþûÉ¦W†—B6öFRG¶ÖW76vRæW†—D6öFWÖ°¢Ð¢WFFT7F—fU'VäÆ–fV7–6ÆR‡²ââæÖW76vRÂ†6S¢ÖW76vRç7F÷VBò'7F÷VB"¢&f–æ—6†VB"Ò“°¢f–æ—6„7F—fU'Vâ†ÖW76vR“°¢Ð¢Ð ¢gVæ7F–öâ6öææV7EFVÆVÖWG'’‚’°¢–b‡&W6VçFF–öäVæ&ÆVB‚’’°¢6WD6öææV7F–öâ‚.kÉNzK®jŠ[ÈþûÉ®KˆÞKÉ®‹ùîhê^Zéîi{n‹ùŠÎûÈÎK™þKˆÞKÉ®ˆz®XªŽY
þXª‚TÕR"ÂfÇ6R“°¢&VæFW%'Vå7FFR‚“°¢&WGW&ã°¢Ð¢–b‚²&‡GG¢"Â&‡GG3¢%Òæ–æ6ÇVFW2‡v–æF÷ræÆö6F–öâç&÷Fö6öÂ’’°¢6WD6öææV7F–öâ‚.zk¾{«þyú^ŠønjŠ[ÈþûÉ®Šû~yJŽY
þXªŽˆI®iÊÎ‹ù¾XZ^Zéîi{njŠ[Èò"ÂfÇ6R“°¢&VæFW%'Vå7FFR‚“°¢&WGW&ã°¢Ð ¢–b‡7FFRç6ö6¶WBbb7FFRç6ö6¶WBç&VG•7FFRÂ"’&WGW&ã°¢6öç7B&÷Fö6öÂÒv–æF÷ræÆö6F–öâç&÷Fö6öÂÓÓÒ&‡GG3¢"ò'w73¢"¢'w3¢#°¢ÆWB6ö6¶WC°¢G'’°¢6ö6¶WBÒæWrvV%6ö6¶WB†G·&÷Fö6öÇÒòòG·v–æF÷ræÆö6F–öâæ†÷7GÒ÷w6“°¢7FFRç6ö6¶WBÒ6ö6¶WC°¢Ò6F6‚…ò’°¢6WD6öææV7F–öâ‚.iÊÎYËj^hê^YšŽKˆÞXúþyJŽûÉ®K¸ÞXúþh˜¾XªŽhêŽkÉB"ÂfÇ6R“°¢&WGW&ã°¢Ð ¢6ö6¶WBæFDWfVçDÆ—7FVæW"‚&÷Vâ"Â‚’Óâ°¢–b‡7FFRç6ö6¶WBÓÒ6ö6¶WBÇÂ&W6VçFF–öäVæ&ÆVB‚’’&WGW&ã°¢7FFRæÆ—fRÒG'VS°¢6WD6öææV7F–öâ‚.Zéîi{n‹ùîhê^ûÉ®jÚ>YÊŽ‹yþ‹Š¢v—BXˆniJþKˆâTÕR"ÂG'VR“°¢&VæFW%'Vå7FFR‚“°¢Ò“°¢6ö6¶WBæFDWfVçDÆ—7FVæW"‚&ÖW76vR"Â‡&r’Óâ°¢–b‡7FFRç6ö6¶WBÓÒ6ö6¶WBÇÂ&W6VçFF–öäVæ&ÆVB‚’’&WGW&ã°¢G'’°¢†æFÆU6ö6¶WDÖW76vR„¥4ôâç'6R‡&ræFF’“°¢Ò6F6‚…ò’°¢6WD6öææV7F–öâ‚.iKnX‹izk9^ŠønXŠ¾y¨NiÊÎYËK¨¾K»b"ÂfÇ6R“°¢Ð¢Ò“°¢6ö6¶WBæFDWfVçDÆ—7FVæW"‚&6Æ÷6R"Â‚’Óâ°¢–b‡7FFRç6ö6¶WBÓÒ6ö6¶WB’&WGW&ã°¢7FFRç6ö6¶WBÒçVÆÃ°¢7FFRæÆ—fRÒfÇ6S°¢6WD6öææV7F–öâ‚.Zéîi{n‹ùîhê^[{.ijÞ[ÈûÉ®KùÞyYžh˜¾XªŽhêŽkÉB"ÂfÇ6R“°¢&VæFW%'Vå7FFR‚“°¢v–æF÷ræ6ÆV%F–ÖV÷WB‡7FFRç&V6öææV7EF–ÖW"“°¢–b‚&W6VçFF–öäVæ&ÆVB‚’’7FFRç&V6öææV7EF–ÖW"Òv–æF÷rç6WEF–ÖV÷WB†6öææV7EFVÆVÖWG'’Âƒ“°¢Ò“°¢6ö6¶WBæFDWfVçDÆ—7FVæW"‚&W'&÷""Â‚’Óâ°¢–b‡7FFRç6ö6¶WBÓÒ6ö6¶WBÇÂ&W6VçFF–öäVæ&ÆVB‚’’&WGW&ã°¢6WD6öææV7F–öâ‚.iÊÎYËj^hê^YšŽi¨.KˆÞXúþyJ‚"ÂfÇ6R“°¢Ò“°¢Ð ¢7–æ2gVæ7F–öâ'Vä7W'&VçD'&æ6‚‚’°¢–b‡&W6VçFF–öäVæ&ÆVB‚’’°¢6WE&W6VçFF–öå7FGW2‚.kÉNzK®jŠ[ÈþKˆÞKÉ®Y
þXª‚TÕ^ûÉ¾Šû~XXŽ˜X{®kÉNzK®jŠ[Èþ8""Â&W'&÷""“°¢&WGW&ã°¢Ð¢–b‚&VF–7F–öäÖF6†W46öçFW‡B‚’’°¢FöÒç&VF–7F–öå÷7FGW2çFW‡D6öçFVçBÒ.Šû~XXŽK‹®[Ù>X˜ÞXˆniJþKùÞZÙŽš(NkX¾8"#°¢FöÒç&VF–7F–öå÷&V6öæ–æræfö7W2‚“°¢&WGW&ã°¢Ð¢FöÒç'Våö7W'&VçBæF—6&ÆVBÒG'VS°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚‚"ö’÷'Vâ"Â²ÖWF†öC¢%õ5B"Ò“°¢6öç7B&W7VÇBÒv—B&W7öç6Ræ§6öâ‚“°¢–b‚&W7öç6Ræö²’°¢–b‡&W7VÇBç&VfÆ–v‡B’&VæFW%&VfÆ–v‡DF–væ÷7F–72‡&W7VÇB“°¢F‡&÷ræWrW'&÷"‡&W7VÇBæW'&÷"ÇÂ…EEG·&W7öç6Rç7FGW7Ö“°¢Ð¢FöÒç'VçF–ÖUö†–çBçFW‡D6öçFVçBÒ[{.Šû~k.‹ùŠÂG·&W7VÇBæ6öçFW‡Bæ'&æ6‡Þ8&°¢Ò6F6‚†W'&÷"’°¢FöÒç'VçF–ÖUö†–çBçFW‡D6öçFVçBÒizk9^Y
þXªŽûÉ¢G¶W'&÷"æÖW76vWÖ°¢FöÒç'Våö7W'&VçBæF—6&ÆVBÒfÇ6S°¢Ð¢Ð ¢7–æ2gVæ7F–öâ7F÷7W'&VçE'Vâ‚’°¢–b‡&W6VçFF–öäVæ&ÆVB‚’’°¢6WE&W6VçFF–öå7FGW2‚.kÉNzK®jŠ[ÈþKˆÞKÉ®i8ÞKÙÂTÕ^ûÉ¾Šû~XXŽ˜X{®kÉNzK®jŠ[Èþ8""Â&W'&÷""“°¢&WGW&ã°¢Ð¢FöÒç7F÷ö7W'&VçBæF—6&ÆVBÒG'VS°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚‚"ö’÷7F÷"Â²ÖWF†öC¢%õ5B"Ò“°¢6öç7B&W7VÇBÒv—B&W7öç6Ræ§6öâ‚“°¢–b‚&W7öç6Ræö²’F‡&÷ræWrW'&÷"‡&W7VÇBæW'&÷"ÇÂ…EEG·&W7öç6Rç7FGW7Ö“°¢FöÒç'VçF–ÖUö†–çBçFW‡D6öçFVçBÒ.[{.Šû~k.XÎjÚ.[Ù>X˜ÞièN[»®h‰bTÕR‹ù¾zˆ¾8"#°¢Ò6F6‚†W'&÷"’°¢FöÒç'VçF–ÖUö†–çBçFW‡D6öçFVçBÒizk9^XÎjÚ.ûÉ¢G¶W'&÷"æÖW76vWÖ°¢&VæFW%'Vå7FFR‚“°¢Ð¢Ð ¢gVæ7F–öâ7F÷WFò‚’°¢–b‚7FFRæWFõF–ÖW"’&WGW&ã°¢v–æF÷ræ6ÆV$–çFW'fÂ‡7FFRæWFõF–ÖW"“°¢7FFRæWFõF–ÖW"ÒçVÆÃ°¢FöÒæWFõ÷Æ’çFW‡D6öçFVçBÒ.ˆz®XªŽŠë.Šz2#°¢FöÒæWFõ÷Æ’ç6WDGG&–'WFR‚&&–×&W76VB"Â&fÇ6R"“°¢Ð ¢gVæ7F–öâFövvÆTWFò‚’°¢–b‡7FFRæWFõF–ÖW"’°¢7F÷WFò‚“°¢&WGW&ã°¢Ð¢FöÒæWFõ÷Æ’çFW‡D6öçFVçBÒ.i¨.XÎŠë.Šz2#°¢FöÒæWFõ÷Æ’ç6WDGG&–'WFR‚&&–×&W76VB"Â'G'VR"“°¢7FFRæWFõF–ÖW"Òv–æF÷rç6WD–çFW'fÂ‚‚’Óâ°¢6öç7B7FvRÒ7FvW5·7FFRç7FvT–æFW…Ó°¢6öç7B7FWÒ7FFRæÖçVÅ7FW5·7FvRæ–EÒÇÂ°¢–b‡7FWÂ7FvRç7FW2æÆVæwF‚Ò’°¢7FFRæÖçVÅ7FW5·7FvRæ–EÒÒ7FW²°¢&VæFW%7FvR‚“°¢ÒVÇ6R°¢7FFRç7FvT–æFW‚Ò‡7FFRç7FvT–æFW‚²’R7FvW2æÆVæwFƒ°¢7FFRæÖçVÅ7FW5·7FvW5·7FFRç7FvT–æFW…Òæ–EÒÒ°¢&VæFW%7FvR‚“°¢Ð¢ÒÂS“°¢Ð ¢gVæ7F–öâ6fU&VF–7F–öâ†WfVçB’°¢WfVçBç&WfVçDFVfVÇB‚“°¢6öç7BW‡V7FVD'V–ÆBÒFöÒç&VF–7F–öåö'V–ÆBçfÇVS°¢6öç7BW‡V7FVE'VâÒFöÒç&VF–7F–öå÷'VâçfÇVS°¢6öç7BW‡V7FVE72ÒFöÒç&VF–7F–öå÷72çfÇVS°¢6öç7BW‡V7FVDWfVçG2Ò6VÆV7FVE&VF–7F–öäWfVçG2‚“°¢6öç7B&V6öæ–ærÒFöÒç&VF–7F–öå÷&V6öæ–ærçfÇVRçG&–Ò‚“°¢–b‚7FFRæ6öçFW‡B’°¢FöÒç&VF–7F–öå÷7FGW2çFW‡D6öçFVçBÒ.[	®iÊ®ŠønXŠ¾[Ù>X˜Òv—BXˆniJþûÈÎŠû~XXŽ‹ùîhê^iÊÎYËj^hê^YšŽ8"#°¢&WGW&ã°¢Ð¢–b‚W‡V7FVD'V–ÆBÇÂW‡V7FVE'VâÇÂW‡V7FVE72ÇÂ&V6öæ–ær’°¢FöÒç&VF–7F–öå÷7FGW2çFW‡D6öçFVçBÒ.Šû~ZèÎi[NZ¾XižièN[»®8‹ùŠÎ852š(NkX¾Y(Îš(NkX¾KéÞhÚî8"#°¢&WGW&ã°¢Ð¢6öç7BWfVçD÷F–öä6÷VçBÒFöÒç&VF–7F–öåöWfVçEö÷F–öç2çVW'•6VÆV7F÷$ÆÂ‚v–çWE¶æÖSÒ'&VF–7F–öâÖWfVçG2%Òr’æÆVæwFƒ°¢–b†WfVçD÷F–öä6÷VçBâbbW‡V7FVDWfVçG2æÆVæwF‚ÓÓÒ’°¢FöÒç&VF–7F–öå÷7FGW2çFW‡D6öçFVçBÒ.Šû~ˆ{>[	˜žhºžKˆKŠ®š(NŠêX{®xëy¨NX[>™JîK¨¾K»n8"#°¢&WGW&ã°¢Ð¢7FFRç&VF–7F–öâÒv–æF÷rä÷5&VF–7F–öäÖöFVÃòæ7&VFU&VF–7F–öâ‡°¢W‡V7FVD'V–ÆBÀ¢W‡V7FVE'VâÀ¢W‡V7FVDWfVçG2À¢W‡V7FVE73¢W‡V7FVE72ÓÓÒ'G'VR"À¢&V6öæ–ærÀ¢'&æ6ƒ¢7FFRæ6öçFW‡Bæ'&æ6‚À¢6öÖÖ—C¢7FFRæ6öçFW‡Bæ6öÖÖ—BÀ¢Æ#¢7FFRæ6öçFW‡BæÆ"À¢6fVDC¢FFRææ÷r‚¢ÒÂ7FFRæ6öçFW‡B’ÇÂçVÆÃ°¢–b‚7FFRç&VF–7F–öâ’°¢FöÒç&VF–7F–öå÷7FGW2çFW‡D6öçFVçBÒ.š(NkX¾Xh^ZëžjÎ[ÈþiziXŽûÈÎŠû~j8iú^Yî˜xÞŠù^8"#°¢&WGW&ã°¢Ð¢7F÷&U&VF–7F–öâ‡7FFRç&VF–7F–öâ“°¢7FFRæÆ7E&VF–7F–öä76W76ÖVçBÒ"#°¢&VæFW%&VF–7F–öä6ö×&—6öâ†çVÆÂ“°¢&VæFW%&VF–7F–öävFR‚“°¢&VæFW%'Vå7FFR‚“°¢Ð ¢gVæ7F–öâ†æFÆUF–ÖVÆ–æU6†÷'F7WB†WfVçB’°¢–b†WfVçBæ7G&Ä¶W’ÇÂWfVçBæÇD¶W’ÇÂWfVçBæÖWF¶W’’&WGW&ã°¢6öç7BF&vWBÒWfVçBçF&vWC°¢6öç7B—4–çFW&7F—fRÒF&vWB–ç7Fæ6Vöb…DÔÄVÆVÖVçBbb&ööÆVâ€¢F&vWBæ6Æ÷6W7B‚&–çWBÂFW‡F&VÂ6VÆV7BÂ'WGFöâÂÂ·F&–æFW…ÒÂ¶6öçFVçFVF—F&ÆUÒ"¢“°¢–b†WfVçBæ¶W’ÓÓÒ$W66R"’°¢7FFRçF–ÖVÆ–æT6öçG&öÆÆW#òçW6R‚“°¢&VæFW%&WÆ•F–ÖVÆ–æR‚“°¢&WGW&ã°¢Ð¢–b†—4–çFW&7F—fRÇÂ7FFRç&WÆ’ç'Vâ’&WGW&ã° ¢6öç7B6æ6†÷BÒF–ÖVÆ–æU6æ6†÷B‡7FFRç&WÆ’ç'Vâ“°¢–b‚†WfVçBæ6öFRÓÓÒ%76R"ÇÂWfVçBæ¶W’ÓÓÒ""’bbWfVçBç&WVB’°¢WfVçBç&WfVçDFVfVÇB‚“°¢FövvÆUF–ÖVÆ–æUÆ–&6²‚“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’ÓÓÒ$'&÷tÆVgB"’°¢WfVçBç&WfVçDFVfVÇB‚“°¢Ö÷fU&WÆ’‚Ó“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’ÓÓÒ$'&÷u&–v‡B"’°¢WfVçBç&WfVçDFVfVÇB‚“°¢Ö÷fU&WÆ’ƒ“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’ÓÓÒ$†öÖR"bb6æ6†÷Bçf—6–&ÆT–æFW†W2æÆVæwF‚’°¢WfVçBç&WfVçDFVfVÇB‚“°¢§V×&WÆ•Fò‡6æ6†÷Bçf—6–&ÆT–æFW†W5³ÒÂ&f—'7B×f—6–&ÆR"“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’ÓÓÒ$VæB"bb6æ6†÷Bçf—6–&ÆT–æFW†W2æÆVæwF‚’°¢WfVçBç&WfVçDFVfVÇB‚“°¢§V×&WÆ•Fò‡6æ6†÷Bçf—6–&ÆT–æFW†W5·6æ6†÷Bçf—6–&ÆT–æFW†W2æÆVæwF‚ÒÒÂ&Æ7B×f—6–&ÆR"“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’çFôÆ÷vW$66R‚’ÓÓÒ&b"’°¢WfVçBç&WfVçDFVfVÇB‚“°¢§V×Fôf—'7Df–ÇW&R‚“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’çFôÆ÷vW$66R‚’ÓÓÒ&B"’°¢WfVçBç&WfVçDFVfVÇB‚“°¢§V×Fôf—'7DF–ffW&Væ6R‚“°¢&WGW&ã°¢Ð¢–b†WfVçBæ¶W’ÓÓÒ"ò"’°¢WfVçBç&WfVçDFVfVÇB‚“°¢FöÒçF–ÖVÆ–æUö¶W—v÷&Eöf–ÇFW"æfö7W2‚“°¢Ð¢Ð ¢FöÒç&Wf–÷W5÷7FvRæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ6WE7FvR‡7FFRç7FvT–æFW‚Ò’“°¢FöÒææW‡E÷7FvRæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ6WE7FvR‡7FFRç7FvT–æFW‚²’“°¢FöÒæWFõ÷Æ’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂFövvÆTWFò“°¢FöÒç'Våö7W'&VçBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â'Vä7W'&VçD'&æ6‚“°¢FöÒç7F÷ö7W'&VçBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7F÷7W'&VçE'Vâ“°¢FöÒæ6ÆV%öWfVçG2æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢7FFRç&V6VçDWfVçG2ÒµÓ°¢7FFRç6VÆV7FVDWfVçBÒçVÆÃ°¢7FFRç6VÆV7FVD¶æ÷vÆVFvTæöFRÒçVÆÃ°¢&VæFW$WfVçDfVVB‚“°¢&VæFW$WfVçDFWF–Ç2‚“°¢&VæFW$g&ÖWv÷&²‚“°¢Ò“°¢FöÒç&VF–7F–öåöf÷&ÒæFDWfVçDÆ—7FVæW"‚'7V&Ö—B"Â6fU&VF–7F–öâ“°¢FöÒç6fU÷'VâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6fT6ö×ÆWFVE'Vâ“°¢FöÒæW‡÷'E÷'Våö§6öâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâW‡÷'E6VÆV7FVE'Vâ‚&§6öâ"’“°¢FöÒæW‡÷'E÷'VåöÖ&¶F÷vâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâW‡÷'E6VÆV7FVE'Vâ‚&Ö&¶F÷vâ"’“°¢FöÒæ–×÷'E÷'Vå÷G&–vvW"æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâFöÒæ–×÷'E÷'Våöf–ÆRæ6Æ–6²‚’“°¢FöÒæ–×÷'E÷'Våöf–ÆRæFDWfVçDÆ—7FVæW"‚&6†ævR"Â‚’Óâ–×÷'E'Väf–ÆR†FöÒæ–×÷'E÷'Våöf–ÆRæf–ÆW3òå³Ò’“°¢FöÒç'Vå÷7V&Ö—76–öå÷6VÆV7BæFDWfVçDÆ—7FVæW"‚&6†ævR"Â&VæFW%'Vå7V&Ö—76–öå&Wf–Wr“°¢FöÒç'Vå÷7V&Ö—76–öåö6öç6VçBæFDWfVçDÆ—7FVæW"‚&6†ævR"Â‚’Óâ°¢FöÒç'Vå÷7V&Ö—76–öå÷7V&Ö—BæF—6&ÆVBÒFöÒç'Vå÷7V&Ö—76–öåö6öç6VçBæ6†V6¶VBÇÂ6VÆV7FVE'Vå7V&Ö—76–öâ‚“°¢–b‚FöÒç'Vå÷7V&Ö—76–öåö6öç6VçBæ6†V6¶VB’°¢6WE'Vå7V&Ö—76–öå7FGW2‚.[	®iÊ®YÎhHþûÈÎ‹ùŠÎŠë[Ù^KˆÞKÉ®Xù˜8""Â&–æfò"“°¢Ð¢Ò“°¢FöÒç'Vå÷7V&Ö—76–öå÷7V&Ö—BæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7V&Ö—E6VÆV7FVE'Vå&V6÷&B“°¢FöÒç&WÆ•÷7F'BæFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂÆöE6VÆV7FVE&WÆ’“°¢FöÒç&WÆ•÷Æ•÷W6RæFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂFövvÆUF–ÖVÆ–æUÆ–&6²“°¢FöÒç&WÆ•÷7VVBæFDWfVçDÆ—7FVæW"‚&6†ævR"Â‚’Óâ°¢7FFRçF–ÖVÆ–æT6öçG&öÆÆW#òç6WE7VVB„çVÖ&W"†FöÒç&WÆ•÷7VVBçfÇVR’“°¢&VæFW%&WÆ•F–ÖVÆ–æR‚“°¢Ò“°¢FöÒçF–ÖVÆ–æU÷7FGW5öf–ÇFW"æFDWfVçDÆ—7FVæW"‚&6†ævR"ÂÇ•F–ÖVÆ–æTf–ÇFW'2“°¢FöÒçF–ÖVÆ–æU÷6÷W&6Uöf–ÇFW"æFDWfVçDÆ—7FVæW"‚&6†ævR"ÂÇ•F–ÖVÆ–æTf–ÇFW'2“°¢FöÒçF–ÖVÆ–æUöÆ%öf–ÇFW"æFDWfVçDÆ—7FVæW"‚&6†ævR"Â‚’Óâ°¢÷VÆFUF–ÖVÆ–æTf–ÇFW'2‡7FFRç&WÆ’ç'VâÂG'VR“°¢Ç•F–ÖVÆ–æTf–ÇFW'2‚“°¢Ò“°¢FöÒçF–ÖVÆ–æU÷7FWöf–ÇFW"æFDWfVçDÆ—7FVæW"‚&6†ævR"ÂÇ•F–ÖVÆ–æTf–ÇFW'2“°¢FöÒçF–ÖVÆ–æUö¶W—v÷&Eöf–ÇFW"æFDWfVçDÆ—7FVæW"‚&–çWB"ÂÇ•F–ÖVÆ–æTf–ÇFW'2“°¢FöÒçF–ÖVÆ–æUö6ÆV%öf–ÇFW'2æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢&W6WEF–ÖVÆ–æTf–ÇFW'2‚“°¢÷VÆFUF–ÖVÆ–æTf–ÇFW'2‡7FFRç&WÆ’ç'Vâ“°¢Ç•F–ÖVÆ–æTf–ÇFW'2‚“°¢Ò“°¢FöÒç&WÆ•÷&Wf–÷W2æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâÖ÷fU&WÆ’‚Ó’“°¢FöÒç&WÆ•öæW‡BæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâÖ÷fU&WÆ’ƒ’“°¢FöÒç&WÆ•öf—'7Eöf–ÇW&RæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â§V×Fôf—'7Df–ÇW&R“°¢FöÒç&WÆ•öf—'7EöF–ffW&Væ6RæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â§V×Fôf—'7DF–ffW&Væ6R“°¢FöÒæ6ö×&U÷'Vç2æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â&VæFW$6ö×&—6öâ“°¢FöÒç&W6VçFF–öåöÖöFU÷FövvÆSòæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6WE&W6VçFF–öäÖöFR‚&W6VçFF–öäVæ&ÆVB‚’Â²Æ#¢7FvW5·7FFRç7FvT–æFW…Òæ–BÒ“°¢Ò“°¢FöÒç&W6VçFF–öåöW†—CòæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ6WE&W6VçFF–öäÖöFR†fÇ6R’“°¢FöÒç&W6VçFF–öåö–×÷'CòæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâFöÒæ–×÷'E÷'Våöf–ÆRæ6Æ–6²‚’“°¢FöÒç&W6VçFF–öå÷&W6WCòæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â&W6WE&W6VçFF–öåf–Wr“°¢FöÒç&W6VçFF–öåögVÆÇ67&VVãòæFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂFövvÆU&W6VçFF–öägVÆÇ67&VVâ“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×&W6VçFF–öâÖÆ%Ò"’æf÷$V6‚‚†'WGFöâ’Óâ°¢'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ÷Vå&W6VçFF–öäÆ"†'WGFöâæFF6WBç&W6VçFF–öäÆ"’“°¢Ò“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×&W6VçFF–öâ×F&vWEÒ"’æf÷$V6‚‚†'WGFöâ’Óâ°¢'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6öç7B6VÆV7F÷"Ò'WGFöâæFF6WBç&W6VçFF–öåF&vWC°¢–b‚6VÆV7F÷#òç7F'G5v—F‚‚"2"’’&WGW&ã°¢Fö7VÖVçBçVW'•6VÆV7F÷"‡6VÆV7F÷"“òç67&öÆÄ–çFõf–Wr‡²&V†f–÷#¢'6Öö÷F‚"Â&Æö6³¢'7F'B"Ò“°¢Ò“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&gVÆÇ67&VVæ6†ævR"ÂWFFTgVÆÇ67&VVä6öçG&öÂ“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Â†æFÆUF–ÖVÆ–æU6†÷'F7WB“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'vV†–FR"Â‚’Óâ°¢7FFRçF–ÖVÆ–æT6öçG&öÆÆW#òçW6R‚“°¢–b‡&W6VçFF–öäVæ&ÆVB‚’’°¢W'6—7E&W6VçFF–öå7FFR‡°¢Æ#¢7FvW5·7FFRç7FvT–æFW…Òæ–BÀ¢'Vä–C¢7FFRç&WÆ’ç'Vãòæ–BÇÂçVÆÂÀ¢&WÆ”–æFWƒ¢7FFRç&WÆ’æ–æFW‚À¢F–ÖVç6–öã¢7FFRæ7F—fTF–ÖVç6–öà¢Ò“°¢Ð¢Ò“° ¢v–æF÷rä÷4fVVF&6³òæ–æ—DfVVF&6´6VçFW"‚“°¢&VæFW$F–ÖVç6–öåF'2‚“°¢&VæFW$WfVçDfVVB‚“°¢&VæFW$WfVçDFWF–Ç2‚“°¢&VæFW$6öç6öÆR‚“°¢&VæFW%6fVE'Vç2‚“°¢&VæFW%&WÆ•F–ÖVÆ–æR‚“°¢&VæFW%&VF–7F–öävFR‚“°¢&VæFW%&VF–7F–öä6ö×&—6öâ†çVÆÂ“°¢&W6WDF–væ÷7F–72‚“°¢&VæFW%'Vå7FFR‚“°¢–b‡&W6VçFF–öäVæ&ÆVB‚’’°¢F—66öææV7E&W6VçFF–öåFVÆVÖWG'’‚“°¢7–æ5&W6VçFF–öåV’‚“°¢&W7F÷&U&W6VçFF–öåf–Wr‚“°¢7FFRç&W6VçFF–öå&VG’ÒG'VS°¢W'6—7E&W6VçFF–öå7FFR‡°¢Æ#¢7FvW5·7FFRç7FvT–æFW…Òæ–BÀ¢'Vä–C¢7FFRç&WÆ’ç'Vãòæ–BÇÂçVÆÂÀ¢&WÆ”–æFWƒ¢7FFRç&WÆ’æ–æFW‚À¢F–ÖVç6–öã¢7FFRæ7F—fTF–ÖVç6–öà¢Ò“°¢ÒVÇ6R°¢6WE7FvRƒ“°¢7FFRç&W6VçFF–öå&VG’ÒG'VS°¢7–æ5&W6VçFF–öåV’‚“°¢6öææV7EFVÆVÖWG'’‚“°¢Ð§Ò’‚“°