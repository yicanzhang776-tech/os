# Lab7 任务书

## 任务一：RAM 字节设备

学习目标：

- 理解设备可以先抽象成按 offset 读写的字节数组。
- 学会对读写范围做边界检查。
- 明确设备层只关心字节，不关心 fd 和文件偏移。

需要阅读的文件：

- `kernel/src/drivers/mod.rs`

允许修改：

- `kernel/src/drivers/mod.rs`

禁止修改：

- QEMU 测试脚本的判定逻辑。
- Lab1-Lab6 的成功标志。

需要补全的 TODO：

- `TODO(LAB7-T1)`：`RamDevice::read_at`
- `TODO(LAB7-T1)`：`RamDevice::write_at`

推荐顺序：

1. 判断 `offset + len` 是否超过设备容量。
2. 越界时返回 `DeviceError::OutOfBounds`。
3. 合法时在 `bytes` 数组和传入 buffer 之间复制数据。

运行命令：

```powershell
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
```

预期输出：

```text
[Lab7-T1] ram device ready
[Lab7-T1] PASS
```

常见错误：

- 忘记检查越界。
- `read_at` 和 `write_at` 的复制方向写反。
- 返回写入长度时使用了设备总容量。

思考题：

- 为什么设备层不应该知道文件描述符？
- 如果设备容量变大，哪些逻辑不需要修改？

## 任务二：简化文件系统与 fd 表

学习目标：

- 理解 fd 表如何把整数 fd 映射到打开的文件。
- 理解文件偏移会随 read/write 前进。
- 学会处理 invalid fd、重复 close 等错误。

需要阅读的文件：

- `kernel/src/fs/mod.rs`
- `kernel/src/drivers/mod.rs`

允许修改：

- `kernel/src/fs/mod.rs`

需要补全的 TODO：

- `TODO(LAB7-T2)`：`SimpleFs::open`
- `TODO(LAB7-T2)`：`SimpleFs::read`
- `TODO(LAB7-T2)`：`SimpleFs::write`
- `TODO(LAB7-T2)`：`SimpleFs::close`

推荐顺序：

1. 设计固定容量 fd 表槽位。
2. `open` 返回第一个可用 fd。
3. `read`/`write` 使用并更新当前偏移。
4. `close` 释放槽位，重复 close 返回错误。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
```

预期输出：

```text
[Lab7-T2] simple fs ready
[Lab7-T2] PASS
```

常见错误：

- `close` 后仍允许读写。
- 读写后没有更新偏移。
- fd 数值和数组下标转换错误。

思考题：

- 为什么真实 OS 通常会区分文件对象和 fd 表项？
- 如果支持多个文件名，`open` 应增加哪些参数？

## 任务三：用户态文件 I/O 验收

学习目标：

- 理解用户程序如何通过系统调用访问文件系统。
- 区分 console write 和 file write。
- 用稳定 marker 支持自动验收。

需要阅读的文件：

- `kernel/src/syscall.rs`
- `kernel/src/trap.rs`
- `kernel/src/user.rs`
- `kernel/src/fs/mod.rs`

允许修改：

- `kernel/src/syscall.rs`
- `kernel/src/trap.rs`
- `kernel/src/user.rs`
- 必要时修改 `kernel/src/fs/mod.rs`

验收命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

预期输出：

```text
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

常见错误：

- 复用 Lab6 的 `write` 时没有区分 fd。
- 用户程序触发了错误 syscall id。
- QEMU 已启动但没有执行到 Lab7 路径。

思考题：

- 为什么真实系统需要检查用户缓冲区地址？
- 为什么本实验把复杂路径解析放到扩展任务？
