# Lab4 任务书

本实验只有 3 个必做任务。请按顺序完成，不要在未建立页表前直接输出 `[Lab4] PASS`。

每完成一个任务就运行对应 `-Stage`。`-ExpectIncomplete` 只供教师检查未修改的 starter 起点。

## 任务一：Sv39 地址和 PTE 基础

学习目标：

- 理解 Sv39 的 3 级 VPN 索引。
- 理解 PTE 的 flag 和 PPN 字段。
- 正确处理虚拟地址 `floor/ceil/page_offset`。

需要阅读的文件：

- `kernel/src/memory/virtual_address.rs`
- `kernel/src/memory/page_table.rs`

允许修改：

- `kernel/src/memory/virtual_address.rs`
- `kernel/src/memory/page_table.rs` 中 `PageTableEntry::ppn`

禁止修改：

- `scripts/test-lab4.ps1`
- Lab5 及后续模块

需要补全的 TODO：

- `VirtAddr::floor`
- `VirtAddr::ceil`
- `VirtAddr::page_offset`
- `VirtPageNum::indexes`
- `PageTableEntry::ppn`

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 1
```

预期输出：

```text
[Lab4-T1] address and PTE ready
[Lab4-T1] PASS
```

常见错误：

- VPN 索引顺序写反。
- 忘记 PTE 的 PPN 从 bit 10 开始。
- `ceil` 对已对齐地址额外加一页。

## 任务二：页表映射与查询

学习目标：

- 理解三级页表 walk。
- 实现 `map/unmap/translate`。
- 识别重复映射和未映射查询。

需要阅读的文件：

- `kernel/src/memory/page_table.rs`

允许修改：

- `kernel/src/memory/page_table.rs`

需要补全的 TODO：

- `PageTable::find_pte_create`
- `PageTable::map`
- `PageTable::unmap`
- `PageTable::translate`

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 2
```

预期输出：

```text
[Lab4-T2] page table maps
[Lab4-T2] PASS
```

常见错误：

- 非叶子 PTE 和叶子 PTE 混淆。
- 重复 map 没有返回错误。
- translate 忘记加页内偏移。

## 任务三：激活内核恒等映射

学习目标：

- 理解 `satp` 构造。
- 理解 `sfence.vma` 的必要性。
- 理解启用分页后代码、栈和数据仍能访问的原因。

需要阅读的文件：

- `kernel/src/memory/page_table.rs`
- `kernel/src/memory/mod.rs`
- `kernel/src/main.rs`

允许修改：

- `kernel/src/memory/page_table.rs`
- 必要时修改 `kernel/src/memory/mod.rs` 中 Lab4 检查入口

需要补全的 TODO：

- `MemorySet::activate`
- 内核必要区域的恒等映射逻辑

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 3
```

预期输出：

```text
[Lab4] page table built
[Lab4] satp activated
[Lab4] paging is active
[Lab4] PASS
```

常见错误：

- 写 `satp` 前没有映射当前代码或栈。
- 忘记执行 `sfence.vma`。
- 把全部内存简单 RWX 映射。

思考题：

- 为什么本实验先做恒等映射，而不是高地址内核？
- 如果后续支持用户态，哪些 PTE 需要设置 `U` 位？
