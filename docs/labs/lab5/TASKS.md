# Lab5 任务书

> 每个任务先观察本地事件，再按需手动询问教学助教。助教只能提供验证思路，不应给出可复制答案；仍以 `-Stage 1/2/3` 和代码审查为准。

Lab5 面向普通本科生，基础必做内容只拆成三个任务。请按顺序完成，前一个任务会为后一个任务提供基础。

每完成一个任务就运行对应 `-Stage`。`-ExpectIncomplete` 只供教师检查未修改的 starter 起点。

## 任务一：任务抽象与状态表

### 学习目标

- 理解 `TaskContext` 中 `ra`、`sp`、`s0..s11` 的作用。
- 理解任务栈、任务入口和 TCB 的关系。
- 能把一个任务加入固定容量任务表。

### 背景知识

RISC-V 函数调用约定要求被调用者保存 `s0..s11`，任务切换发生在正常函数调用边界时，可以先只保存 callee-saved 寄存器。

### 需要阅读的文件

- `kernel/src/task/mod.rs`
- `kernel/src/task/switch.S`

### 允许修改的文件

- `kernel/src/task/mod.rs`

### 禁止修改的文件

- `scripts/test-lab5.ps1`
- `kernel/src/memory/`
- `kernel/src/trap.rs`

### 需要补全的 TODO

- `TODO(LAB5-T1)` in `TaskContext::goto`
- `TODO(LAB5-T1)` in `TaskManager::add_task`

### 推荐完成顺序

1. 让 `TaskContext::goto(entry, stack_top)` 设置 `ra` 和 16 字节对齐后的 `sp`。
2. 在 `add_task` 中检查任务 id 是否有效。
3. 拒绝重复任务 id。
4. 将任务放入空槽并更新任务数量行为。

### 运行命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 1
```

### 预期输出

```text
[Lab5-T1] task table ready
[Lab5-T1] PASS
```

### 验收标准

- `TaskContext` 的 `ra` 指向任务入口。
- `sp` 是 16 字节对齐的任务栈顶。
- `add_task` 可以插入任务，并拒绝非法或重复任务。

### 常见错误

- 忘记对 `sp` 做 16 字节对齐。
- 允许重复任务 id 覆盖旧任务。
- 把任务入口函数当作普通返回函数处理。

### 思考题

- 为什么任务入口类型是 `extern "C" fn() -> !`？
- 为什么 starter 使用固定容量任务表？

## 任务二：协作式轮转调度

### 学习目标

- 理解 Ready、Running、Exited 三种状态。
- 实现 round-robin Ready 扫描。
- 理解主动 `yield` 与调度器的关系。

### 背景知识

协作式调度不会由时钟中断强行打断任务。任务必须主动调用 `yield_now`，调度器才会选择下一个 Ready 任务。

### 需要阅读的文件

- `kernel/src/task/mod.rs`

### 允许修改的文件

- `kernel/src/task/mod.rs`

### 禁止修改的文件

- `kernel/src/task/switch.S` 中的保存恢复逻辑暂不属于本任务。

### 需要补全的 TODO

- `TODO(LAB5-T2)` in `TaskManager::fetch_next`
- `TODO(LAB5-T2)` in `TaskManager::run_next`
- `TODO(LAB5-T2)` in `yield_now`
- `TODO(LAB5-T2)` in `schedule`

### 推荐完成顺序

1. `fetch_next` 从 `next_scan` 开始查找 Ready 任务。
2. 找到任务后更新下一次扫描起点。
3. `run_next` 把选中任务标记为 Running。
4. `yield_now` 把当前任务改回 Ready，再进入调度。

### 运行命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 2
```

### 预期输出

```text
[Lab5-T2] round robin ready
[Lab5-T2] PASS
```

### 验收标准

- Ready 任务按 0、1、2、0 的顺序被选择。
- Exited 任务不会再次被调度。
- 没有 Ready 任务时返回明确错误。

### 常见错误

- 每次都从 0 开始扫描，导致任务饥饿。
- `yield` 后没有把当前任务改回 Ready。
- Exited 任务仍被选中。

### 思考题

- 协作式调度为什么不能处理死循环任务？
- 如果加入优先级，`fetch_next` 会怎样变化？

## 任务三：上下文切换与 QEMU 验收

### 学习目标

- 理解 `__switch(current, next)` 的保存和恢复边界。
- 理解为什么只保存 `ra`、`sp`、`s0..s11`。
- 通过 QEMU 观察多个内核态任务交替执行。

### 背景知识

`__switch` 是少量汇编代码。它把当前任务的 callee-saved 寄存器保存到旧上下文，再从新上下文恢复寄存器并返回到新任务。

### 需要阅读的文件

- `kernel/src/task/switch.S`
- `kernel/src/task/mod.rs`

### 允许修改的文件

- `kernel/src/task/switch.S`
- `kernel/src/task/mod.rs`

### 禁止修改的文件

- `kernel/src/trap.rs`
- Lab6 用户态和系统调用模块

### 需要补全的 TODO

- `TODO(LAB5-T3)` in `kernel/src/task/switch.S`

### 推荐完成顺序

1. 保存 `ra`、`sp`、`s0..s11` 到 current。
2. 从 next 恢复 `ra`、`sp`、`s0..s11`。
3. 返回到新任务上下文。
4. 运行默认 Lab5 测试。

### 运行命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
```

### 预期输出

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

### 验收标准

- 三个任务按轮转顺序交替输出。
- 调度结束后输出 `[Lab5] PASS`。
- 不引入时钟中断抢占、用户态或系统调用。

### 常见错误

- 保存和恢复寄存器偏移不一致。
- 忘记保存 `ra`，导致返回地址错乱。
- 使用 boot stack 当作任务栈。

### 思考题

- 为什么不保存临时寄存器 `t0..t6`？
- 抢占式调度还需要保存哪些额外状态？
