# Lab4 分级提示

## 任务一提示：Sv39 地址和 PTE 基础

提示 1：概念方向

- Sv39 页内偏移是低 12 位。
- VPN 被拆成 3 个 9 位索引。

提示 2：相关文件和函数

- 看 `virtual_address.rs` 的 `VirtPageNum::indexes`。
- 看 `page_table.rs` 的 `PageTableEntry::ppn`。

提示 3：接近实现的步骤

1. 地址除以 `PAGE_SIZE` 得到 VPN。
2. 依次用右移和 `0x1ff` 取出 VPN[0]、VPN[1]、VPN[2]。
3. PTE 的 PPN 是 `bits >> 10` 后再截取有效位。

## 任务二提示：页表映射与查询

提示 1：概念方向

- 页表 walk 从 VPN[2] 到 VPN[0]。
- 最后一级安装叶子 PTE。

提示 2：相关文件和函数

- 看 `PageTable::find_pte_create`。
- `map` 应拒绝已存在的有效映射。
- `translate` 要把 PPN 和页内偏移合成物理地址。

提示 3：接近实现的步骤

1. 查找或创建中间级页表。
2. 在叶子位置写入 `V | flags`。
3. 查询时遇到无效 PTE 返回 `None`。

## 任务三提示：激活内核恒等映射

提示 1：概念方向

- 启用分页后，当前 PC 和 SP 必须仍然有效。
- 恒等映射让虚拟地址等于物理地址，最容易理解。

提示 2：相关文件和函数

- 看 `MemorySet::activate`。
- 看 `make_satp`。
- 看 `kernel_memory_layout` 提供的 section 边界。

提示 3：接近实现的步骤

1. 分别映射 text、rodata、data/bss。
2. 构造 `(8 << 60) | root_ppn`。
3. 写入 `satp` 后执行 `sfence.vma`。
