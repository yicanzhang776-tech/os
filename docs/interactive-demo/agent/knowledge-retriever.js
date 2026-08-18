"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KNOWLEDGE_SCHEMA_VERSION = "os-tutor.knowledge/v1";
const SUPPORTED_LABS = Object.freeze([
  "lab1", "lab2", "lab3", "lab4", "lab5", "lab6", "lab7"
]);
const KNOWLEDGE_ROOT = path.join(__dirname, "..", "..", "knowledge", "labs");
const KNOWLEDGE_PATHS = Object.freeze(Object.fromEntries(SUPPORTED_LABS.map((lab) => [
  lab,
  path.join(KNOWLEDGE_ROOT, lab, "knowledge.json")
])));
const KNOWLEDGE_DIGESTS = Object.freeze({
  lab1: "fe9698bc3474a2d4133fd26ea158b2e3f043f617c40c333b9ddf9800807dbda8",
  lab2: "24f42f5cf56ae362e287c1b6ba6172236c2fef4618da1774685f44a650dfb68d",
  lab3: "ca7177585e5a4a3ca889bd2f8cddd3f42001cf24b1e9e2a683929a650397f1b3",
  lab4: "1b01efa27f67c4a6847a15eaa69f11cd1877be65192c4d3aaf960ddc2c63764a",
  lab5: "4ec50f89956ec334c9a8da2767f0042b82db7912c6f36bb6617d939582ca1180",
  lab6: "a5ba29914bb9a647a6363277267523a0bff374d601c3ac365c4ca52d5b2451f2",
  lab7: "7f0b6298ae18fcb69aa6ff883f95da8be7131b0f0d136168c0582fdf5b892837"
});
const DEFAULT_KNOWLEDGE_LIMIT = 4;
const MAX_KNOWLEDGE_RESULTS = 5;
const DEFAULT_MAX_HINT_LEVEL = 3;
const MAX_STUDENT_HINT_LEVEL = 4;
const MIN_RELEVANCE_SCORE = 30;
const MAX_QUERY_LENGTH = 4_000;
const MAX_CHUNKS_PER_LAB = 256;
const MAX_CHUNK_CONTENT_LENGTH = 2_000;
const FORBIDDEN_TEXT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SOLUTION_SOURCE_PATTERN = /(?:^|[\\/:\s])lab[1-7][-_]solution(?:[\\/:\s]|$)|(?:^|[\\/:\s])SOLUTION\.md(?:$|[\\/:\s])|TEACHER[_-]?GUIDE(?:\.md)?/i;
const CODE_BLOCK_PATTERN = /```|~~~|(?:^|\n)\s*(?:pub\s+)?(?:unsafe\s+)?(?:extern\s+"C"\s+)?fn\s+[A-Za-z_]/;

const EXACT_TERMS = Object.freeze([
  ["opensbi", ["opensbi"]],
  ["s-mode", ["s-mode", "s mode", "s模式"]],
  ["u-mode", ["u-mode", "u mode", "u模式", "用户态"]],
  ["m-mode", ["m-mode", "m mode", "m模式"]],
  ["kernel_main", ["kernel_main"]],
  ["_start", ["_start"]],
  ["sbi", ["sbi"]],
  ["stvec", ["stvec"]],
  ["scause", ["scause"]],
  ["sepc", ["sepc"]],
  ["stval", ["stval"]],
  ["breakpoint", ["breakpoint", "断点异常"]],
  ["physaddr", ["physaddr", "物理地址"]],
  ["physpagenum", ["physpagenum", "物理页号"]],
  ["sv39", ["sv39"]],
  ["satp", ["satp"]],
  ["sfence.vma", ["sfence.vma", "sfence vma"]],
  ["pte", ["pte", "页表项"]],
  ["vpn", ["vpn", "虚拟页号"]],
  ["ppn", ["ppn", "物理页号"]],
  ["taskcontext", ["taskcontext", "任务上下文"]],
  ["__switch", ["__switch", "上下文切换"]],
  ["yield", ["yield", "主动让出"]],
  ["ecall", ["ecall"]],
  ["sret", ["sret"]],
  ["syscall", ["syscall", "系统调用"]],
  ["a7", ["a7"]],
  ["a0", ["a0"]],
  ["register abi", ["寄存器约定", "id和返回值", "编号和返回值", "系统调用abi"]],
  ["ramdevice", ["ramdevice", "内存设备"]],
  ["simplefs", ["simplefs", "简化文件系统"]],
  ["fd", ["fd", "文件描述符"]],
  ["console", ["console", "控制台"]],
  ["qemu timeout", ["qemu timeout", "qemu超时", "qemu 超时"]],
  ["panic", ["panic", "崩溃"]],
  ["#![no_std]", ["#![no_std]", "no_std"]],
  ["#![no_main]", ["#![no_main]", "no_main"]]
].map(([term, aliases]) => Object.freeze({
  term,
  aliases: Object.freeze(aliases)
})));

const RUNTIME_ONLY_PATTERNS = Object.freeze([
  /(?:当前|现在).*(?:哪个|什么).*(?:lab|实验)/i,
  /(?:当前|现在).*(?:分支|branch|commit|工作区|进度|修改状态)/i,
  /(?:当前|现在).*(?:\.rs|\.s|\.ld|代码|实现).*(?:内容|是什么|怎么写)/i,
  /(?:\.rs|\.s|\.ld|代码|实现).*(?:当前|现在).*(?:内容|是什么|怎么写)/i,
  /(?:刚才|最近|上一次).*(?:测试|运行).*(?:结果|状态|输出)/i,
  /(?:当前|现在).*(?:代码|diff|改了什么|修改了什么)/i
]);

const TOPIC_RULES = Object.freeze([
  ["boot", /opensbi|_start|kernel_main|启动|入口|boot|启动栈/iu],
  ["firmware", /opensbi|固件/iu],
  ["privilege", /m-mode|s-mode|u-mode|特权|sstatus|spp|spie/iu],
  ["trap", /trap|异常|中断|stvec|scause|sepc|stval|breakpoint/iu],
  ["address", /地址|页号|页内偏移|floor|ceil|page_offset|physaddr/iu],
  ["allocator", /分配器|alloc|dealloc|回收|复用|double.?free|页帧/iu],
  ["page-table", /页表|sv39|pte|vpn|ppn|map|unmap|translate/iu],
  ["paging", /satp|sfence|分页|地址空间|恒等映射/iu],
  ["task", /任务|task|tcb|taskcontext|内核栈/iu],
  ["scheduler", /调度|scheduler|round.?robin|next_scan|ready|running|exited|yield/iu],
  ["context-switch", /__switch|上下文切换|ra|s0|s11/iu],
  ["user", /用户态|u-mode|usercontext|sret|用户栈/iu],
  ["syscall", /系统调用|syscall|ecall|a0|a7|write|exit/iu],
  ["device", /设备|bytedevice|ramdevice|offset|容量|越界/iu],
  ["filesystem", /文件系统|simplefs|文件描述符|fd|open|read|write|close/iu],
  ["console", /console|控制台|输出/iu],
  ["qemu", /qemu|超时|timeout/iu],
  ["panic", /panic|崩溃/iu],
  ["evidence", /events?|事件|证据|marker/iu],
  ["build", /build|构建|编译/iu],
  ["testing", /测试|stage|expectincomplete|验收/iu]
].map(([topic, pattern]) => Object.freeze({ topic, pattern })));

const MAX_SEMANTIC_ALIAS_CJK_LENGTH = 5;

function semanticSignal(id, weight, aliases) {
  return Object.freeze({
    id,
    weight,
    aliases: Object.freeze(aliases.map((alias) => {
      const normalized = normalizeText(alias);
      const cjkLength = [...normalized].filter((character) => (
        /\p{Script=Han}/u.test(character)
      )).length;
      if (cjkLength > MAX_SEMANTIC_ALIAS_CJK_LENGTH) {
        throw new TypeError("Semantic aliases must remain short domain terms.");
      }
      return Object.freeze({
        normalized,
        compact: compactText(normalized),
        shortPattern: /^[a-z0-9_]{1,3}$/u.test(normalized)
          ? new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(normalized)}(?:$|[^a-z0-9_])`, "u")
          : null
      });
    }))
  });
}

