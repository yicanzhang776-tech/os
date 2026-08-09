# Lab2 分级提示

请先独立完成任务。每个任务的提示从概念到接近实现逐级变具体，但不会给出完整参考答案。

## 任务一提示：设置 trap 入口与 `stvec`

提示 1：概念方向

- `stvec` 告诉 CPU：S-mode 发生 trap 时跳到哪里。
- 本实验先使用 direct 模式，入口地址就是一个函数或汇编标签的地址。

提示 2：相关文件和函数

- 看 `kernel/src/trap.rs` 的 `init`。
- 看 `is_trap_entry_installed` 如何被 `kernel/src/main.rs` 用来决定是否输出 Stage 1 marker。

提示 3：接近实现的步骤

1. 准备一个 trap 入口符号。
2. 把入口地址写入 `stvec`。
3. 用一个小状态标记记录初始化成功。

## 任务二提示：读取并解释 `scause/sepc/stval`

提示 1：概念方向

- `scause` 包含 trap 类型和原因码。
- `sepc` 是异常发生时的指令地址。
- `stval` 是辅助信息，不同异常含义不同。

提示 2：相关文件和函数

- 看 `trigger_demo_exception`。
- 看 `was_demo_decoded`。
- breakpoint 对应的 exception code 是固定值。

提示 3：接近实现的步骤

1. 在设置 `stvec` 后执行一条受控 `ebreak`。
2. 在 trap 路径里读取三个 CSR。
3. 判断 `scause` 是否表示 breakpoint。

## 任务三提示：推进 `sepc` 并返回

提示 1：概念方向

- 已处理的异常指令不能再次执行。
- 对普通 32 位 `ebreak`，返回前应让 `sepc` 指向下一条指令。

提示 2：相关文件和函数

- 看 `was_demo_handled`。
- 看 `lab2_success_marker`。
- 如果返回后能继续执行，`main.rs` 才会输出最终 marker。

提示 3：接近实现的步骤

1. 只在确认是 breakpoint 后修改 `sepc`。
2. 将 `sepc` 加 4。
3. 从 trap 返回，让 `kernel_main` 继续运行。
