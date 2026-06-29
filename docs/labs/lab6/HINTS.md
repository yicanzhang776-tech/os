# Lab6 分级提示

请先独立尝试。每个任务只在卡住时逐级查看提示。

## 任务一提示

### 提示 1：概念方向

进入用户态前，内核要准备“从哪里开始执行”和“以什么特权级返回”。

### 提示 2：相关文件和函数

查看：

- `UserContext::new`
- `uses_user_privilege`
- `enables_interrupts_after_sret`

### 提示 3：接近实现的步骤

- `sepc` 应等于用户入口。
- `sstatus` 中 SPP 位应为 0。
- `sstatus` 中 SPIE 位应为 1。

## 任务二提示

### 提示 1：概念方向

syscall 分发只是把“编号 + 参数”转换成一个内核能理解的操作。

### 提示 2：相关文件和函数

查看：

- `SyscallRequest`
- `SYS_WRITE`
- `SYS_YIELD`
- `SYS_EXIT`
- `dispatch`

### 提示 3：接近实现的步骤

- `SYS_WRITE` 使用第三个参数作为写入长度。
- `SYS_YIELD` 不需要额外参数。
- `SYS_EXIT` 使用第一个参数作为退出码。
- 未知编号仍返回 `UnknownSyscall`。

## 任务三提示

### 提示 1：概念方向

用户程序执行 `ecall` 后，内核 trap handler 必须识别它来自 U-mode。

### 提示 2：相关文件和函数

查看：

- 用户入口汇编中的 `ecall`
- trap handler 中读取 `scause/sepc`
- syscall 分发后的返回路径

### 提示 3：接近实现的步骤

- 处理 `ecall from U-mode`。
- 读取 `a7` 和 `a0..a5`。
- 分发 syscall。
- 将 `sepc` 加 4，跳过当前 `ecall`。
- `exit` 后回到内核并输出 `[Lab6] PASS`。