// Signals are domain vocabulary, not query-to-chunk routing rules. The same
// profile is extracted from both a student question and every indexed field,
// so adding a synonym cannot select a particular Lab or knowledge id by itself.
const SEMANTIC_SIGNALS = Object.freeze([
  semanticSignal("output", 0.7, [
    "output", "log", "marker", "输出", "日志", "打印", "消息", "标记"
  ]),
  semanticSignal("no-kernel-output", 2.6, [
    "no-kernel-output", "no-console-output", "marker-missing", "无内核输出",
    "内核无输出", "无日志", "没日志", "没打印", "不响"
  ]),
  semanticSignal("completion", 1.2, [
    "pass", "completed", "finished", "成功标记", "完成标记", "完成提示", "最终标记"
  ]),
  semanticSignal("qemu", 0.9, ["qemu", "虚拟机", "模拟器"]),
  semanticSignal("qemu-timeout", 2.2, [
    "qemu-timeout", "timeout", "超时", "不结束", "未结束", "未收尾", "挂着"
  ]),
  semanticSignal("firmware", 1.3, [
    "opensbi", "firmware", "固件", "平台信息", "固件信息"
  ]),
  semanticSignal("kernel", 0.7, ["kernel", "内核", "学生代码"]),
  semanticSignal("boot", 0.9, ["boot", "启动", "上电", "启动链"]),
  semanticSignal("control-handoff", 1.5, [
    "handoff", "控制权", "交接", "传递", "跳入", "进入内核"
  ]),
  semanticSignal("bare-metal-runtime", 2.0, [
    "bare metal", "bare-metal", "裸机", "no_std", "no_main", "标准库", "main 入口",
    "main入口", "println"
  ]),
  semanticSignal("entry", 0.9, ["entry", "入口", "_start", "kernel_main"]),
  semanticSignal("stack", 0.7, ["stack", "栈", "sp"]),
  semanticSignal("shutdown", 1.9, [
    "shutdown", "system reset", "关机", "退出", "结束进程", "正常结束", "收尾"
  ]),
  semanticSignal("runtime-evidence", 1.0, [
    "runtime evidence", "events", "event", "运行证据", "事件", "证据"
  ]),
  semanticSignal("build-failure", 2.0, [
    "build-failure", "compile-error", "构建失败", "编译失败", "编译错误"
  ]),
  semanticSignal("trap", 0.9, [
    "trap", "handler", "陷阱", "陷入", "异常处理", "处理入口"
  ]),
  semanticSignal("trap-vector", 1.7, [
    "stvec", "trap entry", "异常入口", "陷阱入口", "入口地址", "向量入口"
  ]),
  semanticSignal("program-counter", 1.9, [
    "sepc", "program counter", "instruction pointer", "程序计数器", "指令指针",
    "异常位置", "返回位置", "返回地址"
  ]),
  semanticSignal("trap-cause", 1.7, [
    "scause", "cause register", "cause寄存器", "原因寄存器", "原因码"
  ]),
  semanticSignal("trap-value", 1.3, ["stval", "辅助信息"]),
  semanticSignal("breakpoint", 1.8, [
    "breakpoint", "ebreak", "断点", "断点指令"
  ]),
  semanticSignal("interrupt", 1.4, [
    "interrupt", "中断", "异步", "外部中断", "interrupt bit"
  ]),
  semanticSignal("synchronous-exception", 1.5, [
    "synchronous", "同步异常", "同步故障", "指令同步"
  ]),
  semanticSignal("resume", 0.9, [
    "resume", "恢复执行", "返回原程序", "返回用户", "返回调用方", "恢复后"
  ]),
  semanticSignal("forward-progress", 1.7, [
    "forward progress", "instruction advance", "推进", "前进", "往前走", "越过指令",
    "跳过指令"
  ]),
  semanticSignal("resume-same-instruction", 2.8, [
    "resume-same-instruction", "same instruction", "同一指令", "原指令",
    "原触发点", "同一触发点"
  ]),
  semanticSignal("repetition", 1.3, [
    "repeated", "repeat", "重复", "反复", "再次执行", "又执行", "重新执行", "相同请求"
  ]),
  semanticSignal("repeated-breakpoint", 2.5, [
    "repeated-breakpoint", "breakpoint-loop", "重复断点", "反复断点"
  ]),
  semanticSignal("repeated-ecall", 2.7, [
    "repeated-ecall", "same-log-repeats", "write-loop", "调用重复", "调用循环",
    "服务重复"
  ]),
  semanticSignal("instruction-length", 1.4, [
    "instruction length", "指令长度", "32-bit", "32 位", "压缩指令"
  ]),
  semanticSignal("page", 0.6, ["page", "页面", "页号", "页起点"]),
  semanticSignal("physical-memory", 1.0, [
    "physical", "physaddr", "physpagenum", "物理地址", "物理页", "物理内存"
  ]),
  semanticSignal("virtual-memory", 1.0, [
    "virtual", "virtaddr", "virtpagenum", "虚拟地址", "虚拟页", "虚拟内存"
  ]),
  semanticSignal("page-offset", 1.8, [
    "page_offset", "page offset", "页内偏移", "页内位置", "低 12 位", "低12位"
  ]),
  semanticSignal("alignment", 1.3, [
    "alignment", "aligned", "对齐", "页边界", "整数倍", "整页地址"
  ]),
  semanticSignal("round-up", 1.5, [
    "ceil", "round up", "向上取整", "上取整"
  ]),
  semanticSignal("round-down", 1.3, ["floor", "round down", "向下取整", "下取整"]),
  semanticSignal("aligned-ceil-error", 2.5, [
    "aligned-ceil-error", "ceil多一页", "对齐多页", "对齐前进"
  ]),
  semanticSignal("allocator", 1.0, [
    "allocator", "alloc", "分配器", "申请内存", "分配内存", "发页"
  ]),
  semanticSignal("frame", 1.1, ["frame", "页帧", "内存帧", "物理帧"]),
  semanticSignal("same-frame-returned", 2.5, [
    "same-frame-returned", "same frame", "相同页号", "同一页号", "相同编号"
  ]),
  semanticSignal("allocator-exhausted", 1.8, [
    "allocator-exhausted", "out of memory", "分配耗尽", "没有空闲页"
  ]),
  semanticSignal("half-open-range", 2.1, [
    "half-open range", "半开区间", "[start,end)", "[start, end)", "end不包含",
    "end 不包含", "只做上界"
  ]),
  semanticSignal("recycle", 1.4, [
    "dealloc", "recycle", "free", "释放", "回收", "复用"
  ]),
  semanticSignal("double-free", 2.6, [
    "double-free", "double free", "重复释放", "释放两次", "回收两次"
  ]),
  semanticSignal("state-consistency", 1.8, [
    "state consistency", "state corruption", "状态一致", "状态污染", "不变量",
    "失败后状态", "顺序改变"
  ]),
  semanticSignal("kernel-memory-boundary", 2.0, [
    "kernel_end", "ekernel", "内核末尾", "镜像末尾", "内存上界", "覆盖内核"
  ]),
  semanticSignal("page-table", 1.0, ["page table", "page-table", "页表", "pte"]),
  semanticSignal("vpn-index", 1.8, [
    "vpn index", "vpn索引", "indexes", "l0", "l1", "l2", "九位索引", "9 位索引"
  ]),
  semanticSignal("page-table-walk", 1.7, [
    "page-table walk", "page table walk", "三级 walk", "三级walk", "查三级表",
    "页表遍历"
  ]),
  semanticSignal("leaf-pte", 1.6, [
    "leaf pte", "non-leaf pte", "叶子 pte", "叶子pte", "中间级 pte", "最终映射"
  ]),
  semanticSignal("intermediate-table", 1.8, [
    "intermediate table", "intermediate storage", "中间页表", "中间层", "中间表存储"
  ]),
  semanticSignal("mapping", 1.0, ["mapping", "map", "映射", "地址空间"]),
  semanticSignal("translation", 1.5, [
    "translate", "translation", "地址翻译", "地址转换", "换算结果"
  ]),
  semanticSignal("offset-lost", 2.7, [
    "offset-lost", "偏移丢失", "偏移清零", "位置丢失", "低位丢失"
  ]),
  semanticSignal("unmap", 1.5, ["unmap", "解除映射", "取消映射", "notmapped"]),
  semanticSignal("identity-mapping", 1.7, [
    "identity mapping", "恒等映射", "va equals pa", "va等于pa"
  ]),
  semanticSignal("paging-activation", 1.8, [
    "satp", "sfence.vma", "paging", "分页激活", "启用分页", "启用转换", "写入satp"
  ]),
  semanticSignal("post-activation-failure", 2.5, [
    "no-post-activation-output", "page-fault-after-satp", "切换无输出", "激活无输出",
    "satp无输出"
  ]),
  semanticSignal("permission", 1.0, ["permission", "权限", "rwx", "u/r/w/x"]),
  semanticSignal("task", 0.7, ["task", "任务", "tcb"]),
  semanticSignal("scheduler", 1.0, [
    "scheduler", "schedule", "调度", "选择任务", "选任务", "运行机会"
  ]),
  semanticSignal("round-robin", 1.8, [
    "round-robin", "round robin", "轮转", "next_scan", "从零扫描", "任务0"
  ]),
  semanticSignal("starvation", 2.2, [
    "starvation", "任务饥饿", "饿住", "饿死", "运行机会", "任务不运行"
  ]),
  semanticSignal("yield", 1.7, [
    "yield", "主动让出", "让出处理器", "交出处理器", "放弃 cpu",
    "放弃cpu"
  ]),
  semanticSignal("task-state", 1.3, [
    "ready", "running", "exited", "任务状态", "调度状态"
  ]),
  semanticSignal("exited-rescheduled", 2.5, [
    "exited-rescheduled", "exited-task-rescheduled", "结束再执行", "退出再运行",
    "退出后再选"
  ]),
  semanticSignal("context-switch", 1.4, [
    "context switch", "context-switch", "__switch", "上下文切换", "切换任务",
    "切换对象", "任务交接"
  ]),
  semanticSignal("saved-registers", 1.6, [
    "callee-saved", "saved register", "保存寄存器", "保存现场", "恢复现场",
    "s0..s11", "s0 到 s11", "临时寄存器"
  ]),
  semanticSignal("context-layout", 2.0, [
    "context-layout", "taskcontext layout", "结构布局", "字段顺序", "汇编偏移",
    "偏移不一致"
  ]),
  semanticSignal("task-never-yields", 2.4, [
    "task-never-yields", "infinite loop", "死循环", "一直自旋", "不主动让出",
    "不 yield", "不yield"
  ]),
  semanticSignal("user-mode", 1.2, [
    "u-mode", "user mode", "用户态", "用户程序", "降权"
  ]),
  semanticSignal("sret", 1.4, ["sret", "特权级返回", "返回用户态"]),
  semanticSignal("syscall", 1.3, [
    "syscall", "system call", "系统调用", "内核服务", "服务请求", "调用请求"
  ]),
  semanticSignal("ecall", 1.7, ["ecall", "用户陷入", "内核服务"]),
  semanticSignal("syscall-abi", 2.0, [
    "register abi", "syscall abi", "系统调用abi", "寄存器约定",
    "调用号", "请求编号", "请求号", "服务编号", "服务号"
  ]),
  semanticSignal("arguments", 1.0, ["arguments", "args", "参数", "a0..a5", "六个参数"]),
  semanticSignal("return-value", 1.1, [
    "return value", "返回值", "写回a0", "写回 a0"
  ]),
  semanticSignal("page-fault", 2.2, [
    "page fault", "page-fault", "页错误", "页故障", "取指故障", "访问故障"
  ]),
  semanticSignal("user-memory", 1.5, [
    "user memory", "用户页", "用户栈映射", "用户代码页", "用户内存", "pte u"
  ]),
  semanticSignal("device", 1.0, [
    "device", "bytedevice", "设备", "驱动"
  ]),
  semanticSignal("memory-device", 1.5, [
    "ramdevice", "ram device", "ram设备", "ram 设备", "内存设备", "内存盘"
  ]),
  semanticSignal("device-capacity", 1.8, [
    "capacity", "device capacity", "设备容量", "内存盘容量", "固定容量", "容量不足",
    "容量耗尽", "nospace", "no space"
  ]),
  semanticSignal("range-check", 1.5, [
    "outofbounds", "out-of-bounds", "越界", "范围检查", "容量边界"
  ]),
  semanticSignal("range-overflow", 2.3, [
    "range-overflow", "arithmetic overflow", "整数溢出", "整数回绕", "计算终点",
    "终点溢出"
  ]),
  semanticSignal("read", 0.8, ["read", "读取", "读回", "读出"]),
  semanticSignal("write", 0.8, ["write", "写入", "写过"]),
  semanticSignal("copy-direction", 1.9, [
    "copy-direction", "copy direction", "复制方向", "拷贝方向", "数据源", "目标切片"
  ]),
  semanticSignal("io-roundtrip-mismatch", 2.4, [
    "round-trip-mismatch", "read-after-write-mismatch", "write-read-mismatch",
    "写后读回", "读回不一致", "零数据"
  ]),
  semanticSignal("filesystem", 1.0, [
    "filesystem", "simplefs", "文件系统", "文件 io", "文件io"
  ]),
  semanticSignal("file-descriptor", 1.7, [
    "file descriptor", "fd", "文件描述符", "句柄"
  ]),
  semanticSignal("descriptor-slot", 1.5, [
    "fd index", "slot", "槽位", "数组下标", "内部下标", "句柄表"
  ]),
  semanticSignal("fd-table-full", 2.2, [
    "fd-table-full", "toomanyopenfiles", "too-many-open-files", "文件表满", "句柄表满",
    "句柄耗尽", "槽位耗尽", "槽位已满", "没有空槽"
  ]),
  semanticSignal("invalid-fd", 2.2, [
    "invalid-fd", "invalidfiledescriptor", "closed-fd", "无效 fd", "无效fd",
    "旧句柄", "句柄释放", "描述符释放",
    "关闭的 fd", "关闭的fd"
  ]),
  semanticSignal("close", 1.1, ["close", "关闭", "关掉", "释放句柄"]),
  semanticSignal("reopen", 1.6, ["reopen", "重新 open", "重新open", "再打开", "重新打开"]),
  semanticSignal("file-offset", 1.7, [
    "file offset", "文件偏移", "读写位置", "读取位置", "文件游标", "当前位置"
  ]),
  semanticSignal("persistent-bytes", 1.5, [
    "persistent bytes", "content-lost-on-close", "数据还在", "内容保留", "不会清空",
    "持久内容"
  ]),
  semanticSignal("console", 1.1, ["console", "控制台", "终端", "标准输出"]),
  semanticSignal("io-routing", 1.9, [
    "routing", "路由", "分流", "区分 console", "区分console"
  ])
]);

