# Lab6 Starter：用户态与系统调用

当前分支：`lab6-starter`

当前实验：Lab6 用户态与系统调用。

适合对象：已经完成 Lab5，第一次接触 RISC-V U-mode、`sret` 和系统调用的本科生。

预计时间：5 到 7 小时。

参考答案位于 `lab6-solution` 分支；本 starter 分支不包含完整答案。

## 5 分钟快速开始

1. 检查环境：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
   ```

2. 构建内核：

   ```powershell
   cargo build -p ai-os-kernel
   ```

3. 启动 QEMU，观察当前 starter 输出：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
   ```

4. 阅读任务一，找到用户态上下文 TODO：

   ```text
   docs/labs/lab6/TASKS.md
   ```

5. 完成任务一后运行 Stage 1 测试：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 1
   ```

## 你要完成的三个任务

| 阶段 | 任务 | 完成后关键输出 |
|---|---|---|
| Stage 1 | 完成 `UserContext`、`sepc`、用户栈和 `sstatus.SPP/SPIE` | `[Lab6-T1] user context ready` 和 `[Lab6-T1] PASS` |
| Stage 2 | 完成 syscall id、参数寄存器和 `write/yield/exit` 分发 | `[Lab6-T2] syscall ABI ready` 和 `[Lab6-T2] PASS` |
| Stage 3 | 进入 U-mode，处理最小用户程序的 `write` 和 `exit` | `[Lab6] syscall write handled`、`[Lab6] syscall exit handled`、`[Lab6] PASS` |

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- [实验总览](docs/labs/lab6/README.md)
- [任务书](docs/labs/lab6/TASKS.md)
- [分级提示](docs/labs/lab6/HINTS.md)
- [测试说明](docs/labs/lab6/TESTING.md)

旧版单页说明 [docs/labs/lab6.md](docs/labs/lab6.md) 只保留跳转说明。请优先阅读 `docs/labs/lab6/` 目录下的教学文档。

## 允许修改

- `kernel/src/user.rs`
- `kernel/src/syscall.rs`
- 必要时修改 `kernel/src/main.rs` 中标记为 Lab6 的测试入口

## 禁止修改

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `kernel/src/task/`
- `kernel/src/memory/`
- `scripts/test-lab6.ps1`
- Lab7 文件系统模块

## 分阶段测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
```

教师可用 starter incomplete 验证确认本分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -ExpectIncomplete
```

## 最终提交要求

学生完成 Lab6 后应提交：

- 修改后的 `kernel/src/user.rs`
- 修改后的 `kernel/src/syscall.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及为什么处理 `ecall` 后需要推进 `sepc`

建议提交信息：

```text
lab6: complete user mode and syscall exercise
```

## 答案说明

完整参考实现位于 `lab6-solution` 分支。请先独立完成 starter，再查看 solution。`lab6-solution` 中会额外包含：

- `docs/labs/lab6/SOLUTION.md`
- `docs/labs/lab6/TEACHER_GUIDE.md`
