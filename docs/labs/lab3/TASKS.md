# Lab3 任务书

本实验只有 3 个必做任务。请按顺序完成，先把纯地址计算做对，再实现分配器。

每完成一个任务就运行对应 `-Stage`。`-ExpectIncomplete` 只供教师检查未修改的 starter 起点。

## 任务一：完成物理地址和页号转换

学习目标：

- 理解字节地址和页号的关系。
- 正确处理 4 KiB 对齐和非对齐地址。
- 区分 `floor` 和 `ceil`。

背景知识：

- 页大小固定为 `PAGE_SIZE = 4096`。
- `floor` 返回包含当前地址的页号。
- `ceil` 返回第一个起始地址不小于当前地址的页号。

需要阅读的文件：

- `kernel/src/memory/address.rs`
- `kernel/src/memory/mod.rs`

允许修改：

- `kernel/src/memory/address.rs`

禁止修改：

- `kernel/linker.ld`
- `scripts/test-lab3.ps1`

需要补全的 TODO：

- `PhysAddr::floor`
- `PhysAddr::ceil`
- `PhysAddr::page_offset`
- `PhysPageNum::start_address`

推荐完成顺序：

1. 先实现 `floor`。
2. 再实现 `page_offset`。
3. 分别处理已对齐和未对齐地址的 `ceil`。
4. 最后实现页号到起始地址的转换。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 1
```

预期输出：

```text
[Lab3-T1] address types ready
[Lab3-T1] PASS
```

验收标准：

- Stage 1 测试通过。
- `ceil` 对已对齐地址不额外加一页。
- 能解释页内偏移为什么小于 `PAGE_SIZE`。

常见错误：

- `ceil` 对齐地址也加 1。
- 把字节地址和页号混用。
- 用十进制硬编码替代 `PAGE_SIZE`。

思考题：

- 为什么页大小通常是 2 的幂？
- `page_offset` 可以用取模实现，也可以用位运算实现，它们有什么关系？

## 任务二：初始化分配器并完成基本分配

学习目标：

- 理解半开区间 `[start, end)`。
- 实现顺序分配一个空闲物理页。
- 正确处理分配耗尽。

背景知识：

- `init(start, end)` 管理的页号范围不包含 `end`。
- `alloc` 成功时返回一个页号，失败时返回 `None`。
- 本阶段先不要求释放复用。

需要阅读的文件：

- `kernel/src/memory/frame_allocator.rs`
- `kernel/src/memory/mod.rs`

允许修改：

- `kernel/src/memory/frame_allocator.rs`

禁止修改：

- `kernel/src/memory/mod.rs`
- `scripts/test-lab3.ps1`

需要补全的 TODO：

- `FrameAllocator::init`
- `FrameAllocator::alloc`

推荐完成顺序：

1. 在 `init` 中记录 `start`、`end` 和下一个可分配页。
2. `alloc` 返回 `next` 并推进。
3. 当 `next >= end` 时返回 `None`。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 2
```

预期输出：

```text
[Lab3-T2] allocator can allocate
[Lab3-T2] PASS
```

验收标准：

- Stage 2 测试通过。
- Stage 1 输出仍然存在。
- 分配耗尽后返回 `None`，而不是越界页号。

常见错误：

- 把 `end` 当成可分配页。
- 忘记推进 `next`。
- 未初始化时也允许分配。

思考题：

- 为什么接口选择 `Option<PhysPageNum>` 表示分配失败？
- 如果物理页不是连续的，当前顺序分配器还够用吗？

## 任务三：完成释放、复用和错误检查

学习目标：

- 理解释放后的页应能再次分配。
- 检测非法释放和重复释放。
- 保持分配器内部状态一致。

背景知识：

- `dealloc` 只接受当前分配器管理范围内、且曾经分配出去的页。
- 重复释放会导致同一页被多次分配，是严重错误。
- 当前实现可使用固定容量回收栈，不要求堆分配。

需要阅读的文件：

- `kernel/src/memory/frame_allocator.rs`

允许修改：

- `kernel/src/memory/frame_allocator.rs`

禁止修改：

- Lab4 及后续实验模块
- QEMU 启动脚本

需要补全的 TODO：

- `FrameAllocator::dealloc`
- 必要的分配状态记录

推荐完成顺序：

1. 先拒绝 out-of-range 页号。
2. 再拒绝从未分配过的页。
3. 最后拒绝重复释放，并让释放页能够复用。

运行命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 3
```

预期输出：

```text
[Lab3] frame allocator ready
[Lab3] PASS
```

验收标准：

- 默认 Lab3 测试通过。
- QEMU 退出码为 0。
- 不分配内核 `ekernel` 之前的物理页。

常见错误：

- 重复释放后同一页被多次返回。
- 释放不属于管理范围的页没有报错。
- 把内核镜像所在页加入可分配池。

思考题：

- 为什么物理页分配器要比虚拟内存先实现？
- 后续页表页也要从物理页分配器获取，这会带来什么要求？
