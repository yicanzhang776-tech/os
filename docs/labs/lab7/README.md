# Lab7 实验总览：设备与简化文件系统

Lab7 的目标是让学生理解操作系统如何把设备抽象成可读写对象，再通过文件描述符向用户程序提供统一接口。

推荐学习闭环：先预测 open/write/close/read 事件，再运行当前分支；完成每项任务后执行对应 `-Stage`，最后比较文件状态和运行证据。反馈不计分。

本实验只做教学版内存文件系统：

- 一个固定容量 RAM 字节设备。
- 一个单文件 `SimpleFs`。
- 固定容量 fd 表。
- 最小用户态文件 I/O 验收路径。

不做 virtio-block、真实磁盘、多目录、多进程文件表或复杂用户指针校验。

当前如果位于 `lab7-solution` 分支，还可以阅读：


## 前置知识

- Lab3：物理内存管理。
- Lab4：地址空间和用户页权限。
- Lab6：用户态进入、`ecall` 和系统调用分发。
- Rust 数组、切片、`Result` 和错误枚举。

## 学习路径

```mermaid
flowchart LR
    T1["任务一：RAM 字节设备"] --> T2["任务二：SimpleFs 与 fd 表"]
    T2 --> T3["任务三：用户态文件 I/O 验收"]
```

## 预计结果

starter 初始状态下：

```text
[Lab7] start
[Lab7-T1] TODO: implement RAM byte device
[Lab7-T2] TODO: implement simple file system
[Lab7] TODO: implement memory file system
```

完成后：

```text
[Lab7-T1] PASS
[Lab7-T2] PASS
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```