const CJK_STOP_TOKENS = Object.freeze(new Set([
  "一个", "什么", "是什", "是什么", "为什", "为什么", "怎么", "么办", "怎么办",
  "怎样", "如何", "为何", "哪里", "哪个", "哪些", "应该",
  "以后", "然后", "已经", "当前", "分别", "是否", "自己", "这个", "那个",
  "不能", "可以", "需要", "仍然", "一样", "发生", "完成", "使用", "进行"
]));
const SEMANTIC_SIGNAL_WEIGHTS = Object.freeze(Object.fromEntries(
  SEMANTIC_SIGNALS.map((signal) => [signal.id, signal.weight])
));
const DOMAIN_GATING_SIGNALS = Object.freeze(new Set([
  "bare-metal-runtime", "firmware", "breakpoint", "allocator", "frame",
  "page-table", "vpn-index", "page-table-walk", "paging-activation",
  "round-robin", "context-switch", "user-mode", "syscall", "memory-device",
  "filesystem", "file-descriptor"
]));

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeString(value, maxLength = 1_000) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !FORBIDDEN_TEXT_CHARACTERS.test(value);
}

function normalizeText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[，。！？；：、（）【】《》“”‘’]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/gu, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function includesNormalizedPhrase(text, phrase) {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  if (/^[a-z0-9_]{1,3}$/u.test(normalizedPhrase)) {
    return new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(normalizedPhrase)}(?:$|[^a-z0-9_])`, "u")
      .test(normalizedText);
  }
  return normalizedText.includes(normalizedPhrase)
    || compactText(normalizedText).includes(compactText(normalizedPhrase));
}

function extractSemanticSignals(value) {
  const text = normalizeText(value);
  const compact = compactText(text);
  const signals = new Set();
  for (const signal of SEMANTIC_SIGNALS) {
    if (signal.aliases.some((alias) => {
      if (alias.shortPattern !== null) return alias.shortPattern.test(text);
      return text.includes(alias.normalized) || compact.includes(alias.compact);
    })) {
      signals.add(signal.id);
    }
  }
  return signals;
}

function extractLexicalTokens(value) {
  const text = normalizeText(value);
  const tokens = new Set();
  const asciiTerms = text.match(/[a-z#!_][a-z0-9#!_.-]{1,63}/gu) || [];
  for (const term of asciiTerms) {
    tokens.add(term);
    for (const part of term.split(/[._-]+/gu)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  const runs = text.match(/[\p{Script=Han}]+/gu) || [];
  for (const run of runs) {
    if (run.length >= 2 && run.length <= 8 && !CJK_STOP_TOKENS.has(run)) {
      tokens.add(run);
    }
    for (const width of [2, 3, 4]) {
      for (let index = 0; index + width <= run.length; index += 1) {
        const token = run.slice(index, index + width);
        if (!CJK_STOP_TOKENS.has(token)) tokens.add(token);
      }
    }
  }
  return tokens;
}

function parseStage(value) {
  const text = normalizeText(value);
  const numeric = text.match(/(?:stage|task|(?<![a-z0-9_])t|阶段|任务|第)\s*[-#]?\s*([123])(?:\s*(?:阶段|关|项|任务))?/iu);
  if (numeric) return Number(numeric[1]);
  const chinese = text.match(/(?:第|任务)\s*([一二三])\s*(?:阶段|关|项|任务)?/u);
  if (!chinese) return null;
  return Object.freeze({ 一: 1, 二: 2, 三: 3 })[chinese[1]];
}

function inferIntent(value) {
  const query = normalizeText(value);
  const overview = /(?:实验|lab\s*[1-7])?.*(?:目标|范围|概览|前置知识|学什么|做什么)|overview/iu.test(query);
  const navigation = /(?:关键文件|哪个文件|哪些文件|什么文件|代码位置|todo位置|到哪里|去哪里|在哪.*(?:实现|检查|修改))/iu.test(query)
    || (/(?:文件|代码|源码|模块|位置)/iu.test(query)
      && /(?:检查|查看|修改|实现|定位|哪些|哪个|什么|哪里|哪儿)/iu.test(query));
  const testing = /(?:stage|任务[一二三123]|第[一二三123]阶段|marker|标记|验收|测试|expectincomplete)/iu.test(query);
  const diagnosis = /(?:失败|错误|不对|故障|异常(?:了|发生|出现|退出|崩溃|错误)|崩溃|超时|卡住|卡死|挂着|不响|无声|没有|没|未|丢|重复|反复|一直|仍|又|全[^，。！？;]{0,4}零|都是零|被拒绝|越界|饿|无效|不结束|不到达|不推进|不前进|跑飞|对不上|改变了)/iu.test(query);
  const workflow = /(?:流程|链路|路径|经过|中间.*环节|中间.*阶段|如何传递|怎样传递|控制权|从.+到|按什么顺序|顺序协作|完整.*过程|(?:怎样|如何).*(?:穿过|经过|进入).*(?:返回|回到|恢复))/iu.test(query);
  let primary = "concept";
  if (overview) primary = "overview";
  else if (navigation) primary = "navigation";
  else if (diagnosis) primary = "diagnosis";
  else if (testing) primary = "testing";
  else if (workflow) primary = "workflow";
  return Object.freeze({
    primary,
    overview,
    navigation,
    testing,
    diagnosis,
    workflow
  });
}

function isRuntimeOnlyQuery(value) {
  const query = normalizeText(value);
  const explicitCourseClause = /(?:原理|机制|概念|区别|作用|一般流程|正常流程|如何工作|怎样工作|是什么意思)/iu.test(query);
  if (explicitCourseClause) return false;
  const runtimeScope = /(?:当前|现在|目前|最近|上一次|本轮|刚才)/iu.test(query);
  const runtimeFact = /(?:[a-z0-9_.-]+\.(?:rs|s|ld)|代码|实现|值|内容|结果|输出|日志|事件|运行|测试|状态|分支|branch|commit|工作区|进度|修改|根因|错在哪|哪里错误|为什么失败|哪个\s*lab|什么\s*lab)/iu.test(query);
  return (runtimeScope && runtimeFact)
    || RUNTIME_ONLY_PATTERNS.some((pattern) => pattern.test(query));
}

function validateStringArray(value, field, maximumItems = 32) {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximumItems
    || Object.keys(value).length !== value.length
    || value.some((item) => !safeString(item, 300))) {
    throw new TypeError(`Invalid knowledge ${field}.`);
  }
  const normalized = value.map((item) => item.trim());
  if (new Set(normalized.map(normalizeText)).size !== normalized.length) {
    throw new TypeError(`Duplicate knowledge ${field}.`);
  }
  return Object.freeze(normalized);
}

function validateChunk(value, expectedLab) {
  const fields = [
    "concepts", "content", "files", "hintLevel", "id", "keywords", "lab",
    "source", "stage", "symptoms", "title", "topic", "type"
  ];
  const idPattern = new RegExp(`^${expectedLab}-[a-z0-9-]+$`);
  if (!isPlainObject(value)
    || Object.keys(value).sort().join("|") !== fields.sort().join("|")
    || !safeString(value.id, 120)
    || !idPattern.test(value.id)
    || value.lab !== expectedLab
    || !Number.isInteger(value.stage)
    || value.stage < 0
    || value.stage > 3
    || !safeString(value.type, 40)
    || !safeString(value.topic, 80)
    || !Number.isInteger(value.hintLevel)
    || value.hintLevel < 1
    || value.hintLevel > MAX_STUDENT_HINT_LEVEL
    || !safeString(value.source, 1_000)
    || !safeString(value.title, 300)
    || !safeString(value.content, MAX_CHUNK_CONTENT_LENGTH)
    || SOLUTION_SOURCE_PATTERN.test(value.source)
    || SOLUTION_SOURCE_PATTERN.test(value.content)
    || CODE_BLOCK_PATTERN.test(value.content)) {
    throw new TypeError(`Invalid or unsafe ${expectedLab} knowledge chunk.`);
  }
  const concepts = validateStringArray(value.concepts, "concepts");
  const files = validateStringArray(value.files, "files");
  const symptoms = validateStringArray(value.symptoms, "symptoms");
  const keywords = validateStringArray(value.keywords, "keywords");
  if (files.some((file) => SOLUTION_SOURCE_PATTERN.test(file))) {
    throw new TypeError("Solution and teacher-only files cannot be indexed.");
  }
  return Object.freeze({
    id: value.id,
    lab: value.lab,
    stage: value.stage,
    type: value.type,
    topic: value.topic,
    concepts,
    files,
    symptoms,
    hintLevel: value.hintLevel,
    source: value.source,
    keywords,
    title: value.title,
    content: value.content
  });
}

function validateChunks(value, expectedLab) {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < 1
    || value.length > MAX_CHUNKS_PER_LAB
    || Object.keys(value).length !== value.length) {
    throw new TypeError(`Invalid ${expectedLab} knowledge chunks.`);
  }
  const ids = new Set();
  return Object.freeze(value.map((chunk) => {
    const validated = validateChunk(chunk, expectedLab);
    if (ids.has(validated.id)) throw new TypeError(`Duplicate ${expectedLab} knowledge chunk id.`);
    ids.add(validated.id);
    return validated;
  }));
}

function validateKnowledgeBase(value, expectedLab) {
  if (!isPlainObject(value)
    || Object.keys(value).sort().join("|") !== "chunks|lab|schemaVersion"
    || value.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION
    || value.lab !== expectedLab) {
    throw new TypeError(`Invalid ${expectedLab} knowledge base metadata.`);
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    lab: value.lab,
    chunks: validateChunks(value.chunks, expectedLab)
  });
}

function loadKnowledgeBase(lab = "lab1") {
  if (!SUPPORTED_LABS.includes(lab)) throw new TypeError("Unsupported knowledge Lab.");
  let source;
  try {
    source = fs.readFileSync(KNOWLEDGE_PATHS[lab], "utf8");
  } catch (_) {
    throw new TypeError(`The ${lab} knowledge base could not be loaded.`);
  }
  const normalizedSource = source.replace(/\r\n/gu, "\n");
  const digest = crypto.createHash("sha256").update(normalizedSource, "utf8").digest("hex");
  if (digest !== KNOWLEDGE_DIGESTS[lab]) {
    throw new TypeError(`The ${lab} knowledge base failed its integrity check.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (_) {
    throw new TypeError(`The ${lab} knowledge base could not be loaded.`);
  }
  return validateKnowledgeBase(parsed, lab);
}

