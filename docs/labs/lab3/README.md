# Lab3：物理内存管理

本实验在 Lab2 的 trap 基础上，引入 4 KiB 物理页和物理页帧分配器。你会先完成纯地址计算，再实现一个教学用的物理页分配器，最后补齐释放、复用和错误检查。

推荐学习闭环：先预测地址与分配器事件，再运行当前分支；完成每项任务后执行对应 `-Stage`，最后回放证据并填写教学反馈。反馈不计分。

## 学习目标

- 理解物理地址 `PhysAddr` 和物理页号 `PhysPageNum` 的区别。
- 掌握 4 KiB 页大小、页内偏移、向下取整和向上取整。
- 理解为什么不能分配内核镜像和启动栈占用的物理页。
- 实现一个最小可测试的物理页帧分配器。

## 前置知识

- 已完成 Lab2，QEMU 和 trap 演示能够稳定运行。
- Rust `struct`、`Option`、`Result`、简单 enum。
- 半开区间 `[start, end)`。

## 三个任务

1. **完成物理地址和页号转换**：实现 `floor`、`ceil`、`page_offset` 和 `start_address`。
2. **初始化分配器并完成基本分配**：实现 `init` 和 `alloc`，能从半开区间中顺序分配页。
3. **完成释放、复用和错误检查**：实现 `dealloc`，处理释放后复用、非法释放和重复释放。

## 推荐学习顺序

1. 阅读 `kernel/src/memory/address.rs`。
2. 完成任务一并运行 Stage 1。
3. 阅读 `kernel/src/memory/frame_allocator.rs`。
4. 完成任务二并运行 Stage 2。
5. 补齐释放和错误检查，运行 Stage 3。

## 文档导航

- [TASKS.md](TASKS.md)：每个任务的具体要求。
- [HINTS.md](HINTS.md)：分级提示，卡住时再看。
- [TESTING.md](TESTING.md)：环境、构建、QEMU 和 Stage 测试说明。

## 完成标准

最终运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
```

应看到 QEMU 输出包含：

```text
[Lab3-T1] address types ready
[Lab3-T1] PASS
[Lab3-T2] allocator can allocate
[Lab3-T2] PASS
[Lab3] frame allocator ready
[Lab3] PASS
```
