# Lab5 Solution：任务管理与协作式调度

当前分支：`lab5-solution`

当前实验：Lab5 任务管理与协作式调度参考实现与教师验收材料。

适合对象：教师、助教和完成 `lab5-starter` 后需要对照参考实现的学生。

> 注意：本分支包含完整参考答案，不建议直接作为学生起始分支发布给学生。学生应从 `lab5-starter` 开始。

## 本分支包含什么

- Lab5 三个教学任务的完整参考实现。
- 与 `lab5-starter` 相同的任务书、提示和测试说明。
- 额外的参考答案说明：`docs/labs/lab5/SOLUTION.md`。
- 教师验收和授课建议：`docs/labs/lab5/TEACHER_GUIDE.md`。
- 分阶段测试脚本：`scripts/test-lab5.ps1 -Stage 1/2/3`。

## Lab5 三个递进任务

| 阶段 | 任务 | 关键输出 |
|---|---|---|
| Stage 1 | `TaskContext::goto`、任务栈、TCB 和 `add_task` | `[Lab5-T1] task table ready`，`[Lab5-T1] PASS` |
| Stage 2 | `fetch_next/run_next/yield_now/schedule` 的协作式轮转状态机 | `[Lab5-T2] round robin ready`，`[Lab5-T2] PASS` |
| Stage 3 | `__switch` 保存恢复 `ra/sp/s0..s11`，演示任务交替执行 | `[Lab5] scheduler finished`，`[Lab5] PASS` |

## 快速验收

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
cargo build -p ai-os-kernel
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
```

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- [Lab5 总览](docs/labs/lab5/README.md)
- [任务书](docs/labs/lab5/TASKS.md)
- [分级提示](docs/labs/lab5/HINTS.md)
- [测试说明](docs/labs/lab5/TESTING.md)
- [参考答案说明](docs/labs/lab5/SOLUTION.md)
- [教师指南](docs/labs/lab5/TEACHER_GUIDE.md)

## 参考实现边界

本分支实现的是教学版协作式调度：

- 单 hart。
- 内核态任务。
- 固定 `MAX_TASKS = 4`。
- 每个任务栈 16 KiB。
- 任务主动 `yield`，不实现时钟中断抢占。
- `__switch` 只保存 `ra`、`sp`、`s0..s11`。
- 不实现用户态、系统调用、动态任务创建或复杂优先级调度。

## 建议使用方式

教师可先向学生发布 `lab5-starter`，课堂讲解 `TASKS.md` 和 `HINTS.md`。验收或讲评时再切换到本分支，对照 `SOLUTION.md` 和 `TEACHER_GUIDE.md` 说明关键实现。
