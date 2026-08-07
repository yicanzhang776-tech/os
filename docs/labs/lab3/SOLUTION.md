# Lab3 参考答案说明

本文件面向教师和助教，用于讲解 Lab3 的参考实现。请不要把本文件直接放给学生作为 starter 材料。

## 任务一：物理地址和页号转换

实现思路：

- `floor` 使用整数除法，把字节地址转换为包含该地址的页号。
- `ceil` 使用向上取整，对已对齐地址不额外加页。
- `page_offset` 使用取模得到页内偏移。
- `PhysPageNum::start_address` 将页号乘以 `PAGE_SIZE`。

关键代码位置：

- `kernel/src/memory/address.rs`
- `kernel/src/memory/mod.rs`：`address_stage_is_complete`

常见错误：

- `ceil` 对已对齐地址加 1。
- 忘记页内偏移必须小于 4096。
- 混淆物理地址和物理页号。

实际运行结果：

```text
[Lab3-T1] address types ready
[Lab3-T1] PASS
```

## 任务二：初始化分配器并完成基本分配

实现思路：

- `init` 记录 `[start, end)` 区间，并把 `next` 设置为 `start`。
- `alloc` 优先复用回收页；没有回收页时，从 `next` 顺序分配。
- 当 `next >= end` 时返回 `None`。

关键代码位置：

- `kernel/src/memory/frame_allocator.rs`
- `kernel/src/memory/mod.rs`：`allocation_stage_is_complete`

常见错误：

- 把 `end` 也当作可分配页。
- 分配后不推进 `next`。
- 未初始化时仍允许分配。

实际运行结果：

```text
[Lab3-T2] allocator can allocate
[Lab3-T2] PASS
```

## 任务三：释放、复用和错误检查

实现思路：

- `dealloc` 先检查分配器是否初始化。
- 再检查页号是否属于 `[start, end)`。
- 然后拒绝从未分配过的页和重复释放的页。
- 合法释放的页进入固定容量回收栈，后续 `alloc` 优先复用。

关键代码位置：

- `kernel/src/memory/frame_allocator.rs`：`dealloc`
- `kernel/src/memory/frame_allocator.rs`：`contains_recycled`
- `kernel/src/memory/mod.rs`：`run_lab3_checks`

为什么这样实现：

- 固定数组避免在 Lab3 提前引入堆分配器。
- 回收栈容易解释，适合本科教学；它不是工业级物理内存管理器。

常见错误：

- 重复释放后同一页被多次加入回收栈。
- 对从未分配过的页返回成功。
- 释放超出管理范围的页。

实际运行结果：

```text
[Lab3] frame allocator ready
[Lab3] PASS
```

## 测试覆盖

主机单元测试覆盖：

- `floor`、`ceil`、`page_offset`。
- 页号转换为页起始地址。
- 单页和多页分配。
- 分配结果唯一且页对齐。
- 分配耗尽。
- 释放后复用。
- 非法释放、重复释放和未分配释放。

QEMU 集成测试覆盖：

- 使用链接脚本 `ekernel` 作为分配起点。
- 分配页不落入内核占用范围。
- 分配页低于 `PHYS_MEMORY_END`。
- 释放后可复用。
- 输出 `[Lab3] PASS`。

## 教学限制

- 回收结构使用固定容量数组。
- 没有实现伙伴系统、页着色、NUMA 或复杂连续页分配。
- 后续 Lab4 会在此基础上分配页表页。
