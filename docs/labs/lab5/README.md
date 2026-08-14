# Lab5：任务管理与协作式调度

> 可视化页面提供本地证据与可选 AI 教学助教。starter 中助教只给证据化提示，不能读取或链接 solution/教师文件；回答不替代 Stage 验收。

本实验在 Lab4 虚拟内存基础上引入内核态任务。第一版只做单核、内核态、协作式轮转调度：任务主动 `yield`，调度器选择下一个 Ready 任务运行。

推荐学习闭环：先预测 A/B/C 任务交替顺序，再运行当前分支；完成每项任务后执行对应 `-Stage`，最后比较 starter/solution 调度状态。反馈不计分。

当前 `lab5-solution` 分支包含参考实现；学生起点请使用 `lab5-starter`。

## 学习目标

- 理解任务上下文为什么只保存 `ra`、`sp` 和 `s0..s11`。
- 理解任务栈、TCB 和任务状态的关系。
- 实现固定容量任务表和 round-robin 调度。
- 理解协作式调度与抢占式调度的区别。
- 通过 `__switch` 观察真实上下文切换。

## 三个任务

1. **任务抽象与任务表**：补全 `TaskContext::goto`、TCB 初始化和 `TaskManager::add_task`。
2. **协作式轮转调度**：补全 `fetch_next`、`run_next`、`yield_now`、`schedule` 的状态转换。
3. **上下文切换与演示任务**：补全 `__switch`，让 3 个内核态任务交替输出并正常结束。

## 文档导航

- [TASKS.md](TASKS.md)：每个任务的具体要求。
- [HINTS.md](HINTS.md)：分级提示，卡住时再看。
- [TESTING.md](TESTING.md)：环境、构建、QEMU 和 Stage 测试说明。
- [SOLUTION.md](SOLUTION.md)：参考实现说明，仅在 solution 分支提供。
- [TEACHER_GUIDE.md](TEACHER_GUIDE.md)：教师授课和验收建议，仅在 solution 分支提供。

## 完成标准

最终运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
```

应看到 QEMU 输出包含：

```text
[Lab5-T1] task table ready
[Lab5-T1] PASS
[Lab5-T2] round robin ready
[Lab5-T2] PASS
[Lab5] task A step 1
[Lab5] task B step 1
[Lab5] task C step 1
[Lab5] task A step 2
[Lab5] task B step 2
[Lab5] task C step 2
[Lab5] scheduler finished
[Lab5] PASS
```
