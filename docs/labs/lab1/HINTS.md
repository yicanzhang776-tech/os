# Lab1 分级提示

先独立阅读任务书。只有卡住时再逐级查看提示。

## 任务一：理解内核启动流程

提示 1：概念方向

- 从链接脚本入口开始找。
- `_start` 不是 Rust 自动生成的，它来自 `boot.rs`。
- 进入 `kernel_main` 后，说明启动栈和跳转已经基本可用。

提示 2：相关文件和函数

- `kernel/linker.ld`：查看 `ENTRY(_start)`。
- `kernel/src/boot.rs`：查看 `_start` 和 `BOOT_STACK`。
- `kernel/src/main.rs`：查看两个 `TODO(LAB1-T1)` 函数。

提示 3：接近实现的步骤

1. 第一个任务一函数应返回“内核已经进入 Rust 入口”的 marker。
2. 第二个任务一函数应返回任务一通过 marker。
3. 不需要修改汇编，不需要修改链接脚本。

## 任务二：实现 SBI 字符与字符串输出

提示 1：概念方向

- `sbi.rs` 是底层固件接口。
- `console.rs` 是给内核其他模块使用的简洁接口。
- 输出字符串可以理解为“循环输出每一个字节”。

提示 2：相关文件和函数

- `kernel/src/sbi.rs`：`console_putchar(byte)` 已经负责 SBI 调用。
- `kernel/src/console.rs`：需要补全 `console_putchar` 和 `console_write`。
- `print_line` 应依赖 `console_write`，再输出换行。

提示 3：接近实现的步骤

1. `console_putchar` 接收一个 `u8`，把它转交给 SBI 字符输出。
2. `console_write` 遍历输入字符串的字节。
3. 对每个字节调用 `console_putchar`。
4. 不要在 `console_write` 中写死 `[Lab1-T2] PASS`。

## 任务三：完成启动日志与正常关机

提示 1：概念方向

- 任务三不是新增复杂功能，而是把前两个任务串成稳定启动流程。
- 测试脚本依赖 `[Lab1] PASS` 判断最终完成。
- 关机路径由 `sbi::shutdown()` 负责。

提示 2：相关文件和函数

- `kernel/src/main.rs`：查看 `kernel_main` 输出顺序。
- `kernel/src/main.rs`：查看 `TODO(LAB1-T3)`。
- `kernel/src/sbi.rs`：查看 `shutdown()` 的 SBI reset 调用。

提示 3：接近实现的步骤

1. 确认 Stage 1 和 Stage 2 都通过。
2. 让最终 marker 与测试文档要求一致。
3. 不要删除 `sbi::shutdown()`。
4. 不要把最终 marker 提前放进任务一或任务二。
