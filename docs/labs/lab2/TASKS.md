# Lab2 任务书

本实验只有 3 个必做任务。请按顺序完成，不要一开始就直接输出最终 `[Lab2] PASS`。

每完成一个任务就运行对应 `-Stage`。`-ExpectIncomplete` 只供教师检查未修改的 starter 起点，不是学生完成任务后的验收命令。

## 任务一：设置 trap 入口与 `stvec`

学习目标：

- 理解 `stvec` 的作用。
- 知道异常发生后 CPU 会跳转到 trap 入口。
- 建立 trap 初始化的最小路径。

背景知识：

- `stvec` 是 S-mode trap vector base address register。
- 当前实验只需要 direct 模式，不要求 vectored 模式。
- trap 入口必须指向可执行代码地址。

需要阅读的文件：

- `kernel/src/trap.rs`
- `kernel/src/main.rs`

允许修改：

- `kernel/src/trap.rs`
- `kernel/src/main.rs` 中标记为 `TODO(LAB2-T1)` 的边界

禁止修改：

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `scripts/test-lab2.ps1`

需要补全的 TODO：

- `kernel/src/trap.rs` 中的 `TODO(LAB2-T1)`：`init`
- `kernel/src/trap.rs` 中的 `TODO(LAB2-T1)`：`is_trap_entry_installed`

推荐完成顺序：

1. 确认 trap 入口函数或入口汇编的位置。
2. 在 `init` 中写入 `stvec`。
3. 让 `is_trap_entry_installed` 能反映初始化是否完成。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 1
```

预期输出：

```text
[Lab2-T1] stvec configured
[Lab2-T1] PASS
```

验收标准：

- Stage 1 测试通过。
- 没有提前输出 `[Lab2] PASS`。
- 能说明 `stvec` 的作用。

常见错误：

- 写入的 trap 入口地址未对齐。
- 把 `stvec` 和 `sepc` 的作用混淆。
- 为了过测试直接打印 Stage 1 marker，而没有真正设置入口。

思考题：

- direct 模式和 vectored 模式有什么区别？
- 为什么 trap 入口也需要遵守调用约定或保存必要上下文？

## 任务二：读取并解释 `scause/sepc/stval`

学习目标：

- 理解 `scause` 表示异常或中断原因。
- 理解 `sepc` 保存异常发生时的 PC。
- 理解 `stval` 在不同异常中的辅助信息。

背景知识：

- `ebreak` 会触发 breakpoint 异常。
- 当前实验使用固定 breakpoint 作为可控异常。
- 只识别这一类异常，不扩展系统调用。

需要阅读的文件：

- `kernel/src/trap.rs`
- `kernel/src/main.rs`

允许修改：

- `kernel/src/trap.rs`

禁止修改：

- `scripts/test-lab2.ps1`
- Lab3 及后续模块

需要补全的 TODO：

- `kernel/src/trap.rs` 中的 `TODO(LAB2-T2)`：`trigger_demo_exception`
- `kernel/src/trap.rs` 中的 `TODO(LAB2-T2)`：`was_demo_decoded`

推荐完成顺序：

1. 在已配置 `stvec` 的前提下触发一个受控 `ebreak`。
2. 在 trap 处理路径中读取 `scause`、`sepc`、`stval`。
3. 确认异常原因是 breakpoint。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 2
```

预期输出：

```text
[Lab2-T2] breakpoint decoded
[Lab2-T2] PASS
```

验收标准：

- Stage 2 测试通过。
- Stage 1 输出仍然存在。
- 能解释 `scause/sepc/stval` 的含义。

常见错误：

- 没有区分 interrupt bit 和 exception code。
- 读取了 CSR，但没有判断 breakpoint 类型。
- 触发异常后没有进入预期 trap 处理路径。

思考题：

- 为什么同一个 trap 入口可以处理很多不同异常？
- `stval` 对 breakpoint 异常一定有有用值吗？

## 任务三：推进 `sepc` 并从 breakpoint 返回

学习目标：

- 理解异常返回地址的意义。
- 知道处理 32 位 `ebreak` 后需要 `sepc += 4`。
- 让内核从 trap 返回后继续执行。

背景知识：

- 如果不推进 `sepc`，返回后会再次执行同一条 `ebreak`，造成重复异常。
- 当前实验只处理 32 位 `ebreak`，压缩指令情况留作思考题。
- `[Lab2] PASS` 必须在异常处理后继续执行的路径上输出。

需要阅读的文件：

- `kernel/src/trap.rs`
- `kernel/src/main.rs`

允许修改：

- `kernel/src/trap.rs`
- `kernel/src/main.rs` 中标记为 `TODO(LAB2-T3)` 的最终 marker

禁止修改：

- `scripts/test-lab2.ps1`
- 任何 Lab3 及后续功能

需要补全的 TODO：

- `kernel/src/trap.rs` 中的 `TODO(LAB2-T3)`：`was_demo_handled`
- `kernel/src/main.rs` 中的 `TODO(LAB2-T3)`：`lab2_success_marker`

推荐完成顺序：

1. 在 breakpoint handler 中确认异常已识别。
2. 把 `sepc` 推进 4 字节。
3. 返回后确认内核继续输出最终成功标志。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 3
```

预期输出：

```text
[Lab2] breakpoint handled
[Lab2] PASS
```

验收标准：

- 默认 Lab2 测试通过。
- QEMU 退出码为 0。
- 输出包含 Stage 1、Stage 2 和最终 Lab2 的成功标志。

常见错误：

- 忘记推进 `sepc`，导致重复进入 trap。
- 推进错误字节数，导致返回地址不正确。
- 只打印 `[Lab2] PASS`，没有真正触发和处理 breakpoint。

思考题：

- 如果 `ebreak` 是 16 位压缩指令，`sepc` 应该怎么处理？
- 为什么系统调用也可以复用 trap 返回机制？
