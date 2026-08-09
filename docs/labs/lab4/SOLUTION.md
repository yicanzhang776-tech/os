# Lab4 参考答案说明

本文件面向教师、助教和已经完成 `lab4-starter` 的学生。不要把本文件直接放入学生起始材料中。

## 任务一：Sv39 地址和 PTE 基础

实现位置：

- `kernel/src/memory/virtual_address.rs`
- `kernel/src/memory/page_table.rs`

核心思路：

- `VirtAddr::floor` 返回当前地址所在虚拟页号。
- `VirtAddr::ceil` 在地址未按 4 KiB 对齐时向上取整。
- `VirtPageNum::indexes` 将 27 位 VPN 拆成 `[VPN0, VPN1, VPN2]`，页表 walk 时按 `VPN2 -> VPN1 -> VPN0` 使用。
- `PageTableEntry::ppn` 从 PTE 的 bit 10 起解析物理页号。

常见错误：

- 把三级索引顺序写反。
- 对已经对齐的地址执行 `ceil` 时多加一页。
- 忘记 PTE 低 10 位是 flags，导致 PPN 解析偏移错误。

## 任务二：页表映射与查询

实现位置：

- `PageTable::find_pte_create`
- `PageTable::map`
- `PageTable::unmap`
- `PageTable::translate`

核心思路：

- 根页表和中间页表页都由 Lab3 物理页分配器分配。
- `PageTable` 保存自己拥有的页表页，避免页表页被普通数据页回收。
- `find_pte_create` 在缺少中间页表时按需创建。
- `map` 只允许映射尚未有效的叶子 PTE。
- `translate` 只在叶子 PTE 有效时返回物理地址。

常见错误：

- 重复映射时覆盖旧 PTE。
- `unmap` 删除不存在的映射时仍返回成功。
- 把页表页和被映射的数据页混在一起管理。

## 任务三：内核恒等映射与分页激活

实现位置：

- `kernel/src/main.rs`
- `kernel/src/memory/mod.rs`
- `kernel/linker.ld`

第一版采用恒等映射：虚拟地址等于物理地址。这样在写入 `satp` 后，当前代码、栈和全局数据仍位于相同地址，便于本科生理解和调试。

权限策略：

- `.text`：`V | R | X | A`
- `.rodata`：`V | R | A`
- `.data`、`.bss`、启动栈：`V | R | W | A | D`
- Lab4 测试页：`V | R | W | A | D`

`MemorySet::activate` 会同步页表到真实物理页，构造 Sv39 `satp` 值，然后写入 `satp` 并执行 `sfence.vma`。

## 测试覆盖

主机单元测试覆盖：

- 虚拟地址 floor/ceil/page_offset。
- Sv39 三级 VPN 索引。
- PTE flags、有效位和叶子判断。
- `map/translate/unmap`。
- 重复映射和取消不存在映射。

QEMU 测试覆盖：

- Lab3 仍然通过。
- 页表建立完成。
- `satp` 激活后仍能继续输出。
- 测试页映射和读写验证通过。

## 实际输出

```text
[Lab4-T1] address and PTE ready
[Lab4-T1] PASS
[Lab4-T2] page table maps
[Lab4-T2] PASS
[Lab4] page table built
[Lab4] satp activated
[Lab4] paging is active
[Lab4] map/translate test passed
[Lab4] PASS
```

## 安全前提

本实验中的 `unsafe` 只用于 RISC-V 硬件相关边界：

- 读取链接脚本符号地址。
- 将页表数组同步到分配得到的物理页。
- 写入 `satp` 并执行 `sfence.vma`。
- 对已经映射的测试物理页进行 volatile 读写。

这些操作成立的前提是：内核运行在单 hart，页表页来自 Lab3 分配器，分页激活前已经建立覆盖当前代码、只读数据、可写数据、BSS 和启动栈的恒等映射。
