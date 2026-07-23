# Lab2: Trap and Exception Handling

## 实验背景

Lab2 在 Lab1 的启动和控制台基础上引入 RISC-V S-mode trap。学生将观察一个受控的 breakpoint 异常如何进入内核 trap 入口、如何由 Rust handler 识别原因、如何修正返回地址并回到原执行流。

## 学习目标

- 理解异常、中断和 trap 的区别。
- 理解 `stvec`、`scause`、`sepc`、`stval` 的作用。
- 理解 trap 入口保存和恢复寄存器的必要性。
- 能处理一个受控 breakpoint 异常，并让内核继续执行。
- 能解释 `unsafe` 和内联/全局汇编在裸机内核中的安全前提。

## 前置知识

- Lab1 的启动、SBI console 和 QEMU 测试流程。
- RISC-V 特权级和 S-mode CSR 基础。
- RISC-V 函数调用约定。
- Rust `unsafe` 的基本含义。

## 前置实验

- Lab1: Boot and SBI Console。

## 分支切换命令

```powershell
git switch lab2-starter
git switch lab2-solution
```

切换分支前应先确认工作区干净：

```powershell
git status --short
```

## Starter 和 Solution 的区别

| 分支 | 用途 | 预期结果 |
|---|---|---|
| `lab2-starter` | 学生起点，保留 trap 初始化、触发和完成判定的 TODO 边界 | 能编译和启动，但 Lab2 自动测试因缺少成功标志而失败 |
| `lab2-solution` | 教师参考答案 | 安装 trap 入口，触发并处理 breakpoint 异常，输出 Lab2 成功标志 |

## 涉及模块

- `trap`: Lab2 新增模块，负责 trap 入口安装、演示异常触发和处理状态记录。
- `main`: 调用 `trap::init()`、`trap::trigger_demo_exception()` 和 `trap::was_demo_handled()`。
- `console`: 输出 trap 处理过程日志。
- `sbi`: 在异常无法处理时仍作为关机路径。

## 学生需要补全的任务

- 在 `trap::init()` 中安装 S-mode trap 入口。
- 在 `trap::trigger_demo_exception()` 中触发一个受控 breakpoint 异常。
- 在 trap 入口中保存必要的通用寄存器，调用 Rust trap handler。
- 在 Rust handler 中读取并解释 `scause`、`sepc` 和 `stval`。
- 识别 breakpoint 异常，推进 `sepc`，设置完成状态并返回。
- 保持 Lab1 的 console 输出和 SBI shutdown 路径可用。

## 不允许修改的基础设施

- 不修改 linker script、目标架构或 QEMU 机器参数来绕过 trap 实验。
- 不修改测试脚本使其在没有 Lab2 成功标志时通过。
- 不引入 Lab3 及之后的 memory、task、syscall、user、fs 或 drivers 功能。
- 不删除 Lab1 已有启动和 console 能力。

## 核心知识点

### `stvec`

`stvec` 是 S-mode trap vector CSR。它保存 trap 入口地址。当前 Lab2 使用 direct mode：所有 S-mode trap 都跳转到同一个入口。

### `scause`

`scause` 记录 trap 原因。最高位表示 interrupt，其余位表示具体 cause code。Lab2 参考实现只处理同步 breakpoint 异常。

### `sepc`

`sepc` 保存发生 trap 时的指令地址。handler 返回前必须把它设置为下一条要执行的指令，否则 `sret` 可能反复回到同一条异常指令。

### `stval`

`stval` 保存 trap 附加信息。不同异常含义不同，Lab2 只将它作为诊断输入保留，不依赖它完成 breakpoint 处理。

### Breakpoint 异常

Lab2 使用一条明确的 32 位 `ebreak` 指令触发 breakpoint 异常。对应 cause code 是 3。

### 为什么推进 `sepc`

Lab2 触发的是 32 位 `ebreak`，长度为 4 字节。handler 处理完成后执行 `sepc = sepc + 4`，这样 `sret` 才会跳过已经处理过的异常指令，继续执行后续代码。

