# Lab1 参考答案说明

本文件面向教师和助教，用于讲解 Lab1 的参考实现。请不要把本文件直接放给学生作为 starter 材料。

## 任务一：理解内核启动流程

实现思路：

- `kernel/linker.ld` 中的 `ENTRY(_start)` 指向启动入口。
- `kernel/src/boot.rs` 在汇编中设置启动栈，然后跳转到 Rust 的 `kernel_main`。
- `kernel_main` 开始执行后，先使用 `raw_print_line` 输出任务一标志，避免依赖学生在任务二中实现的 console 接口。

关键代码位置：

- `kernel/src/main.rs`：`lab1_task1_kernel_entered_marker`
- `kernel/src/main.rs`：`lab1_task1_pass_marker`
- `kernel/src/console.rs`：`raw_print_line`

为什么这样实现：

- 任务一的目标是确认启动路径，不应该被任务二的 console 实现阻塞。
- `raw_print_line` 是教学基础设施，只用于阶段测试和教师验收，不作为学生需要实现的接口。

常见错误：

- 学生只输出 `[Lab1-T1] PASS`，漏掉 `[Lab1-T1] kernel entered`。
- 学生误改 `boot.rs` 或链接脚本，导致内核无法进入 `kernel_main`。

与 starter 的差异：

- starter 中两个任务一 marker 返回 TODO 字符串。
- solution 中它们分别返回 `[Lab1-T1] kernel entered` 和 `[Lab1-T1] PASS`。

实际运行结果：

```text
[Lab1-T1] kernel entered
[Lab1-T1] PASS
```

## 任务二：实现 SBI 字符与字符串输出

实现思路：

- `console_putchar` 只负责输出一个字节，直接调用 `sbi::console_putchar`。
- `console_write` 遍历字符串的字节序列，并逐字节调用 `console_putchar`。
- `print_line` 在字符串末尾补一个换行符。

关键代码位置：

- `kernel/src/console.rs`：`console_putchar`
- `kernel/src/console.rs`：`console_write`
- `kernel/src/console.rs`：`print_line`

为什么这样实现：

- 裸机内核没有标准库输出能力，SBI 是当前阶段最小、稳定的输出接口。
- 逐字节输出便于本科生直接理解，不引入格式化宏或缓冲区。

常见错误：

- 在 `console_write` 中写死测试字符串，而不是输出参数 `message`。
- 忘记在 `print_line` 末尾输出换行。
- 修改 `sbi.rs` 中的底层调用，破坏后续实验基础。

与 starter 的差异：

- starter 的 `console_putchar` 和 `console_write` 是明确 TODO 占位。
- solution 完整实现两个接口，并让 Stage 2 输出稳定通过标志。

实际运行结果：

```text
[Lab1-T2] console ready
[Lab1-T2] PASS
```

## 任务三：完成启动日志与正常关机

实现思路：

- 在任务一和任务二通过后，输出 Lab1 的完整启动日志。
- `lab1_success_marker` 返回唯一最终成功标志 `[Lab1] PASS`。
- `kernel_main` 最后调用 `sbi::shutdown()`，让 QEMU 正常退出。

关键代码位置：

- `kernel/src/main.rs`：`kernel_main`
- `kernel/src/main.rs`：`lab1_success_marker`
- `kernel/src/sbi.rs`：`shutdown`

为什么这样实现：

- 自动测试需要稳定、唯一的成功标志。
- 正常关机能避免 QEMU 挂起，也能让 CI 根据退出码判断结果。

常见错误：

- 提前在 starter 中输出 `[Lab1] PASS`。
- 删除 `sbi::shutdown()`，导致测试超时。
- 修改测试脚本来绕过失败，而不是完成实验代码。

与 starter 的差异：

- starter 的最终 marker 是 TODO。
- solution 输出 `[Lab1] start`、`[Lab1] console ready` 和 `[Lab1] PASS`，并正常关机。

实际运行结果：

```text
[Lab1] start
[Lab1] console ready
[Lab1] PASS
```

## 测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 3
```

默认命令等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```
