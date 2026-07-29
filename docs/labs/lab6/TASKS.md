# Lab6 任务书

Lab6 只包含三个基础任务。请按顺序完成，每一步都可以独立运行测试。

## 任务一：用户态上下文边界

### 学习目标

- 理解 `sepc` 保存用户程序入口。
- 理解用户栈需要 16 字节对齐。
- 理解 `sstatus.SPP=0` 和 `SPIE=1` 对 `sret` 的意义。

### 背景知识

RISC-V 中，S-mode 准备好 `sepc` 和 `sstatus` 后执行 `sret`，CPU 会跳转到 `sepc` 指向的位置，并根据 SPP 决定返回到 U-mode 还是 S-mode。

### 需要阅读的文件

- `kernel/src/user.rs`

### 允许修改的文件

- `kernel/src/user.rs`

### 禁止修改的文件

- `kernel/src/task/`
- `kernel/src/memory/`
- `scripts/test-lab6.ps1`

### 需要补全的 TODO

- `TODO(LAB6-T1)` in `UserContext::new`

### 推荐完成顺序

1. 将 `sepc` 设置为用户入口地址。
2. 将用户栈顶按 16 字节对齐。
3. 清除 SPP，使 `sret` 返回 U-mode。
4. 设置 SPIE，使返回后中断使能状态正确。

### 运行命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 1
```

### 预期输出

```text
[Lab6-T1] user context ready
[Lab6-T1] PASS
```

### 常见错误

- 忘记设置 `sepc`。
- 把 SPP 设置成 1，导致仍返回 S-mode。
- 栈顶没有按 16 字节对齐。

### 思考题

- 为什么 `sret` 使用 `sepc` 而不是普通函数返回地址？
- 如果用户栈没有映射，会发生什么？

## 任务二：系统调用 ABI

### 学习目标

- 理解 `a7` 传递 syscall id。
- 理解 `a0..a5` 传递最多 6 个参数。
- 实现 `write/yield/exit` 的最小分发。

### 背景知识

用户程序通过 `ecall` 进入内核。内核读取寄存器中的 syscall id 和参数，再执行对应服务。

### 需要阅读的文件

- `kernel/src/syscall.rs`

### 允许修改的文件

- `kernel/src/syscall.rs`

### 禁止修改的文件

- `kernel/src/trap.rs` 中与 Lab2 已完成的 trap 基础逻辑。

### 需要补全的 TODO

- `TODO(LAB6-T2)` in `dispatch`

### 推荐完成顺序

1. 识别 `SYS_WRITE` 并返回写入字节数。
2. 识别 `SYS_YIELD` 并返回 yield 结果。
3. 识别 `SYS_EXIT` 并返回退出码。
4. 未知 syscall 保持明确错误。

### 运行命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 2
```

### 预期输出

```text
[Lab6-T2] syscall ABI ready
[Lab6-T2] PASS
```

### 常见错误

- 把 syscall id 从 `a0` 读取，而不是 `a7`。
- 忘记保留未知 syscall 的错误分支。
- `write` 没有返回实际处理的字节数。

### 思考题

- 为什么 syscall 返回值通常放回 `a0`？
- `yield` 在只有一个用户程序时还有什么教学意义？

## 任务三：最小用户程序验收

### 学习目标

- 理解用户程序如何通过 `ecall` 进入内核。
- 理解处理 `ecall` 后必须推进 `sepc`。
- 观察用户程序输出和退出。

### 背景知识

如果 `sepc` 不向后推进，返回用户态后会再次执行同一条 `ecall`，导致重复进入内核。

### 需要阅读的文件

- `kernel/src/user.rs`
- `kernel/src/syscall.rs`
- `kernel/src/trap.rs`

### 允许修改的文件

- `kernel/src/user.rs`
- `kernel/src/syscall.rs`
- 必要时修改 Lab6 标记清晰的 trap 处理路径

### 禁止修改的文件

- Lab7 文件系统相关模块

### 运行命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
```

### 预期输出

```text
[Lab6] user program: hello
[Lab6] syscall write handled
[Lab6] syscall exit handled
[Lab6] PASS
```

### 常见错误

- `ecall` 后没有推进 `sepc`。
- 用户代码页没有 U 权限。
- 用户栈没有映射为用户可读写。

### 思考题

- ELF 加载器会比内置用户程序多解决哪些问题？
- 用户指针校验为什么不能只看地址是否非零？