function loadKnowledgeCatalog() {
  return Object.freeze(Object.fromEntries(SUPPORTED_LABS.map((lab) => [
    lab,
    loadKnowledgeBase(lab)
  ])));
}

function validateKnowledgeCatalog(value) {
  if (!isPlainObject(value)) throw new TypeError("Knowledge catalog must be a plain object.");
  const labs = Object.keys(value);
  if (labs.length < 1 || labs.some((lab) => !SUPPORTED_LABS.includes(lab))) {
    throw new TypeError("Invalid knowledge catalog Labs.");
  }
  return Object.freeze(Object.fromEntries(labs.map((lab) => [
    lab,
    validateKnowledgeBase(value[lab], lab)
  ])));
}

function inferredSymptoms(query) {
  const symptoms = new Set();
  const hasFirmware = /opensbi|固件|平台信息/iu.test(query);
  const hasKernel = /kernel|内核|学生代码/iu.test(query);
  const missingOutput = /(?:没有|没|无|不见|不响|无声).*(?:输出|日志|打印|标记|消息)|(?:输出|日志|打印|标记|消息).*(?:没有|没|无|不见)/iu.test(query);
  if ((hasFirmware && (missingOutput || hasKernel))
    || /只.*(?:opensbi|固件)|停在.*(?:opensbi|固件)/iu.test(query)) {
    symptoms.add("opensbi-only");
    symptoms.add("no-kernel-output");
  }
  if (/(?:qemu|虚拟机|模拟器).*(?:timeout|超时|不结束|没结束|未结束|挂着|(?:没有|没|未).{0,4}收尾)|(?:timeout|超时).*(?:qemu|虚拟机|模拟器)/iu.test(query)) {
    symptoms.add("qemu-timeout");
  }
  if (/(?:pass|成功|完成|最终).*(?:不结束|没结束|未结束|挂着|超时|(?:没有|没|未).{0,4}收尾)|(?:不结束|没结束|未结束|挂着|超时|(?:没有|没|未).{0,4}收尾).*(?:pass|成功|完成|最终)/iu.test(query)) {
    symptoms.add("pass-before-timeout");
    symptoms.add("no-shutdown");
    symptoms.add("qemu-timeout");
  }
  if (/(?:events?|事件).*(?:为空|是空|没有|0)|returnedcount\s*=\s*0|totalmatched\s*=\s*0/iu.test(query)) {
    symptoms.add("empty-events");
    symptoms.add("evidence-insufficient");
  }
  if (/panic|崩溃/iu.test(query)) symptoms.add("panic");
  if (/build.*(?:fail|失败)|构建失败|编译错误/iu.test(query)) symptoms.add("build-failure");
  if (/qemu.*(?:无法|不能|失败).*(?:启动|运行)/iu.test(query)) symptoms.add("qemu-start-failure");
  if (/没有.*(?:kernel|内核).*输出|(?:kernel|内核).*(?:没有|无).*输出/iu.test(query)) {
    symptoms.add("no-kernel-output");
  }
  const hasTrapContext = /trap|陷阱|陷入|异常处理|handler|恢复/iu.test(query);
  const hasProgramCounter = /sepc|program counter|instruction pointer|程序计数器|指令指针|返回位置|返回地址/iu.test(query);
  if (/(?:trap|陷阱|异常).*(?:入口|起点).*(?:csr|寄存器)|(?:csr|寄存器).*(?:trap|陷阱|异常).*(?:入口|起点)/iu.test(query)) {
    symptoms.add("trap-vector");
  }
  if (/(?:恢复|返回).{0,4}(?:执行)?(?:点|位置)|(?:执行点|返回点).*(?:csr|寄存器)/iu.test(query)) {
    symptoms.add("program-counter");
  }
  if (/(?:正在执行|当前指令|同步).*(?:引发|造成|触发|故障|异常)/iu.test(query)) {
    symptoms.add("synchronous-exception");
  }
  if (/(?:外设|外部).*(?:请求|打断|中断)|(?:异步).*(?:请求|故障|中断)/iu.test(query)) {
    symptoms.add("interrupt");
  }
  const noProgress = /(?:没|没有|未|不).*(?:推进|前进|往前|更新|越过)|(?:推进|前进|往前|更新).*(?:没|没有|未|不)/iu.test(query);
  const sameInstruction = /(?:同一|相同|原来|原来的).*(?:指令|触发点|调用|请求|服务|breakpoint|ebreak|ecall)|(?:指令|触发点|调用|请求|服务|breakpoint|ebreak|ecall).*(?:重复|反复|再次|又|重新|相同)/iu.test(query);
  const repeatedExecution = /重复|反复|再次执行|又执行|重新执行|又踩中|又回到|再次发出|相同.*(?:请求|调用|服务)/iu.test(query);
  const resumeSameInstruction = (hasProgramCounter && noProgress)
    || (hasTrapContext && sameInstruction && repeatedExecution)
    || (sameInstruction && repeatedExecution);
  if (resumeSameInstruction) {
    symptoms.add("resume-same-instruction");
    symptoms.add("trap-loop");
  }
  if (/重复.*(?:trap|异常)|trap.*(?:循环|反复)|陷入.*(?:循环|反复)/iu.test(query)) {
    symptoms.add("trap-loop");
  }
  const breakpointContext = /breakpoint|ebreak|断点/iu.test(query);
  if (breakpointContext && (resumeSameInstruction || repeatedExecution)) {
    symptoms.add("repeated-breakpoint");
  }
  const syscallContext = /ecall|syscall|system call|系统调用|内核服务|服务请求|write|exit|用户.*(?:请求|服务)|handler.*请求/iu.test(query);
  if (syscallContext && (resumeSameInstruction || repeatedExecution || /一直/iu.test(query))) {
    symptoms.add("repeated-ecall");
    symptoms.add("same-log-repeats");
  }
  if (/(?:breakpoint|断点).*(?:未识别|没有识别|not decoded|失败)/iu.test(query)) {
    symptoms.add("breakpoint-not-decoded");
    symptoms.add("stage2-failure");
  }
  if (/off.?by.?one|差一页|多一页|少一页|边界.*错误/iu.test(query)) symptoms.add("off-by-one");
  if (/(?:ceil|向上取整|上取整).*(?:页边界|对齐|整数倍).*(?:下一页|前进|多一页)|(?:页边界|对齐|整数倍).*(?:ceil|向上取整|上取整).*(?:下一页|前进|多一页)/iu.test(query)) {
    symptoms.add("aligned-ceil-error");
    symptoms.add("off-by-one");
  }
  if (/double.?free|重复释放|释放.*两次|回收.*两次|同一.*(?:页|帧).*(?:释放|回收).*(?:两次|再次)/iu.test(query)) {
    symptoms.add("double-free");
  }
  if (/(?:allocator|分配器|页帧|物理页|内存帧).*(?:耗尽|out of memory|none|没有空闲)|(?:耗尽|out of memory).*(?:allocator|分配器|页帧|物理页|内存帧)/iu.test(query)) {
    symptoms.add("allocator-exhausted");
  }
  if (/(?:连续|两次|多次).*(?:申请|分配|alloc).*(?:相同|同一).*(?:页|帧|编号)|(?:申请|分配|alloc).*(?:总|一直).*(?:相同|同一)/iu.test(query)) {
    symptoms.add("same-frame-returned");
  }
  if (/(?:allocator|alloc|分配器|发页|分配).*(?:边界|上界|最后|end).*(?:返回|发出|分配|给出)|(?:边界|上界|最后|end).*(?:编号|页|帧).*(?:返回|发出|分配)/iu.test(query)) {
    symptoms.add("end-frame-allocated");
    symptoms.add("range-error");
  }
  if (/(?:释放|回收|dealloc).*(?:拒绝|失败).*(?:状态|顺序).*(?:变|改变)|(?:非法|错误).*(?:释放|回收).*(?:污染|改变)/iu.test(query)) {
    symptoms.add("state-consistency");
  }
  if (/页表.*(?:找不到|失败)|translate.*(?:none|失败)|映射.*失败/iu.test(query)) {
    symptoms.add("translation-failure");
  }
  if (/(?:translate|翻译|换算|地址转换).*(?:偏移|页内|低\s*(?:12|十?二)\s*位).*(?:丢|清零|抹掉)|(?:偏移|页内|低\s*(?:12|十?二)\s*位).*(?:丢|清零|抹掉)/iu.test(query)) {
    symptoms.add("offset-lost");
  }
  if (/(?:satp|分页|地址转换).*(?:没有|没|不再).*(?:输出|日志|打印|消息)|(?:写|启用|打开).*(?:satp|分页|地址转换).*(?:卡|挂|停止)/iu.test(query)) {
    symptoms.add("no-post-activation-output");
    symptoms.add("page-fault-after-satp");
  }
  if (/调度.*(?:卡住|不动)|任务.*(?:不切换|不轮转)|只有一个任务|(?:后面|其他).*任务.*(?:饿|不运行|没机会)/iu.test(query)) {
    symptoms.add("scheduler-stall");
  }
  if (/(?:每次|总是|一直).*(?:任务|编号).*(?:0|零)|(?:后面|其他).*任务.*(?:饿|没机会|不运行)/iu.test(query)) {
    symptoms.add("starvation");
    symptoms.add("always-task-zero");
  }
  if (/顺序.*(?:错误|不对|改变)|任务.*乱序/iu.test(query)) symptoms.add("wrong-task-order");
  if (/(?:退出|结束|完成).*(?:又|仍然|再次).*(?:调度|运行|打印|执行|选)|(?:已经结束|已退出).*(?:任务).*(?:又|再次|仍)/iu.test(query)) {
    symptoms.add("exited-rescheduled");
    symptoms.add("exited-task-rescheduled");
  }
  if (/(?:死循环|一直自旋|无限循环).*(?:不|没有).*(?:yield|让出|交出)|(?:不|没有).*(?:yield|让出|交出).*(?:其他|后面).*任务/iu.test(query)) {
    symptoms.add("task-never-yields");
    symptoms.add("other-tasks-never-run");
  }
  if (/(?:汇编|assembly).*(?:偏移|布局|顺序).*(?:rust|结构|字段).*(?:不一致|对不上)|(?:rust|结构).*(?:汇编).*(?:对不上|不一致)/iu.test(query)) {
    symptoms.add("context-layout");
    symptoms.add("register-corruption");
  }
  if (/进不了.*用户态|sret.*(?:失败|没返回)|u-mode.*(?:失败|没有)/iu.test(query)) {
    symptoms.add("user-entry-failure");
  }
  if (/(?:sret|用户态|u-mode|降权).*(?:立刻|刚|马上).*(?:取指|load|store|页).*(?:故障|错误|fault)/iu.test(query)) {
    symptoms.add("sret-then-fault");
    symptoms.add("instruction-page-fault");
  }
  if (/未知.*(?:syscall|系统调用)|unimplemented.*syscall/iu.test(query)) symptoms.add("unknown-syscall");
  if (/无效.*fd|invalid.*fd|重复.*close|(?:close|关闭|关掉).*(?:旧|原).*(?:fd|句柄).*(?:还能|继续).*(?:读|写)/iu.test(query)) {
    symptoms.add("invalid-fd");
    symptoms.add("closed-fd-readable");
  }
  if (/(?:fd|句柄|描述符|打开槽|文件表).*(?:耗尽|占满|满了|没有空|无空槽)/iu.test(query)) {
    symptoms.add("fd-table-full");
    symptoms.add("too-many-open-files");
  }
  if (/(?:偏移|位置).*(?:不变|没有前进|没前进)|offset.*(?:不变|错误)/iu.test(query)) symptoms.add("offset-not-advanced");
  if (/写入.*读回.*(?:不同|失败|全[^，。！？;]{0,4}零|都是零)|写过.*读.*(?:全[^，。！？;]{0,4}零|都是零|不一致)|read.*write.*(?:mismatch|不同)/iu.test(query)) {
    symptoms.add("round-trip-mismatch");
    symptoms.add("read-after-write-mismatch");
  }
  if (/(?:设备|容量|offset|终点|结束位置).*(?:溢出|回绕|overflow)|(?:溢出|回绕).*(?:范围|容量|设备)/iu.test(query)) {
    symptoms.add("range-overflow");
    symptoms.add("out-of-bounds");
  }
  if (/(?:设备|内存盘|ramdevice).*(?:容量).*(?:耗尽|不足|已满|继续写)|(?:容量).*(?:耗尽|不足|已满).*(?:写入|设备|内存盘)/iu.test(query)) {
    symptoms.add("out-of-bounds");
    symptoms.add("device-capacity");
  }
  return symptoms;
}

