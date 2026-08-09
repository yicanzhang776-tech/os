# Lab4：RISC-V Sv39 虚拟内存

本实验在 Lab3 物理页分配器基础上实现 Sv39 页表。学生会先完成虚拟地址和 PTE 解析，再实现页表映射查询，最后建立内核恒等映射并启用分页。

推荐学习闭环：先预测页表建立与 `satp` 激活事件，再运行当前分支；完成每项任务后执行对应 `-Stage`，最后回放证据并填写教学反馈。反馈不计分。

当前 `lab4-solution` 分支包含参考实现；学生起点请使用 `lab4-starter`。

## 学习目标

- 理解 Sv39 虚拟地址的 VPN[2]/VPN[1]/VPN[0] 和页内偏移。
- 理解页表项中的 PPN 和权限位。
- 实现最小 `map/unmap/translate`。
- 理解 `satp` 和 `sfence.vma` 的作用。
- 理解为什么第一版采用恒等映射。

## 三个任务

1. **Sv39 地址和 PTE 基础**：补全 `VirtAddr`、`VirtPageNum::indexes`、`PageTableEntry::ppn`。
2. **页表映射与查询**：补全 `find_pte_create`、`map`、`unmap`、`translate`。
3. **激活内核恒等映射**：建立必要内核映射，写入 `satp`，执行 `sfence.vma`，启用分页后继续输出。

## 文档导航

- [TASKS.md](TASKS.md)：每个任务的具体要求。
- [HINTS.md](HINTS.md)：分级提示，卡住时再看。
- [TESTING.md](TESTING.md)：环境、构建、QEMU 和 Stage 测试说明。
- [SOLUTION.md](SOLUTION.md)：参考实现说明，仅在 solution 分支提供。
- [TEACHER_GUIDE.md](TEACHER_GUIDE.md)：教师授课和验收建议，仅在 solution 分支提供。

## 完成标准

最终运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
```

应看到 QEMU 输出包含：

```text
[Lab4-T1] address and PTE ready
[Lab4-T1] PASS
[Lab4-T2] page table maps
[Lab4-T2] PASS
[Lab4] page table built
[Lab4] satp activated
[Lab4] paging is active
[Lab4] PASS
```
