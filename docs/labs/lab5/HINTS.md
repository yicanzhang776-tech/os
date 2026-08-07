# Lab5 分级提示

请先独立尝试。每个任务只在卡住时逐级查看提示。

## 任务一提示

### 提示 1：概念方向

任务刚被创建时，并不是立即运行。它需要一个初始上下文，让第一次被调度时像“从某个函数返回”一样跳到任务入口。

### 提示 2：相关文件和函数

查看：

- `TaskContext::goto`
- `TaskControlBlock::new`
- `TaskManager::add_task`
- `task_stack_top`

### 提示 3：接近实现的步骤

- `ra` 应该来自任务入口地址。
- `sp` 应该来自任务栈顶，并清掉低 4 位以满足 16 字节对齐。
- `add_task` 先检查 id 范围，再检查对应槽位是否为空，最后写入 TCB。

## 任务二提示

### 提示 1：概念方向

round-robin 的关键是“从上一次之后的位置继续找”，而不是每次都从任务 0 开始。

### 提示 2：相关文件和函数

查看：

- `TaskStatus`
- `TaskManager::fetch_next`
- `TaskManager::run_next`
- `yield_now`
- `schedule`

### 提示 3：接近实现的步骤

- 从 `next_scan` 开始最多检查 `MAX_TASKS` 次。
- 找到 Ready 任务后，把 `next_scan` 设为下一个位置。
- `run_next` 把旧 Running 任务视情况改回 Ready，再把新任务改成 Running。
- `yield_now` 只适用于当前已经有 Running 任务的情况。

## 任务三提示

### 提示 1：概念方向

`__switch` 不创建任务，只是在两个已经存在的 `TaskContext` 之间保存和恢复寄存器。

### 提示 2：相关文件和函数

查看：

- `kernel/src/task/switch.S`
- `TaskContext { ra, sp, s }`
- RISC-V calling convention 中的 callee-saved 寄存器。

### 提示 3：接近实现的步骤

- current 指针指向旧任务上下文，next 指针指向新任务上下文。
- 依次保存 `ra`、`sp`、`s0..s11` 到 current。
- 依次从 next 恢复 `ra`、`sp`、`s0..s11`。
- 最后 `ret`，让 CPU 回到新任务的 `ra`。

提示 3 仍然没有给出完整汇编偏移，请结合 `TaskContext` 的字段顺序自己计算。