function inferredTopics(query) {
  const topics = new Set();
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(query)) topics.add(rule.topic);
  }
  return topics;
}

function addAll(target, values) {
  for (const value of values) target.add(value);
  return target;
}

function analyzeQuery(lookup) {
  const normalized = normalizeText(lookup.query);
  const symptoms = inferredSymptoms(normalized);
  for (const symptom of lookup.symptoms) symptoms.add(normalizeText(symptom));
  const signals = extractSemanticSignals(normalized);
  for (const symptom of symptoms) {
    if (Object.hasOwn(SEMANTIC_SIGNAL_WEIGHTS, symptom)) signals.add(symptom);
    addAll(signals, extractSemanticSignals(symptom));
  }
  const topics = inferredTopics(normalized);
  if (lookup.topic) topics.add(lookup.topic);
  return Object.freeze({
    normalized,
    compact: compactText(normalized),
    intent: inferIntent(normalized),
    stage: parseStage(normalized),
    symptoms: Object.freeze(symptoms),
    signals: Object.freeze(signals),
    topics: Object.freeze(topics),
    tokens: Object.freeze(extractLexicalTokens(normalized)),
    runtimeOnly: isRuntimeOnlyQuery(normalized)
  });
}

function joinedField(value) {
  return Array.isArray(value) ? value.join(" ") : String(value);
}

