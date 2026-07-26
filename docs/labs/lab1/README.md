# Lab1：启动与 SBI 控制台

本实验把 P0 最小内核改造成第一个正式教学实验。你会从 QEMU/OpenSBI 进入 S-mode 内核开始，理解启动入口、启动栈、Rust `kernel_main`，并完成最小控制台输出。

## 学习目标

- 认识 `_start`、启动栈和链接脚本入口。
- 理解为什么裸机内核不能直接使用标准输出。
- 使用 SBI console 输出字符和字符串。
- 输出稳定成功标志，让自动化测试判断实验是否完成。

## 前置知识

- Rust 基础语法：函数、字符串切片、模块。
- RISC-V 基础概念：寄存器、栈指针 `sp`、跳转。
- 裸机程序没有操作系统服务，必须通过固件接口完成输出和关机。

## 三个任务

1. **理解内核启动流程**：补全启动路径标记，确认内核已经从 `_start` 进入 `kernel_main`。
2. **实现 SBI 字符与字符串输出**：补全 `console_putchar` 和 `console_write`，让内核能够输出任意字符串。
3. **完成启动日志与正常关机**：组织最终日志，输出 `[Lab1] PASS`，并通过 SBI reset 正常退出 QEMU。

## 推荐学习顺序

1. 阅读 `kernel/linker.ld` 中的 `ENTRY(_start)`。
2. 阅读 `kernel/src/boot.rs`，观察启动栈和跳转到 `kernel_main` 的汇编。
3. 阅读 `kernel/src/main.rs` 中的 `TODO(LAB1-T1)`。
4. 完成任务一并运行 Stage 1 测试。
5. 阅读 `kernel/src/sbi.rs` 和 `kernel/src/console.rs`。
6. 完成任务二并运行 Stage 2 测试。
7. 完成任务三并运行 Stage 3 测试。

## 文档导航

- [TASKS.md](TASKS.md)：每个任务的具体要求。
- [HINTS.md](HINTS.md)：分级提示，卡住时再看。
- [TESTING.md](TESTING.md)：环境、构建、QEMU 和 Stage 测试说明。

## 完成标准

最终运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```

应看到 QEMU 输出包含：

```text
[Lab1-T1] kernel entered
[Lab1-T1] PASS
[Lab1-T2] console ready
[Lab1-T2] PASS
[Lab1] start
[Lab1] console ready
[Lab1] PASS
```
