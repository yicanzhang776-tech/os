# Lab2：Trap 与异常处理

本实验在 Lab1 的控制台基础上，引入 RISC-V S-mode trap。你会设置 `stvec`，触发一个可控 breakpoint 异常，读取 `scause/sepc/stval`，最后正确推进 `sepc` 并返回。

推荐学习闭环：先预测 breakpoint 事件链，再运行当前分支；完成每项任务后执行对应 `-Stage`，最后回放 trap 证据并填写教学反馈。反馈不计分。

## 学习目标

- 理解 trap、异常和中断的基本区别。
- 理解 `stvec` 如何指定 S-mode trap 入口。
- 理解 `scause`、`sepc`、`stval` 在异常处理中的作用。
- 理解 breakpoint 异常处理后为什么要推进 `sepc`。

## 前置知识

- 已完成 Lab1，能够使用 SBI console 输出日志。
- 了解 RISC-V 特权级和 CSR 的概念。
- 能阅读少量 `unsafe` 或内联汇编边界说明。

## 三个任务

1. **设置 trap 入口与 `stvec`**：安装 trap 入口，让 CPU 知道异常发生后跳到哪里。
2. **读取并解释异常寄存器**：触发 breakpoint，读取 `scause/sepc/stval` 并识别异常原因。
3. **推进 `sepc` 并从异常返回**：跳过已处理的 `ebreak` 指令，让内核继续执行并输出 `[Lab2] PASS`。

## 推荐学习顺序

1. 阅读 `kernel/src/trap.rs` 中的 `TODO(LAB2-T1)`。
2. 完成任务一并运行 Stage 1 测试。
3. 阅读 `TODO(LAB2-T2)`，观察 breakpoint 的异常原因。
4. 完成任务二并运行 Stage 2 测试。
5. 阅读 `TODO(LAB2-T3)`，理解 `sepc += 4` 的原因。
6. 完成任务三并运行 Stage 3 测试。

## 文档导航

- [TASKS.md](TASKS.md)：每个任务的具体要求。
- [HINTS.md](HINTS.md)：分级提示，卡住时再看。
- [TESTING.md](TESTING.md)：环境、构建、QEMU 和 Stage 测试说明。
- [SOLUTION.md](SOLUTION.md)：参考实现说明，仅在 `lab2-solution` 分支提供。
- [TEACHER_GUIDE.md](TEACHER_GUIDE.md)：教师授课和验收建议，仅在 `lab2-solution` 分支提供。

## 完成标准

最终运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
```

应看到 QEMU 输出包含：

```text
[Lab2-T1] stvec configured
[Lab2-T1] PASS
[Lab2-T2] breakpoint decoded
[Lab2-T2] PASS
[Lab2] breakpoint handled
[Lab2] PASS
```