function profileChunk(chunk) {
  const normalized = Object.freeze({
    concepts: Object.freeze(chunk.concepts.map(normalizeText)),
    keywords: Object.freeze(chunk.keywords.map(normalizeText)),
    symptoms: Object.freeze(chunk.symptoms.map(normalizeText)),
    files: Object.freeze(chunk.files.map(normalizeText)),
    title: normalizeText(chunk.title),
    topic: normalizeText(chunk.topic),
    content: normalizeText(chunk.content)
  });
  const semanticText = [
    normalized.concepts.join(" "),
    normalized.keywords.join(" "),
    normalized.symptoms.join(" "),
    normalized.title,
    normalized.topic,
    normalized.content
  ].join(" ");
  const inferred = inferredSymptoms(semanticText);
  const symptomSet = new Set(normalized.symptoms);
  addAll(symptomSet, inferred);
  const signals = {
    concepts: extractSemanticSignals(joinedField(normalized.concepts)),
    keywords: extractSemanticSignals(joinedField(normalized.keywords)),
    symptoms: extractSemanticSignals([...symptomSet].join(" ")),
    files: extractSemanticSignals(joinedField(normalized.files)),
    title: extractSemanticSignals(normalized.title),
    topic: extractSemanticSignals(normalized.topic),
    content: extractSemanticSignals(normalized.content)
  };
  for (const symptom of symptomSet) {
    if (Object.hasOwn(SEMANTIC_SIGNAL_WEIGHTS, symptom)) signals.symptoms.add(symptom);
  }
  const tokens = {
    concepts: extractLexicalTokens(joinedField(normalized.concepts)),
    keywords: extractLexicalTokens(joinedField(normalized.keywords)),
    symptoms: extractLexicalTokens([...symptomSet].join(" ")),
    files: extractLexicalTokens(joinedField(normalized.files)),
    title: extractLexicalTokens(normalized.title),
    topic: extractLexicalTokens(normalized.topic),
    content: extractLexicalTokens(normalized.content)
  };
  const allTokens = new Set();
  for (const fieldTokens of Object.values(tokens)) addAll(allTokens, fieldTokens);
  const allSignals = new Set();
  for (const fieldSignals of Object.values(signals)) addAll(allSignals, fieldSignals);
  return Object.freeze({
    chunk,
    normalized,
    symptoms: Object.freeze(symptomSet),
    signals: Object.freeze(Object.fromEntries(Object.entries(signals).map(([field, values]) => [
      field, Object.freeze(values)
    ]))),
    tokens: Object.freeze(Object.fromEntries(Object.entries(tokens).map(([field, values]) => [
      field, Object.freeze(values)
    ]))),
    allTokens: Object.freeze(allTokens),
    allSignals: Object.freeze(allSignals)
  });
}

