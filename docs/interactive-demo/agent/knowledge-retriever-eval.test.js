"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  loadKnowledgeCatalog,
  retrieveKnowledge
} = require("./knowledge-retriever");

// These cases deliberately avoid the wording used by the indexed fields. They
// exercise semantic paraphrases without turning evaluation sentences into
// retrieval rules or knowledge-base aliases.
const PARAPHRASE_CASES = Object.freeze([
  {
    lab: "lab1",
    intent: "diagnosis",
    query: "启动时固件信息出来了，自己的内核却一声不响，该从哪一段查？",
    expected: ["lab1-debug-opensbi-only"]
  },
  {
    lab: "lab1",
    intent: "concept",
    query: "裸机 Rust 为什么不能沿用普通程序的标准库和 main 入口？",
    expected: ["lab1-concept-bare-metal-rust"]
  },
  {
    lab: "lab1",
    intent: "diagnosis",
    query: "完成提示已经出现，可模拟器进程一直挂着不结束。",
    expected: ["lab1-shutdown-path", "lab1-debug-qemu-timeout"]
  },
  {
    lab: "lab1",
    intent: "workflow",
    query: "从虚拟机上电到 Rust 内核入口，中间的控制权如何传递？",
    expected: ["lab1-boot-flow"]
  },
  {
    lab: "lab2",
    intent: "concept",
    query: "trap 处理的起点应该写进哪个 CSR，恢复执行点又由谁记录？",
    expected: ["lab2-stvec-direct-mode", "lab2-csr-roles"]
  },
  {
    lab: "lab2",
    intent: "diagnosis",
    query: "异常处理结束后又落回原来的断点指令，反复进处理器。",
    expected: ["lab2-sepc-progress", "lab2-debug-stage3-timeout"]
  },
  {
    lab: "lab2",
    intent: "workflow",
    query: "从执行 ebreak 到恢复原程序，完整处理链路有哪些环节？",
    expected: ["lab2-trap-entry-flow"]
  },
  {
    lab: "lab2",
    intent: "concept",
    query: "由正在执行的指令直接引发的故障，和外设突然请求 CPU 有何分类差别？",
    expected: ["lab2-trap-exception-interrupt"]
  },
  {
    lab: "lab3",
    intent: "diagnosis",
    query: "地址已经压在页边界上，向上取整却仍跳到了下一页。",
    expected: ["lab3-rounding-alignment", "lab3-debug-stage1"]
  },
  {
    lab: "lab3",
    intent: "concept",
    query: "同一张物理页被回收两次会破坏什么不变量？",
    expected: ["lab3-recycle-validation"]
  },
  {
    lab: "lab3",
    intent: "diagnosis",
    query: "连续申请内存帧却总拿到相同编号，状态哪里最可疑？",
    expected: ["lab3-debug-stage2", "lab3-allocator-state"]
  },
  {
    lab: "lab3",
    intent: "concept",
    query: "可用物理内存为什么必须从内核镜像末尾之后开始？",
    expected: ["lab3-safe-physical-bounds"]
  },
  {
    lab: "lab4",
    intent: "concept",
    query: "VPN 三段按低位到高位存进数组，查三级表时也是这个方向吗？",
    expected: ["lab4-vpn-index-order"]
  },
  {
    lab: "lab4",
    intent: "diagnosis",
    query: "虚拟地址翻译后只剩物理页起点，原来的页内位置丢了。",
    expected: ["lab4-translate-unmap", "lab4-debug-stage2"]
  },
  {
    lab: "lab4",
    intent: "diagnosis",
    query: "打开地址转换之后立刻没有任何新日志，切换边界应查什么？",
    expected: ["lab4-activation-safety", "lab4-debug-stage3"]
  },
  {
    lab: "lab4",
    intent: "concept",
    query: "页表项只要有效就一定是最终映射吗？",
    expected: ["lab4-leaf-nonleaf"]
  },
  {
    lab: "lab5",
    intent: "diagnosis",
    query: "每次选任务都重新挑编号零，后面的任务一直得不到运行机会。",
    expected: ["lab5-round-robin-scan", "lab5-debug-round-robin"]
  },
  {
    lab: "lab5",
    intent: "concept",
    query: "任务主动交出处理器以后，应回到哪个调度状态？",
    expected: ["lab5-task-state-machine"]
  },
  {
    lab: "lab5",
    intent: "concept",
    query: "协作切换的现场为什么只保留返回地址、栈和保存寄存器？",
    expected: ["lab5-task-context"]
  },
  {
    lab: "lab5",
    intent: "diagnosis",
    query: "有个任务一直自旋也不主动让出，其他 Ready 项为何全饿住了？",
    expected: ["lab5-cooperative-limit"]
  },
  {
    lab: "lab6",
    intent: "diagnosis",
    query: "执行完 ecall 后程序计数器没往前走，于是同一系统调用又跑了一遍。",
    expected: ["lab6-sepc-after-ecall", "lab6-debug-repeated-ecall"]
  },
  {
    lab: "lab6",
    intent: "concept",
    query: "调用编号、六个参数和返回结果分别放在哪些寄存器？",
    expected: ["lab6-syscall-abi"]
  },
  {
    lab: "lab6",
    intent: "diagnosis",
    query: "sret 刚进入低特权级就发生取指页故障，应先核对什么？",
    expected: ["lab6-user-memory-boundary", "lab6-debug-user-fault-or-unknown"]
  },
  {
    lab: "lab6",
    intent: "workflow",
    query: "用户执行 ecall 后，内核怎样处理请求再恢复用户代码？",
    expected: ["lab6-user-ecall-flow"]
  },
  {
    lab: "lab7",
    intent: "concept",
    query: "文件关掉再打开时，原数据和当前读写位置各会怎样？",
    expected: ["lab7-file-offset"]
  },
  {
    lab: "lab7",
    intent: "diagnosis",
    query: "向内存设备写过字节，读回来却全是零，先查哪一侧的拷贝？",
    expected: ["lab7-device-copy-direction", "lab7-debug-device"]
  },
  {
    lab: "lab7",
    intent: "concept",
    query: "用户拿到的文件句柄为什么不能不转换就用作槽位下标？",
    expected: ["lab7-fd-index-validation"]
  },
  {
    lab: "lab7",
    intent: "workflow",
    query: "同一个 write 请求怎样决定送到终端还是 RAM 文件？",
    expected: ["lab7-console-vs-file-write"]
  }
]);

