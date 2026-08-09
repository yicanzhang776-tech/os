# Lab5 参考答案说明

本文件面向教师、助教和已经完成 `lab5-starter` 的学生。不要把本文件直接放入学生起始材料中。

## 任务一：任务抽象与任务表

实现位置：

- `kernel/src/task/mod.rs`

核心思路：

- `TaskContext::goto` 将 `ra` 设置为任务入口地址，将 `sp` 设置为 16 字节对齐后的任务栈顶。
- `TaskControlBlock::new` 创建 Ready 状态的任务。
- `TaskManager::add_task` 使用固定数组保存任务，拒绝非法 id 和重复 id。

常见错误：

- 忘记对栈顶做 16 字节对齐。
- 允许重复任务覆盖旧任务。
- 把任务入口写成会普通返回的函数。

## 任务二：协作式轮转调度

实现位置：

- `TaskManager::fetch_next`
- `TaskManager::run_next`
- `yield_now`
- `schedule`

核心思路：

- `fetch_next` 从 `next_scan` 开始最多扫描 `MAX_TASKS` 次，只选择 Ready 任务。
- `run_next` 把旧 Running 任务恢复为 Ready，再把新任务标记为 Running。
- `yield_now` 将当前任务改回 Ready，再切回调度器上下文。
- Exited 任务不会再被调度。

常见错误：

- 每次都从 0 开始扫描，导致低编号任务长期占优。
- 任务 yield 后没有回到 Ready。
- Exited 任务被再次调度。

## 任务三：上下文切换

实现位置：

- `kernel/src/task/switch.S`

`__switch(current, next)` 保存当前任务的 `ra`、`sp`、`s0..s11`，再从 next 上下文恢复这些寄存器并 `ret`。因为本实验只在正常函数调用边界做协作式切换，所以第一版不保存临时寄存器、浮点寄存器或完整 trap frame。

QEMU 中 3 个任务按如下顺序交替执行：

```text
[Lab5] task A step 1
[Lab5] task B step 1
[Lab5] task C step 1
[Lab5] task A step 2
[Lab5] task B step 2
[Lab5] task C step 2
[Lab5] scheduler finished
[Lab5] PASS
```

## 测试覆盖

主机单元测试覆盖：

- `TaskContext::goto` 初始化。
- 任务注册和重复 id 拒绝。
- round-robin 选择顺序。
- Exited 任务跳过。
- `yield` 状态变化建模。

QEMU 测试覆盖：

- Lab4 仍能通过。
- Stage 1、Stage 2 marker 存在。
- 三个任务真实交替输出。
- 调度器结束并输出 `[Lab5] PASS`。

## 安全前提

本实验中的 `unsafe` 只用于：

- 访问固定任务栈数组。
- 访问单 hart 全局 `TaskManager`。
- 调用 RISC-V 汇编 `__switch`。

这些操作成立的前提是：Lab5 只运行在单 hart，任务主动 yield，不存在抢占式中断同时修改调度器，所有任务共享同一内核地址空间，且任务不使用浮点或向量上下文。