function isNavigationChunk(chunk) {
  return chunk.topic === "files"
    || chunk.id.endsWith("-key-files")
    || chunk.symptoms.includes("locate-code");
}

function createLabIndex(chunks) {
  const profiles = Object.freeze(chunks.map(profileChunk));
  const signals = new Set();
  const documentFrequency = new Map();
  for (const profile of profiles) {
    addAll(signals, profile.allSignals);
    for (const token of profile.allTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [token, count] of documentFrequency) {
    idf.set(token, Math.log((profiles.length + 1) / (count + 1)) + 1);
  }
  return Object.freeze({
    profiles,
    idf,
    signals: Object.freeze(signals),
    hasNavigation: profiles.some((profile) => isNavigationChunk(profile.chunk))
  });
}

function hasUnsupportedDomain(query, index) {
  const requestedDomains = [...query.signals].filter((signal) => (
    DOMAIN_GATING_SIGNALS.has(signal)
  ));
  return requestedDomains.length > 0
    && requestedDomains.every((signal) => !index.signals.has(signal));
}

function scoreSignalMatches(querySignals, fieldSignals, coefficient, cap) {
  let value = 0;
  for (const signal of querySignals) {
    if (fieldSignals.has(signal)) {
      value += (SEMANTIC_SIGNAL_WEIGHTS[signal] || 1) * coefficient;
    }
  }
  return Math.min(value, cap);
}

function scoreTokenMatches(queryTokens, fieldTokens, idf, coefficient, cap) {
  let value = 0;
  for (const token of queryTokens) {
    if (!fieldTokens.has(token) || !idf.has(token)) continue;
    value += idf.get(token) * coefficient;
  }
  return Math.min(value, cap);
}

function fieldContainsAnyAlias(values, aliases) {
  const fields = Array.isArray(values) ? values : [values];
  return fields.some((field) => aliases.some((alias) => includesNormalizedPhrase(field, alias)));
}

function validateLookup(value) {
  if (!isPlainObject(value)) throw new TypeError("Knowledge lookup must be a plain object.");
  const fields = ["lab", "limit", "maxHintLevel", "query", "symptoms", "topic"];
  if (Object.keys(value).some((field) => !fields.includes(field))
    || !safeString(value.query, MAX_QUERY_LENGTH)) {
    throw new TypeError("Invalid knowledge lookup query.");
  }
  const lab = value.lab === undefined || value.lab === null
    ? null
    : normalizeText(value.lab);
  if (lab !== null && !safeString(lab, 80)) throw new TypeError("Invalid knowledge Lab.");
  const limit = value.limit === undefined ? DEFAULT_KNOWLEDGE_LIMIT : value.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_KNOWLEDGE_RESULTS) {
    throw new TypeError("Invalid knowledge result limit.");
  }
  const maxHintLevel = value.maxHintLevel === undefined
    ? DEFAULT_MAX_HINT_LEVEL
    : value.maxHintLevel;
  if (!Number.isInteger(maxHintLevel)
    || maxHintLevel < 1
    || maxHintLevel > MAX_STUDENT_HINT_LEVEL) {
    throw new TypeError("Invalid knowledge hint level.");
  }
  const topic = value.topic === undefined || value.topic === null
    ? null
    : normalizeText(value.topic);
  if (topic !== null && !safeString(topic, 80)) throw new TypeError("Invalid knowledge topic.");
  const symptoms = value.symptoms === undefined
    ? Object.freeze([])
    : validateStringArray(value.symptoms, "lookup symptoms", 16).map(normalizeText);
  return Object.freeze({
    query: value.query.trim(),
    lab,
    topic,
    symptoms: Object.freeze(symptoms),
    limit,
    maxHintLevel
  });
}

