# Lab6 参考答案说明

本文件面向教师、助教和已经完成 `lab6-starter` 的学生。不要把本文件直接放入学生起始材料中。

## 任务一：用户态上下文边界

实现位置：

- `kernel/src/user.rs`

核心思路：

- `UserContext::new` 将 `sepc` 设置为用户入口。
- 用户栈顶按 16 字节对齐。
- `sstatus.SPP` 清零，使 `sret` 返回 U-mode。
- `sstatus.SPIE` 置位，使返回后中断使能状态符合教学预期。

常见错误：

- 忘记设置 `sepc`。
- 把 SPP 设置为 1，导致仍返回 S-mode。
- 用户栈没有对齐或没有正确映射。

## 任务二：系统调用 ABI

实现位置：

- `kernel/src/syscall.rs`

核心思路：

- `a7` 保存 syscall id。
- `a0..a5` 保存最多 6 个参数。
- `SYS_WRITE` 返回写入字节数。
- `SYS_YIELD` 返回 yield 结果。
- `SYS_EXIT` 返回退出码。
- 未知 syscall 保留 `UnknownSyscall` 错误。

常见错误：

- 从错误寄存器读取 syscall id。
- `write` 没有返回处理长度。
- 未知 syscall 被误判为成功。

## 任务三：最小用户程序验收

实现位置：

- `kernel/src/user.rs`
- `kernel/src/trap.rs`
- `kernel/src/syscall.rs`

参考实现使用内置用户程序，不引入 ELF 加载。用户程序执行 `ecall` 进入内核，内核识别 `ecall from U-mode`，读取 syscall 参数并调用 dispatcher。处理完 `ecall` 后必须推进 `sepc`，否则返回用户态后会重复执行同一条 `ecall`。

实际输出：

```text
[Lab6-T1] user context ready
[Lab6-T1] PASS
[Lab6-T2] syscall ABI ready
[Lab6-T2] PASS
[Lab6] user program: hello
[Lab6] syscall write handled
[Lab6] syscall exit handled
[Lab6] PASS
```

## 测试覆盖

主机单元测试覆盖：

- 用户上下文栈对齐和 `sepc` 设置。
- 用户态权限位设置。
- syscall request 参数保存。
- `write/yield/exit` 分发。
- 未知 syscall 拒绝。

QEMU 测试覆盖：

- Lab5 仍然通过。
- 用户程序真实进入 U-mode。
- `write` 和 `exit` syscall 被内核处理。
- 最终输出 `[Lab6] PASS`。

## 安全前提

Lab6 中的 `unsafe` 只用于 RISC-V CSR、内置用户入口和 `sret` 边界。成立前提是：内核运行在单 hart，用户 text 和 stack 已由 Lab4 页表映射为用户可访问，当前只运行一个内置用户程序。
