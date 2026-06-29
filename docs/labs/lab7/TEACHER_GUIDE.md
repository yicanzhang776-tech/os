# Lab7 教师指南

## 课程定位

Lab7 是本教学环境的收束实验。它把设备抽象、系统调用和用户程序串起来，让学生看到“文件 I/O”从用户态一路进入内核对象的最小闭环。

建议课时：2 到 3 次实验课。

## 课堂讲授重点

- 设备层：`ByteDevice` 只关心 offset 和字节数组。
- 文件系统层：fd 表把整数 fd 映射到打开文件状态。
- 系统调用层：用户程序只能通过 ABI 请求内核服务。
- 教学边界：本实验故意不做真实磁盘和复杂路径解析。

## 三个任务的验收

任务一：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
```

检查 `[Lab7-T1] PASS`。

任务二：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
```

检查 `[Lab7-T2] PASS`。

任务三：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

检查 `[Lab7] file opened`、`[Lab7] write/read verified` 和 `[Lab7] PASS`。

## 学生容易卡住的位置

- 不知道 fd 为什么从 3 开始。
- 把文件偏移放到 `RamDevice`，导致多个 fd 共享错误状态。
- 忘记 close 后槽位应重新可用。
- 对用户缓冲区范围校验理解不清。

## 如何判断是否直接复制答案

- 让学生口头解释 `fd - FIRST_FILE_DESCRIPTOR` 为什么要做边界检查。
- 修改测试字节长度，观察实现是否依赖硬编码。
- 要求学生画出 open/write/read/close 的状态变化。

## 可选扩展

- 支持两个固定文件。
- 增加只读文件。
- 增加 seek。
- 用 virtio-block 替换内存设备。

## 评分建议

- 任务一：30%
- 任务二：35%
- 任务三：25%
- 文档、解释和代码可读性：10%
