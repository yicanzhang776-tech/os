# Lab6：用户态与系统调用

> 可视化页面提供本地证据与可选 AI 教学助教。starter 中助教只给证据化提示，不能读取或链接 solution/教师文件；回答不替代 Stage 验收。

本实验在 Lab5 协作式调度基础上引入最小用户态。第一版只运行一个内置用户程序，处理 `write`、`yield`、`exit` 三类教学系统调用。

推荐学习闭环：先预测 U-mode 与 `ecall` 事件，再运行当前分支；完成每项任务后执行对应 `-Stage`，最后回放特权级和 syscall 证据。反馈不计分。

当前 `lab6-solution` 分支包含参考实现；学生起点请使用 `lab6-starter`。

## 学习目标

- 理解 `sepc`、用户栈和 `sstatus.SPP/SPIE` 的作用。
- 理解 `sret` 如何从 S-mode 返回 U-mode。
- 理解系统调用 id 和参数寄存器约定。
- 理解处理 `ecall` 后为什么要推进 `sepc`。
- 通过 QEMU 观察用户程序进入内核并返回验收结果。

## 三个任务

1. **用户态上下文边界**：补全 `UserContext` 中的 `sepc` 和 `sstatus` 设置。
2. **系统调用 ABI**：补全 `write/yield/exit` 的分发结果。
3. **最小用户程序验收**：进入 U-mode，处理 `write` 和 `exit`，输出 Lab6 成功标志。

## 文档导航

- [TASKS.md](TASKS.md)：每个任务的具体要求。
- [HINTS.md](HINTS.md)：分级提示，卡住时再看。
- [TESTING.md](TESTING.md)：环境、构建、QEMU 和 Stage 测试说明。
- [SOLUTION.md](SOLUTION.md)：参考实现说明，仅在 solution 分支提供。
- [TEACHER_GUIDE.md](TEACHER_GUIDE.md)：教师授课和验收建议，仅在 solution 分支提供。

## 完成标准

最终运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
```

应看到 QEMU 输出包含：

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
