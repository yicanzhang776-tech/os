# Lab7 参考实现说明

本文供教师和助教使用。学生分支 `lab7-starter` 不应包含本文件。

## 任务一：RAM 字节设备

关键代码：

- `kernel/src/drivers/mod.rs`
- `RamDevice::read_at`
- `RamDevice::write_at`

实现思路：

1. 使用固定大小数组保存设备内容。
2. 通过 `checked_add` 计算 `offset + len`，避免整数溢出。
3. 范围超过容量时返回 `DeviceError::OutOfBounds`。
4. 合法时使用切片复制，并返回读写字节数。

为什么这样实现：

- 设备层只负责字节读写，不关心 fd、文件偏移或系统调用。
- 边界检查放在设备层可以避免上层传入非法范围时破坏内存。

实际输出：

```text
[Lab7-T1] ram device ready
[Lab7-T1] PASS
```

## 任务二：SimpleFs 与 fd 表

关键代码：

- `kernel/src/fs/mod.rs`
- `SimpleFs::open`
- `SimpleFs::read`
- `SimpleFs::write`
- `SimpleFs::close`

实现思路：

1. 使用固定容量 `open_files` 数组保存打开状态。
2. fd 从 `FIRST_FILE_DESCRIPTOR` 开始，转换成数组下标。
3. 每个打开文件保存独立 offset。
4. `read`/`write` 调用底层 `RamDevice` 并更新 offset。
5. `close` 清空槽位，重复 close 返回 `InvalidFileDescriptor`。

与 starter 的差异：

- starter 所有文件操作返回 `Unimplemented`。
- solution 完成 fd 分配、偏移维护、容量检查和错误 fd 检查。

实际输出：

```text
[Lab7-T2] simple fs ready
[Lab7-T2] PASS
```

## 任务三：用户态文件 I/O

关键代码：

- `kernel/src/syscall.rs`
- `kernel/src/trap.rs`
- `kernel/src/user.rs`
- `kernel/src/fs/mod.rs`

实现思路：

1. 保留 Lab6 的 `write=64` 和 `exit=93`。
2. 增加教学用 `open`，以及 `read=63`、`close=57`。
3. 用户程序按 open -> write -> close -> open -> read -> close -> exit 的顺序触发 syscall。
4. trap handler 校验固定用户缓冲区范围后调用全局 `SimpleFs`。
5. 读回内容等于测试字节时打印 `[Lab7] write/read verified`。

实际输出：

```text
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

## 常见错误

- 读写后没有更新 offset，导致读回内容为空或重复。
- fd 和数组下标转换 off-by-one。
- 关闭 fd 后仍允许 read/write。
- 文件 write 和 console write 混用，未根据 fd 分流。

## 安全前提

- 内核运行在单 hart。
- 只有一个内置用户程序。
- 用户缓冲区限制在教学用固定用户栈范围。
- 全局 `SimpleFs` 只在同步 syscall 路径中访问。

这些前提让实现保持中等难度，适合本科教学；更完整的权限和指针校验放入扩展任务。
