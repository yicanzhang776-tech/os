# Lab7 分级提示

不要一开始就看提示 3。先尝试阅读任务书和代码 TODO。

## 任务一提示

提示 1：概念方向

RAM 设备就是一个固定长度字节数组。读写都只是在数组切片和参数切片之间复制。

提示 2：相关文件和函数

看 `kernel/src/drivers/mod.rs` 中的 `RamDevice::read_at`、`RamDevice::write_at` 和 `DeviceError::OutOfBounds`。

提示 3：接近实现的步骤

先计算结束位置，再判断它是否超过 `self.bytes.len()`。合法时用两个相同长度的切片互相复制，并返回实际读写长度。

## 任务二提示

提示 1：概念方向

fd 表可以理解成一个固定大小数组。每个槽位记录这个 fd 是否打开，以及当前读写偏移。

提示 2：相关文件和函数

看 `kernel/src/fs/mod.rs` 中的 `FIRST_FILE_DESCRIPTOR`、`MAX_OPEN_FILES` 和 `SimpleFs`。

提示 3：接近实现的步骤

`open` 找空槽位，返回 `FIRST_FILE_DESCRIPTOR + index`。`read/write` 先把 fd 转回 index，再检查槽位是否打开，然后调用设备层并更新 offset。

## 任务三提示

提示 1：概念方向

用户程序不能直接访问内核对象，它只能通过 syscall id 和寄存器参数请求内核完成文件操作。

提示 2：相关文件和函数

看 `kernel/src/syscall.rs` 的 syscall id，`kernel/src/trap.rs` 的 `handle_user_ecall`，以及 `kernel/src/user.rs` 中的内置用户程序。

提示 3：接近实现的步骤

在 syscall 分发中识别 open/read/write/close。trap handler 根据返回值打印 Lab7 验收 marker。用户程序按 open -> write -> read -> close -> exit 的顺序触发系统调用。
