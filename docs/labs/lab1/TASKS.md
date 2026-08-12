# Lab1 任务书

> 每个任务先观察本地事件，再按需手动询问教学助教。助教只能提供验证思路，不应给出可复制答案；仍以 `-Stage 1/2/3` 和代码审查为准。

本实验只有 3 个必做任务。请按顺序完成，不要一次跳到最终成功标志。

每完成一个任务就运行对应 `-Stage`。`-ExpectIncomplete` 只供教师检查未修改的 starter 起点，不是学生完成任务后的验收命令。

## 任务一：理解内核启动流程

学习目标：

- 认识 `_start`。
- 理解启动栈 `BOOT_STACK`。
- 理解链接脚本 `ENTRY(_start)`。
- 理解从汇编跳转到 Rust `kernel_main` 的过程。

背景知识：

- QEMU 先启动 OpenSBI。
- OpenSBI 再跳转到内核入口地址。
- 链接脚本决定入口符号，`boot.rs` 负责设置栈并跳转到 Rust。

需要阅读的文件：

- `kernel/linker.ld`
- `kernel/src/boot.rs`
- `kernel/src/main.rs`

允许修改：

- `kernel/src/main.rs`

禁止修改：

- `kernel/linker.ld`
- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `scripts/test-lab1.ps1`

需要补全的 TODO：

- `kernel/src/main.rs` 中的 `TODO(LAB1-T1)`：`lab1_task1_kernel_entered_marker`
- `kernel/src/main.rs` 中的 `TODO(LAB1-T1)`：`lab1_task1_pass_marker`

推荐完成顺序：

1. 找到 `ENTRY(_start)`。
2. 找到 `boot.rs` 中跳转到 `kernel_main` 的位置。
3. 在 `main.rs` 中把任务一的两个占位标记改成实验要求的输出。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 1
```

预期输出：

```text
[Lab1-T1] kernel entered
[Lab1-T1] PASS
```

验收标准：

- Stage 1 测试通过。
- 不修改启动汇编和链接脚本。
- 能用自己的话说明 `_start -> kernel_main` 的路径。

常见错误：

- 把 OpenSBI 的输出误认为内核输出。
- 修改 `boot.rs` 导致栈没有正确设置。
- 只输出 `[Lab1-T1] PASS`，但没有输出 `[Lab1-T1] kernel entered`。

思考题：

- 为什么 `_start` 必须在链接脚本中作为入口？
- 为什么进入 Rust 之前要设置栈？

## 任务二：实现 SBI 字符与字符串输出

学习目标：

- 理解 SBI console 调用。
- 理解裸机环境没有 `println!`。
- 实现字符输出和字符串输出的最小接口。

背景知识：

- `kernel/src/sbi.rs` 封装了真正的 SBI `ecall`。
- `kernel/src/console.rs` 应该提供更适合内核使用的输出接口。
- 字符串输出本质上是逐字节输出。

需要阅读的文件：

- `kernel/src/sbi.rs`
- `kernel/src/console.rs`
- `kernel/src/main.rs`

允许修改：

- `kernel/src/console.rs`

禁止修改：

- `kernel/src/sbi.rs`
- `kernel/src/boot.rs`
- `scripts/test-lab1.ps1`
- `kernel/src/console.rs` 中的 `raw_print_line` 和 `raw_putchar`

需要补全的 TODO：

- `kernel/src/console.rs` 中的 `TODO(LAB1-T2)`：`console_putchar`
- `kernel/src/console.rs` 中的 `TODO(LAB1-T2)`：`console_write`

推荐完成顺序：

1. 阅读 `sbi::console_putchar` 的参数。
2. 让 `console_putchar` 调用 SBI 输出一个字节。
3. 让 `console_write` 遍历字符串字节并逐个输出。
4. 保持 `print_line` 在末尾输出换行符。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 2
```

预期输出：

```text
[Lab1-T2] console ready
[Lab1-T2] PASS
```

验收标准：

- Stage 2 测试通过。
- Stage 1 输出仍然存在。
- 没有修改 `sbi.rs` 中的汇编调用。

常见错误：

- 忘记输出换行符，导致日志粘在一行。
- 遍历 `chars()` 而不是 `bytes()`，让裸机输出逻辑变复杂。
- 在 `console_write` 中直接写死测试字符串，而不是输出传入的参数。

思考题：

- 为什么裸机内核不能直接使用标准库的 `println!`？
- 如果字符串里包含非 ASCII 字符，逐字节输出会发生什么？

## 任务三：完成启动日志与正常关机

学习目标：

- 组织完整启动流程。
- 使用 SBI reset 正常退出 QEMU。
- 理解自动化测试为什么需要稳定成功标志。

背景知识：

- 自动测试通过稳定 marker 判断实验是否完成。
- QEMU 需要内核主动调用 SBI system reset 才能正常退出。
- `[Lab1] PASS` 是最终成功标志，不应在前两个任务中提前输出。

需要阅读的文件：

- `kernel/src/main.rs`
- `kernel/src/sbi.rs`
- `scripts/test-lab1.ps1`

允许修改：

- `kernel/src/main.rs`

禁止修改：

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `scripts/test-lab1.ps1`

需要补全的 TODO：

- `kernel/src/main.rs` 中的 `TODO(LAB1-T3)`：`lab1_success_marker`

推荐完成顺序：

1. 确认 Stage 1 和 Stage 2 已通过。
2. 阅读 `kernel_main` 中最终启动日志的顺序。
3. 把最终成功标志改成 `[Lab1] PASS`。
4. 确认内核最后调用 `sbi::shutdown()`。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 3
```

预期输出：

```text
[Lab1] start
[Lab1] console ready
[Lab1] PASS
```

验收标准：

- 默认 Lab1 测试通过。
- QEMU 退出码为 0。
- 输出包含任务一、任务二和最终 Lab1 的成功标志。

常见错误：

- 只输出 `[Lab1] PASS`，漏掉前置任务 marker。
- 删除 `sbi::shutdown()`，导致 QEMU 超时。
- 为了通过测试修改测试脚本，而不是完成实验代码。

思考题：

- 为什么自动测试需要稳定字符串，而不是人工观察日志？
- 如果内核 panic 了，测试应该如何区分 panic 和正常退出？
