# Lab3 分级提示

请先独立完成任务。每个任务的提示从概念到接近实现逐级变具体，但不会给出完整参考答案。

## 任务一提示：物理地址和页号转换

提示 1：概念方向

- 页号就是地址除以页大小后的编号。
- 页内偏移就是地址在当前页中的位置。

提示 2：相关文件和函数

- 看 `kernel/src/memory/address.rs`。
- `PhysAddr::floor`、`PhysAddr::ceil`、`PhysAddr::page_offset` 属于同一组计算。

提示 3：接近实现的步骤

1. `floor` 使用整数除法。
2. `page_offset` 只保留一页内的偏移。
3. `ceil` 需要单独处理已对齐地址。

## 任务二提示：基本分配

提示 1：概念方向

- 分配器可以先从 `start` 到 `end` 顺序发页。
- `[start, end)` 不包含 `end`。

提示 2：相关文件和函数

- 看 `StackFrameAllocator` 的 `start`、`end`、`next`。
- `alloc` 应该改变 `next`。

提示 3：接近实现的步骤

1. `init` 记录管理区间。
2. 如果 `next < end`，返回当前 `next`。
3. 返回前把 `next` 推进一页。

## 任务三提示：释放和复用

提示 1：概念方向

- 释放的页可以放入一个回收结构，下次优先分配。
- 不能接受不属于本分配器的页。

提示 2：相关文件和函数

- 看 `FrameAllocatorError`。
- `OutOfRange` 和 `DoubleFree` 是两个不同错误。

提示 3：接近实现的步骤

1. 先判断页号是否在 `[start, end)`。
2. 再判断它是否已经被分配过。
3. 最后检查它是否已经在回收结构中。
