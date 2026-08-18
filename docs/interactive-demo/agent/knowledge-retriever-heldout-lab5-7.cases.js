"use strict";

function heldoutCase(lab, intent, query, expected) {
  return Object.freeze({
    lab,
    intent,
    query,
    expected: Object.freeze([...expected])
  });
}

const HELDOUT_LAB5_7_CASES = Object.freeze([
  heldoutCase(
    "lab5",
    "concept",
    "同一个编号的工作单元被登记两遍时，为什么不能让后一次悄悄顶掉前一次？",
    ["lab5-fixed-task-table"]
  ),
  heldoutCase(
    "lab5",
    "workflow",
    "一个执行单元愿意暂停自己后，控制权怎样经过选择器交到下一位可运行者手中？",
    ["lab5-yield-schedule-flow", "lab5-round-robin-scan"]
  ),
  heldoutCase(
    "lab5",
    "diagnosis",
    "第一次换到新执行单元便跑到奇怪地址，连第二条任务消息都没出现，应优先核对哪两边的现场布局？",
    ["lab5-debug-switch-crash", "lab5-context-switch-abi"]
  ),
  heldoutCase(
    "lab5",
    "testing",
    "第二阶段亮出成功标记后，能否直接断言完整调度和底层切换全都没问题？",
    ["lab5-stages-and-markers"]
  ),
  heldoutCase(
    "lab6",
    "concept",
    "准备降到低权限程序前，起始 PC、栈指针和中断开关应由哪些现场信息决定？",
    ["lab6-user-context", "lab6-sret-privilege-flow"]
  ),
  heldoutCase(
    "lab6",
    "workflow",
    "受限程序请求打印一段内容时，这个请求从寄存器现场进入内核、形成结果，再送回调用者要走哪些步骤？",
    ["lab6-user-ecall-flow", "lab6-trap-register-state"]
  ),
  heldoutCase(
    "lab6",
    "diagnosis",
    "一次内核服务明明已经处理，屏幕却周期性出现同样输出，后面的退出请求始终轮不到；最可能遗漏了哪类返回现场更新？",
    ["lab6-debug-repeated-ecall", "lab6-sepc-after-ecall"]
  ),
  heldoutCase(
    "lab6",
    "navigation",
    "入口上下文、请求分派、异常保存各自落在哪几个源码模块？",
    ["lab6-key-files"]
  ),
  heldoutCase(
    "lab7",
    "concept",
    "所有打开记录都占着位置时，再申请一个访问凭据，应与存储空间不足区分成什么性质的失败？",
    ["lab7-fd-table", "lab7-fs-errors"]
  ),
  heldoutCase(
    "lab7",
    "workflow",
    "受限程序想保存两字节并确认写对了，从取得访问号到结束这次使用，内核各层应按怎样的先后配合？",
    ["lab7-user-file-io-flow"]
  ),
  heldoutCase(
    "lab7",
    "diagnosis",
    "缓冲区本身不长，但起始位置已经靠近字节容器末端，操作突然越过容量时应在哪一层拒绝？",
    ["lab7-device-range", "lab7-debug-device"]
  ),
  heldoutCase(
    "lab7",
    "testing",
    "功能补完后，主机侧检查仍坚持接口必须报告未实现，而系统级阶段却要求成功，这两种判据冲突时该如何理解？",
    ["lab7-starter-test-contract-conflict"]
  )
]);

module.exports = Object.freeze({ HELDOUT_LAB5_7_CASES });