// This second regression set exercises different wording and lower-frequency
// concepts. It is intentionally not called held-out because it remains visible
// while the generic retriever evolves.
const SECONDARY_REGRESSION_CASES = Object.freeze([
  {
    lab: "lab1",
    intent: "diagnosis",
    query: "屏幕只刷出固件横幅，学生代码没有留下任何可观察标记。",
    expected: ["lab1-debug-opensbi-only"]
  },
  {
    lab: "lab1",
    intent: "diagnosis",
    query: "所有成功输出都看到了，但虚拟机进程仍没有收尾。",
    expected: ["lab1-shutdown-path", "lab1-debug-qemu-timeout"]
  },
  {
    lab: "lab2",
    intent: "diagnosis",
    query: "处理器从异常入口返回后又踩中同一条 ebreak。",
    expected: ["lab2-sepc-progress", "lab2-debug-stage3-timeout"]
  },
  {
    lab: "lab2",
    intent: "concept",
    query: "cause 寄存器的最高位和剩余编号各自说明什么？",
    expected: ["lab2-trap-exception-interrupt", "lab2-csr-roles"]
  },
  {
    lab: "lab3",
    intent: "diagnosis",
    query: "分配器把本应只是边界的最后编号也发了出去。",
    expected: ["lab3-half-open-range", "lab3-debug-stage2"]
  },
  {
    lab: "lab3",
    intent: "diagnosis",
    query: "一次回收请求被拒绝以后，后续发页顺序反而改变了。",
    expected: ["lab3-recycle-validation", "lab3-debug-stage3"]
  },
  {
    lab: "lab4",
    intent: "diagnosis",
    query: "换算结果保留了目标页，却抹掉了源地址低十二位。",
    expected: ["lab4-translate-unmap", "lab4-debug-stage2"]
  },
  {
    lab: "lab4",
    intent: "diagnosis",
    query: "satp 写完以后 CPU 就再也没有打印后置消息。",
    expected: ["lab4-activation-safety", "lab4-debug-stage3"]
  },
  {
    lab: "lab5",
    intent: "diagnosis",
    query: "汇编访问任务现场的偏移与 Rust 结构布局对不上。",
    expected: ["lab5-context-switch-abi", "lab5-debug-switch-crash"]
  },
  {
    lab: "lab5",
    intent: "diagnosis",
    query: "已经结束的任务又被选成了下一位运行者。",
    expected: ["lab5-task-state-machine", "lab5-debug-round-robin"]
  },
  {
    lab: "lab6",
    intent: "diagnosis",
    query: "handler 恢复后，用户程序马上再次发出完全相同的请求。",
    expected: ["lab6-sepc-after-ecall", "lab6-debug-repeated-ecall"]
  },
  {
    lab: "lab6",
    intent: "concept",
    query: "内核从哪一个通用寄存器取得服务编号？",
    expected: ["lab6-syscall-abi"]
  },
  {
    lab: "lab7",
    intent: "diagnosis",
    query: "close 已经成功，旧句柄却还能继续读取。",
    expected: ["lab7-file-offset", "lab7-debug-fd", "lab7-fd-index-validation"]
  },
  {
    lab: "lab7",
    intent: "concept",
    query: "计算设备访问终点时若整数回绕，范围检查应该如何看待？",
    expected: ["lab7-device-range"]
  }
]);

