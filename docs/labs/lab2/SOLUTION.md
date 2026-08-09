# Lab2 参考答案说明

本文件面向教师和助教，用于讲解 Lab2 的参考实现。请不要把本文件直接放给学生作为 starter 材料。

## 任务一：设置 trap 入口与 `stvec`

实现思路：

- 使用 `global_asm!` 定义 `__trap_entry`。
- `trap::init` 将 `__trap_entry` 地址写入 `stvec`。
- 写入成功后记录 `TRAP_ENTRY_INSTALLED`，供 Stage 1 验证。

关键代码位置：

- `kernel/src/trap.rs`：`__trap_entry`
- `kernel/src/trap.rs`：`init`
- `kernel/src/trap.rs`：`is_trap_entry_installed`

为什么这样实现：

- 本实验只需要 direct 模式，避免在第一个 trap 实验里引入 vectored 模式复杂度。
- `__trap_entry` 位于内核镜像中，对齐且可执行，适合作为 S-mode trap 入口。

常见错误：

- 写错入口地址，导致 trap 后跳到无效位置。
- 忘记入口汇编需要保存寄存器。
- 把 `stvec` 当成异常返回地址使用。

实际运行结果：

```text
[Lab2-T1] stvec configured
[Lab2-T1] PASS
```

## 任务二：读取并解释 `scause/sepc/stval`

实现思路：

- `trigger_demo_exception` 执行一条固定 32 位 `ebreak`。
- trap 入口读取 `scause`、`sepc`、`stval`，并把它们作为参数传给 Rust handler。
- Rust handler 判断 `scause` 不是 interrupt，且 cause code 为 breakpoint。

关键代码位置：

- `kernel/src/trap.rs`：`trigger_demo_exception`
- `kernel/src/trap.rs`：`rust_trap_handler`
- `kernel/src/trap.rs`：`was_demo_decoded`

为什么这样实现：

- 固定 breakpoint 是可控异常，适合做第一次 trap 实验。
- 先完成“识别异常”，再处理返回路径，能降低学习压力。

常见错误：

- 没有屏蔽 `scause` 的 interrupt bit。
- 把任意异常都当作 breakpoint。
- 读取 CSR 后没有保存状态，导致 Stage 2 无法验证。

实际运行结果：

```text
[Lab2-T2] breakpoint decoded
[Lab2-T2] PASS
```

## 任务三：推进 `sepc` 并从 breakpoint 返回

实现思路：

- 对确认过的 32 位 breakpoint，把 `sepc` 改为原值加 4。
- trap 入口恢复寄存器后执行 `sret`。
- 返回后 `kernel_main` 继续运行，输出最终成功标志。

关键代码位置：

- `kernel/src/trap.rs`：`write_sepc`
- `kernel/src/trap.rs`：`rust_trap_handler`
- `kernel/src/main.rs`：`lab2_success_marker`

为什么这样实现：

- 如果 `sepc` 不推进，`sret` 后会再次执行同一条 `ebreak`。
- 当前演示使用 `.4byte 0x00100073` 固定 32 位 `ebreak`，所以推进 4 字节。

常见错误：

- 忘记推进 `sepc`，导致重复异常。
- 推进错误字节数，导致返回到错误指令。
- 未恢复寄存器就 `sret`，破坏调用现场。

实际运行结果：

```text
[Lab2] breakpoint handled
[Lab2] PASS
```

## unsafe 和汇编安全前提

- `__trap_entry` 是内核镜像内的对齐入口，写入 `stvec` 前不会被释放或移动。
- trap 入口保存并恢复当前实验会用到的通用寄存器。
- `trigger_demo_exception` 在 `init` 之后调用，确保 `stvec` 已安装。
- `write_sepc(sepc + 4)` 只用于本实验固定的 32 位 `ebreak`。

## 测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 3
```
