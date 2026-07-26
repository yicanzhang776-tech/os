# Lab4 Solution：RISC-V Sv39 虚拟内存

当前分支：`lab4-solution`

当前实验：Lab4 RISC-V Sv39 虚拟内存参考实现与教师验收材料。

适合对象：教师、助教和完成 `lab4-starter` 后需要对照参考实现的学生。

> 注意：本分支包含完整参考答案，不建议直接作为学生起始分支发布给学生。学生应从 `lab4-starter` 开始。

## 本分支包含什么

- Lab4 三个教学任务的完整参考实现。
- 与 `lab4-starter` 相同的任务书、提示和测试说明。
- 额外的参考答案说明：`docs/labs/lab4/SOLUTION.md`。
- 教师验收和授课建议：`docs/labs/lab4/TEACHER_GUIDE.md`。
- 分阶段测试脚本：`scripts/test-lab4.ps1 -Stage 1/2/3`。

## Lab4 三个递进任务

| 阶段 | 任务 | 关键输出 |
|---|---|---|
| Stage 1 | Sv39 地址、VPN 索引、PTE flags 和 `PageTableEntry::ppn` | `[Lab4-T1] address and PTE ready`，`[Lab4-T1] PASS` |
| Stage 2 | `find_pte_create`、`map`、`unmap`、`translate` | `[Lab4-T2] page table maps`，`[Lab4-T2] PASS` |
| Stage 3 | 内核恒等映射、`satp`、`sfence.vma` 和启用分页后继续执行 | `[Lab4] page table built`，`[Lab4] satp activated`，`[Lab4] paging is active`，`[Lab4] PASS` |

## 快速验收

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
cargo build -p ai-os-kernel
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
```

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- [Lab4 总览](docs/labs/lab4/README.md)
- [任务书](docs/labs/lab4/TASKS.md)
- [分级提示](docs/labs/lab4/HINTS.md)
- [测试说明](docs/labs/lab4/TESTING.md)
- [参考答案说明](docs/labs/lab4/SOLUTION.md)
- [教师指南](docs/labs/lab4/TEACHER_GUIDE.md)

## 参考实现边界

本分支实现的是教学版 Sv39：

- 采用内核恒等映射，不引入高地址内核映射。
- 区分 `.text`、`.rodata`、`.data`、`.bss` 的权限。
- 页表页使用固定容量所有权数组，不提前引入堆分配器。
- QEMU 中真实写入 `satp` 并执行 `sfence.vma`。
- 不实现 Lab5 任务调度、用户态、系统调用或文件系统。

## 建议使用方式

教师可先向学生发布 `lab4-starter`，课堂讲解 `TASKS.md` 和 `HINTS.md`。验收或讲评时再切换到本分支，对照 `SOLUTION.md` 和 `TEACHER_GUIDE.md` 说明关键实现。