### 为什么保存和恢复寄存器

trap 可能打断任意内核执行点。入口汇编在调用 Rust handler 前保存通用寄存器，返回前恢复它们，避免 handler 破坏被打断代码的上下文。

### `unsafe` 和汇编安全前提

- 写 `stvec` 的安全前提：入口符号位于当前内核镜像中，并按 RISC-V 指令对齐。
- 触发 `ebreak` 的安全前提：`stvec` 已安装，且 handler 会推进 `sepc`。
- 写 `sepc` 的安全前提：新地址指向同一控制流中下一条合法指令。
- trap 入口汇编的安全前提：栈已由 `boot` 建立，保存区大小足够，保存/恢复顺序一致。

## 构建命令

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
```

## QEMU 运行命令

```powershell
make run
```

如果当前环境没有 `make`，可以使用项目脚本或直接参考 `Makefile` 中的 QEMU 参数。QEMU 可执行文件所在目录需要加入 `PATH`。

## 自动测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
```

## Starter 预期现象

`lab2-starter` 应能编译并在 QEMU 中启动，输出类似：

```text
[Lab2] start
[Lab1] console is available
[Lab1] PASS
[Lab2] trap starter: stvec is not configured yet
[Lab2] trap starter: demo exception is not triggered yet
[Lab2] TODO: configure stvec and handle the demo trap
```

`scripts/test-lab2.ps1` 应明确失败，失败原因应是没有找到 Lab2 成功标志。

## Solution 预期输出

`lab2-solution` 应输出：

```text
[Lab2] start
[Lab1] console is available
[Lab1] PASS
[Lab2] trap entry installed
[Lab2] triggering breakpoint exception
[Lab2] trap: breakpoint exception
[Lab2] PASS
```

测试脚本应输出：

```text
Lab2 QEMU smoke test passed.
```

## 验收标准

- `cargo fmt --all -- --check` 通过。
- `cargo build -p ai-os-kernel` 通过。
- `cargo clippy -p ai-os-kernel -- -D warnings` 通过。
- `lab2-starter` 能启动但不输出 Lab2 成功标志。
- `lab2-solution` 能真实触发并处理 breakpoint 异常。
- `lab2-solution` 在处理 32 位 `ebreak` 后推进 `sepc`。
- Lab2 不包含 Lab3 及之后实验功能。

## 常见错误

- 未设置 `stvec` 或入口地址未对齐。
- 入口汇编保存和恢复寄存器顺序不一致。
- 忘记推进 `sepc`，导致重复触发 breakpoint。
- 混淆 interrupt bit 和 cause code。
- 在 handler 中直接返回但没有恢复上下文。

## 调试建议

- 先确认 Lab1 输出仍然存在，避免把启动或 console 路径改坏。
- 使用 QEMU 日志判断是否到达 `trap entry installed`。
- 如果只看到 `triggering breakpoint exception` 后挂起，重点检查 trap 入口和 `sepc`。
- 如果出现 unexpected cause，打印并解释 `scause` 后再继续定位。
- 保持每次只改一处 trap 逻辑，便于判断失败原因。

## 思考题

- 为什么系统调用也可以基于 trap 机制实现？
- 如果触发的是 16 位压缩断点指令，`sepc` 是否仍然应该加 4？
- 为什么 trap handler 不能随意使用被打断代码的寄存器？
- Lab2 为什么不在此阶段引入页表或任务切换？

## 教师验收说明

- 教师应分别检查 `lab2-starter` 和 `lab2-solution`。
- starter 分支的“预期失败”是教学设计的一部分，但 CI 不应直接把正式 solution 测试失败显示为仓库失败。
- solution 分支必须看到 Lab2 成功标志，且日志中应能看出 breakpoint 异常确实进入 handler。
- 代码审查时应重点看 `sepc` 推进、寄存器保存/恢复和 `unsafe` 注释。

## 预计完成时间

4 到 6 小时。
