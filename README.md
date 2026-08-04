# Lab5 Starter：任务管理与协作式调度

当前分支：`lab5-starter`

当前实验：Lab5 任务管理与协作式调度。

适合对象：已经完成 Lab4，第一次接触内核态任务切换和调度的本科生。

预计时间：5 到 7 小时。

参考答案位于 `lab5-solution` 分支；本 starter 分支不包含完整答案。

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

4. 阅读任务一，找到任务上下文和任务表 TODO：

   ```text
   docs/labs/lab5/TASKS.md
   ```

5. 完成任务一后运行 Stage 1 测试：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 1
   ```

## 你要完成的三个任务

| 阶段 | 任务 | 完成后关键输出 |
|---|---|---|
| Stage 1 | 完成 `TaskContext::goto`、任务栈、TCB 和 `add_task` | `[Lab5-T1] task table ready` 和 `[Lab5-T1] PASS` |
| Stage 2 | 完成 `fetch_next/run_next/yield_now/schedule` 的协作式轮转状态机 | `[Lab5-T2] round robin ready` 和 `[Lab5-T2] PASS` |
| Stage 3 | 完成 `__switch`，让 3 个演示任务交替执行 | `[Lab5] scheduler finished` 和 `[Lab5] PASS` |

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- [实验总览](docs/labs/lab5/README.md)
- [任务书](docs/labs/lab5/TASKS.md)
- [分级提示](docs/labs/lab5/HINTS.md)
- [测试说明](docs/labs/lab5/TESTING.md)

旧版单页说明 [docs/labs/lab5.md](docs/labs/lab5.md) 只保留跳转说明。请优先阅读 `docs/labs/lab5/` 目录下的教学文档。

## 教学评价

运行 `sh scripts/run-interactive-demo.sh` 后，页面会识别当前 Lab5 starter 分支，并显示五道针对 TaskContext、任务状态、round-robin 和 `__switch` 实验的教学评价题，用来评价图示、任务难度、分阶段提示和切换轨迹，不要求填写知识答案；第 5 题关注三个 Stage 对定位调度错误是否有帮助。详细用法见 [可视化使用说明](docs/interactive-demo/README.md)。

## 允许修改

- `kernel/src/task/mod.rs`
- `kernel/src/task/switch.S`
- 必要时修改 `kernel/src/main.rs` 中标记为 Lab5 的测试入口

## 禁止修改

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `kernel/src/trap.rs`
- `kernel/src/memory/`
- `scripts/test-lab5.ps1`
- Lab6 及后续实验模块

## 分阶段测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
```

教师可用 starter incomplete 验证确认本分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -ExpectIncomplete
```

## 最终提交要求

学生完成 Lab5 后应提交：

- 修改后的 `kernel/src/task/mod.rs`
- 修改后的 `kernel/src/task/switch.S`
- 一段简短说明：三个 Stage 测试是否通过，以及协作式调度和抢占式调度的区别

建议提交信息：

```text
lab5: complete cooperative scheduling exercise
```

## 答案说明

完整参考实现位于 `lab5-solution` 分支。请先独立完成 starter，再查看 solution。`lab5-solution` 中会额外包含：

- `docs/labs/lab5/SOLUTION.md`
- `docs/labs/lab5/TEACHER_GUIDE.md`