function evaluate(cases) {
  let topOneHits = 0;
  let topThreeHits = 0;
  const misses = [];
  for (const item of cases) {
    const results = retrieveKnowledge({ lab: item.lab, query: item.query, limit: 3 });
    const ids = results.map((result) => result.id);
    const topOne = item.expected.includes(ids[0]);
    const topThree = ids.some((id) => item.expected.includes(id));
    if (topOne) topOneHits += 1;
    if (topThree) topThreeHits += 1;
    if (!topOne || !topThree) {
      misses.push({
        lab: item.lab,
        intent: item.intent,
        query: item.query,
        expected: item.expected,
        actual: ids
      });
    }
  }
  return {
    total: cases.length,
    topOneHits,
    topThreeHits,
    topOneRate: topOneHits / cases.length,
    topThreeRate: topThreeHits / cases.length,
    misses
  };
}

function describe(metrics) {
  return JSON.stringify({
    topOne: `${metrics.topOneHits}/${metrics.total}`,
    topThree: `${metrics.topThreeHits}/${metrics.total}`,
    misses: metrics.misses
  }, null, 2);
}

function normalizeForAudit(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, "")
    .trim();
}

test("independent paraphrases meet retrieval quality targets", () => {
  const metrics = evaluate(PARAPHRASE_CASES);
  assert.ok(metrics.topOneRate >= 0.85, describe(metrics));
  assert.ok(metrics.topThreeRate >= 0.95, describe(metrics));
});

test("secondary paraphrase regression meets its quality targets", () => {
  const metrics = evaluate(SECONDARY_REGRESSION_CASES);
  assert.ok(metrics.topOneRate >= 0.80, describe(metrics));
  assert.ok(metrics.topThreeRate >= 0.90, describe(metrics));
});

test("evaluation sentences are absent from retrieval rules and knowledge metadata", () => {
  const retrieverSource = normalizeForAudit(fs.readFileSync(
    path.join(__dirname, "knowledge-retriever.js"), "utf8"
  ));
  const catalog = loadKnowledgeCatalog();
  for (const item of [...PARAPHRASE_CASES, ...SECONDARY_REGRESSION_CASES]) {
    const query = normalizeForAudit(item.query);
    assert.equal(retrieverSource.includes(query), false,
      `Evaluation wording leaked into retrieval rules: ${item.query}`);
    const longFragments = new Set();
    for (const run of item.query.normalize("NFKC").match(/[\p{Script=Han}]+/gu) || []) {
      for (let index = 0; index + 6 <= run.length; index += 1) {
        longFragments.add(normalizeForAudit(run.slice(index, index + 6)));
      }
    }
    for (const fragment of longFragments) {
      assert.equal(retrieverSource.includes(fragment), false,
        `Evaluation fragment leaked into retrieval rules: ${fragment}`);
    }
    for (const chunk of catalog[item.lab].chunks) {
      for (const field of [
        chunk.title,
        chunk.content,
        chunk.topic,
        chunk.source,
        ...chunk.concepts,
        ...chunk.keywords,
        ...chunk.symptoms,
        ...chunk.files
      ]) {
        assert.equal(normalizeForAudit(field).includes(query), false,
          `Evaluation wording leaked into ${chunk.id}: ${item.query}`);
        for (const fragment of longFragments) {
          assert.equal(normalizeForAudit(field).includes(fragment), false,
            `Evaluation fragment leaked into ${chunk.id}: ${fragment}`);
        }
      }
    }
  }
});

module.exports = {
  PARAPHRASE_CASES,
  SECONDARY_REGRESSION_CASES,
  evaluate
};
