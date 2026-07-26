# Lab1：启动与 SBI 控制台

## 实验简介

本实验从 P0 最小可运行内核出发，将启动流程和 SBI 控制台输出整理为适合教学的实验起点。

## 学习目标

- 理解 QEMU、OpenSBI 和 S-mode 内核之间的关系。
- 理解 Rust 裸机程序的入口、栈和 panic 处理。
- 理解最小控制台输出和测试日志的重要性。

## 前置知识

Rust 基础、RISC-V 基础寄存器、裸机程序概念。

## 前置实验

P0 工程运行基线。

## 涉及模块

当前 `lab1-starter` 分支已经将 P0 中的最小逻辑拆分为教学模块：

- `boot`：启动栈设置和跳转到内核入口。
- `sbi`：SBI 控制台输出和系统关机。
- `console`：面向内核的行输出接口。
- `main`：Lab1 的教学入口和成功标志边界。

## 学生需要完成的任务

- 阅读 `boot`、`sbi`、`console` 到 `main` 的调用路径。
- 确认内核日志不是 OpenSBI 自带输出。
- 将 Lab1 占位成功标志替换为精确的 `[Lab1] PASS`。
- 保持 QEMU 能通过 SBI system reset 正常退出。

## Starter Code 边界

Starter code 保持可编译、可启动，并输出明确 TODO 日志。它不会输出 `[Lab1] PASS`，因此 `scripts/test-lab1.ps1` 会失败，直到学生补全成功标志。

## 参考实现边界

参考实现只补齐启动日志、控制台输出和测试退出路径，不引入后续实验功能。

## 自动测试设计

执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```

测试会构建内核、启动 QEMU、捕获串口输出，并只匹配 `[Lab1] PASS`。它不复用 P0 的 `[P0] PASS`。

## QEMU 预期输出

Starter 预期输出：

```text
[Lab1] start
[Lab1] console is available
[Lab1] TODO: replace this placeholder with the success marker
```

Solution 预期输出：

```text
[Lab1] start
[Lab1] console is available
[Lab1] PASS
```

## 验收标准

- 能交叉编译。
- 能在 QEMU 中启动。
- 能输出可测试的启动日志。
- 不引入 Lab2 及之后功能。

## 常见错误

- 混淆 OpenSBI 输出和内核输出。
- 修改 QEMU 参数导致测试不可复现。
- 未保持最小内核可自动退出。

## 思考题

- 为什么 P0 不计入正式教学实验？
- OpenSBI 在本项目中承担什么角色？

## 预计完成时间

2 到 4 小时。