function scoreChunk(profile, query, idf) {
  const { chunk, normalized } = profile;
  let score = 0;

  // Preserve strong exact terminology, but normalize aliases on both sides and
  // cap each term to one contribution per field.
  for (const exact of EXACT_TERMS) {
    const aliases = [exact.term, ...exact.aliases];
    if (!fieldContainsAnyAlias(query.normalized, aliases)) continue;
    score += Math.max(
      fieldContainsAnyAlias(normalized.concepts, aliases) ? 125 : 0,
      fieldContainsAnyAlias(normalized.keywords, aliases) ? 70 : 0,
      fieldContainsAnyAlias(normalized.title, aliases) ? 55 : 0,
      fieldContainsAnyAlias(normalized.files, aliases) ? 30 : 0,
      fieldContainsAnyAlias(normalized.content, aliases) ? 20 : 0
    );
  }

  let directKeywordScore = 0;
  for (const keyword of normalized.keywords) {
    if (keyword.length >= 2 && includesNormalizedPhrase(query.normalized, keyword)) {
      directKeywordScore += 85;
    }
  }
  score += Math.min(directKeywordScore, 170);

  let directConceptScore = 0;
  for (const concept of normalized.concepts) {
    if (concept.length >= 2 && includesNormalizedPhrase(query.normalized, concept)) {
      directConceptScore += 70;
    }
  }
  score += Math.min(directConceptScore, 175);

  let exactSymptomScore = 0;
  for (const symptom of query.symptoms) {
    if (profile.symptoms.has(symptom)) exactSymptomScore += 145;
  }
  score += Math.min(exactSymptomScore, 290);

  const semanticScore = {
    symptoms: scoreSignalMatches(query.signals, profile.signals.symptoms, 50, 280),
    concepts: scoreSignalMatches(query.signals, profile.signals.concepts, 42, 240),
    keywords: scoreSignalMatches(query.signals, profile.signals.keywords, 38, 220),
    title: scoreSignalMatches(query.signals, profile.signals.title, 30, 160),
    topic: scoreSignalMatches(query.signals, profile.signals.topic, 24, 90),
    content: scoreSignalMatches(query.signals, profile.signals.content, 10, 85),
    files: scoreSignalMatches(query.signals, profile.signals.files, 8, 45)
  };
  score += Object.values(semanticScore).reduce((total, value) => total + value, 0);

  score += scoreTokenMatches(query.tokens, profile.tokens.symptoms, idf, 6, 100);
  score += scoreTokenMatches(query.tokens, profile.tokens.concepts, idf, 5.5, 90);
  score += scoreTokenMatches(query.tokens, profile.tokens.keywords, idf, 5, 85);
  score += scoreTokenMatches(query.tokens, profile.tokens.title, idf, 4, 65);
  score += scoreTokenMatches(query.tokens, profile.tokens.topic, idf, 3, 30);
  score += scoreTokenMatches(query.tokens, profile.tokens.content, idf, 1.1, 45);
  if (query.intent.navigation) {
    score += scoreTokenMatches(query.tokens, profile.tokens.files, idf, 3, 45);
  }

  if (query.topics.has(normalized.topic)) score += 35;
  const navigationChunk = isNavigationChunk(chunk);
  const overviewChunk = chunk.type === "overview" && !navigationChunk;
  const stageMatch = query.stage !== null && chunk.stage === query.stage;

  if (query.intent.navigation && navigationChunk) score += 105;
  if (query.intent.overview && overviewChunk) score += 105;
  if (query.stage !== null) {
    if (stageMatch) {
      score += query.intent.diagnosis && chunk.type === "diagnosis" ? 150 : 65;
    } else if (chunk.type === "stage" && !query.intent.diagnosis) {
      score += 25;
    } else if (chunk.stage > 0) {
      score -= 25;
    }
  }
  if (chunk.type === "stage" && query.intent.testing && !query.intent.diagnosis) {
    score += 90;
  }

  if (score < 10) return 0;

  if (overviewChunk && !query.intent.overview) score -= 120;
  if (navigationChunk && !query.intent.navigation) score -= 65;

  if (chunk.type === "diagnosis") {
    const diagnosticEvidence = exactSymptomScore > 0
      || semanticScore.symptoms >= 50
      || semanticScore.concepts + semanticScore.keywords + semanticScore.title >= 70
      || stageMatch;
    if (query.intent.diagnosis && diagnosticEvidence) score += 55;
    else if (!query.intent.diagnosis) score -= 25;
  }
  if (chunk.type === "concept") {
    if (query.intent.primary === "concept") score += 45;
    else if (query.intent.diagnosis) score += 10;
  }
  if (chunk.type === "flow") {
    if (query.intent.workflow) score += 225;
    else if (query.intent.primary === "concept") score += 10;
  }
  return score >= MIN_RELEVANCE_SCORE ? Math.round(score * 100) / 100 : 0;
}

function resultView(chunk, score) {
  return Object.freeze({
    id: chunk.id,
    lab: chunk.lab,
    stage: chunk.stage,
    type: chunk.type,
    topic: chunk.topic,
    concepts: chunk.concepts,
    files: chunk.files,
    symptoms: chunk.symptoms,
    hintLevel: chunk.hintLevel,
    source: chunk.source,
    title: chunk.title,
    content: chunk.content,
    score
  });
}

function createKnowledgeRetriever(options = {}) {
  if (!isPlainObject(options)
    || Object.keys(options).some((field) => field !== "catalog")) {
    throw new TypeError("Invalid knowledge retriever options.");
  }
  let catalog;
  let unavailableLabs = Object.freeze([]);
  if (options.catalog === undefined) {
    const loaded = {};
    const unavailable = [];
    for (const lab of SUPPORTED_LABS) {
      try {
        loaded[lab] = loadKnowledgeBase(lab);
      } catch (_) {
        unavailable.push(lab);
      }
    }
    catalog = Object.freeze(loaded);
    unavailableLabs = Object.freeze(unavailable);
  } else {
    catalog = validateKnowledgeCatalog(options.catalog);
  }
  const indices = Object.freeze(Object.fromEntries(Object.entries(catalog).map(([lab, knowledge]) => [
    lab,
    createLabIndex(knowledge.chunks)
  ])));

  return Object.freeze({
    retrieveKnowledge(input) {
      const lookup = validateLookup(input);
      if (!lookup.lab) return Object.freeze([]);
      if (unavailableLabs.includes(lookup.lab)) {
        throw new TypeError(`The ${lookup.lab} knowledge base is unavailable.`);
      }
      if (!Object.hasOwn(catalog, lookup.lab)) return Object.freeze([]);
      const query = analyzeQuery(lookup);
      if (query.runtimeOnly) return Object.freeze([]);
      const index = indices[lookup.lab];
      if (hasUnsupportedDomain(query, index)) return Object.freeze([]);
      if (query.intent.navigation && !index.hasNavigation) return Object.freeze([]);
      const ranked = index.profiles
        .filter((profile) => profile.chunk.hintLevel <= lookup.maxHintLevel)
        .map((profile) => Object.freeze({
          chunk: profile.chunk,
          score: scoreChunk(profile, query, index.idf)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score
          || left.chunk.hintLevel - right.chunk.hintLevel
          || left.chunk.id.localeCompare(right.chunk.id));
      return Object.freeze(ranked.slice(0, lookup.limit).map((entry) => (
        resultView(entry.chunk, entry.score)
      )));
    }
  });
}

let defaultRetriever = null;

function retrieveKnowledge(input) {
  if (defaultRetriever === null) defaultRetriever = createKnowledgeRetriever();
  return defaultRetriever.retrieveKnowledge(input);
}

module.exports = {
  DEFAULT_KNOWLEDGE_LIMIT,
  DEFAULT_MAX_HINT_LEVEL,
  KNOWLEDGE_PATHS,
  KNOWLEDGE_SCHEMA_VERSION,
  MAX_KNOWLEDGE_RESULTS,
  MAX_STUDENT_HINT_LEVEL,
  SUPPORTED_LABS,
  createKnowledgeRetriever,
  loadKnowledgeBase,
  loadKnowledgeCatalog,
  retrieveKnowledge
};
