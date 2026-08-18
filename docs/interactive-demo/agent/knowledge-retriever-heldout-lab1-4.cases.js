"use strict";

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const HELDOUT_LAB1_4_CASES = deepFreeze([
  {
    lab: "lab1",
    intent: "concept",
    query: "为什么在缺少现成系统服务的裸机上，输出字符串也得先搭自己的字符通道？",
    expected: ["lab1-console-path", "lab1-concept-bare-metal-rust"]
  },
  {
    lab: "lab1",
    intent: "workflow",
    query: "处理器交到学生内核以后，进入 Rust 代码之前为何必须先准备一块可用的栈？",
    expected: ["lab1-start-and-boot-stack", "lab1-boot-flow"]
  },
  {
    lab: "lab1",
    intent: "diagnosis",
    query: "编译阶段已经报错时，为什么不该继续依靠模拟器现象推测运行故障？",
    expected: ["lab1-debug-build-failure"]
  },
  {
    lab: "lab1",
    intent: "navigation-testing",
    query: "想确认第一阶段究竟验证入口还是控制台，应该先查看哪份验收说明和哪个脚本？",
    expected: ["lab1-stages-and-markers", "lab1-key-files"]
  },
  {
    lab: "lab2",
    intent: "concept",
    query: "同一个处理入口为何既能接住同步故障，也能接住异步请求，处理时靠什么区分？",
    expected: ["lab2-trap-exception-interrupt", "lab2-csr-roles"]
  },
  {
    lab: "lab2",
    intent: "workflow",
    query: "断点触发后，保存现场、判定原因、修正返回点、恢复执行，这几个动作应是什么先后关系？",
    expected: ["lab2-trap-entry-flow", "lab2-sepc-progress"]
  },
  {
    lab: "lab2",
    intent: "diagnosis",
    query: "入口配置阶段的通过标志一直不出现，除了地址本身还应核对模式位和完成状态的依据吗？",
    expected: ["lab2-debug-stage1", "lab2-stvec-direct-mode"]
  },
  {
    lab: "lab2",
    intent: "navigation-testing",
    query: "想知道第三阶段除了最终通过文字还强制要求哪些先前输出，应去哪里核对？",
    expected: ["lab2-stages-and-markers", "lab2-key-files"]
  },
  {
    lab: "lab3",
    intent: "concept",
    query: "为什么申请不到新页只需要表示‘没有’，而归还失败却要说明具体原因？",
    expected: ["lab3-option-result"]
  },
  {
    lab: "lab3",
    intent: "workflow",
    query: "初始化一段可用页之后，顺序发页、耗尽、回收、再次发页的状态如何演进？",
    expected: ["lab3-allocator-state", "lab3-recycle-validation"]
  },
  {
    lab: "lab3",
    intent: "diagnosis",
    query: "某次归还的是从未发出去的页，分配器应在写入空闲记录前检查哪些事实？",
    expected: ["lab3-recycle-validation", "lab3-debug-stage3"]
  },
  {
    lab: "lab3",
    intent: "navigation-testing",
    query: "地址换算和页帧回收分别应在哪个源码模块完成，阶段检查又由哪里串起来？",
    expected: ["lab3-key-files", "lab3-stages-and-markers"]
  },
  {
    lab: "lab4",
    intent: "concept",
    query: "若文本区域和可修改区域都开放同样权限，会削弱哪一类隔离？",
    expected: ["lab4-kernel-permissions"]
  },
  {
    lab: "lab4",
    intent: "workflow",
    query: "建立地址空间后，在切换硬件翻译之前，哪些正在使用的对象必须先能通过新表访问？",
    expected: ["lab4-activation-safety", "lab4-identity-mapping"]
  },
  {
    lab: "lab4",
    intent: "diagnosis",
    query: "首次建立一条映射正常，第二次对同一虚拟页再建立映射却覆盖旧内容，这违反了什么接口约定？",
    expected: ["lab4-map-contract", "lab4-debug-stage2"]
  },
  {
    lab: "lab4",
    intent: "navigation-testing",
    query: "第三阶段的四条成功输出为什么必须按建表、激活、切换后存活的顺序出现？",
    expected: ["lab4-stages-and-markers", "lab4-activation-safety"]
  }
]);

module.exports = { HELDOUT_LAB1_4_CASES };
