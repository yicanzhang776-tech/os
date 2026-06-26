# Lab3: 物理内存管理

## 实验目标

Lab3 引入物理页和物理页帧分配器。学生需要在 Lab2 已完成的启动、SBI 控制台和 trap 基础上，实现一个最小但可测试的物理内存管理模块。

本分支是 `lab3-starter`，只提供实验骨架和 TODO，不包含完整参考答案，也不会输出 `[Lab3] PASS`。

## 前置知识

- RISC-V 64 基本地址空间概念。
- QEMU `virt` 平台和 OpenSBI 启动流程。
- 4 KiB 页大小和地址对齐。
- Rust `struct`、`trait`、`Option`、`Result`。
- Lab2 中的最小异常处理和 QEMU 自动测试方法。

## 物理地址和物理页号

Lab3 使用两个轻量类型表达物理内存位置：

- `PhysAddr`：物理地址，单位是字节。
- `PhysPageNum`：物理页号，单位是 4 KiB 页。

页大小固定为：

```rust
PAGE_SIZE = 4096
```

学生需要补全地址与页号之间的转换逻辑，包括 `floor`、`ceil`、页内偏移和页号起始地址。

## 页大小和对齐

需要重点处理两类地址：

- 已经按 4 KiB 对齐的地址，例如 `0x80212000`。
- 没有按 4 KiB 对齐的地址，例如 `0x80212001`。

`floor` 应返回包含该地址的页号，`ceil` 应返回第一个起始地址不小于该地址的页号。这里最容易出现 off-by-one 错误。

## 内核结束符号

链接脚本提供 `ekernel` 符号，表示内核镜像结束后的第一个 4 KiB 对齐地址。Lab3 的可分配物理页必须从 `ceil(ekernel)` 之后开始，避免覆盖：

- `.text`
- `.rodata`
- `.data`
- `.bss`
- 启动栈
- 内核中已经链接进来的其他静态数据

当前 QEMU/OpenSBI 运行中，内核由 OpenSBI 跳转到 `0x80200000`。OpenSBI 输出的 `Domain0 Next Arg1 = 0x87e00000` 是设备树地址，因此 starter 将可分配内存上界保守设置为 `0x87e00000`，避免覆盖启动时传入的数据。

## Starter 和 Solution 分支

- starter 分支：`lab3-starter`
- solution 分支：尚未创建，后续应命名为 `lab3-solution`

starter 的目标是让工程能够构建、启动，并明确提示学生需要完成物理页分配器。starter 不应输出 `[Lab3] PASS`。

solution 阶段完成后，QEMU 输出中才应出现：

```text
[Lab3] PASS
```

## 学生任务

学生需要补全或修改的内容包括：

- `PhysAddr::floor`
- `PhysAddr::ceil`
- `PhysAddr::page_offset`
- `PhysPageNum::start_address`
- `FrameAllocator::init`
- `FrameAllocator::alloc`
- `FrameAllocator::dealloc`

学生还需要在实现中处理：

- 空区间。
- 单页区间。
- 多页区间。
- 分配耗尽。
- 释放后重新分配。
- 非法释放。
- 重复释放。

## 不允许修改的基础设施

学生不应为完成 Lab3 修改以下基础设施：

- QEMU 启动参数。
- OpenSBI 调用接口。
- Lab1 控制台输出路径。
- Lab2 trap 入口和 breakpoint 演示。
- `scripts/test-lab3.ps1` 的 PASS 判定逻辑。
- 链接脚本中的内核加载基址。

如需调整测试或平台参数，应先由教师确认。

## 核心知识点

- 物理页帧是内存管理的最小分配单位。
- 内核镜像所在页不能进入空闲页池。
- `ekernel` 必须来自链接脚本，而不是手写估算。
- `alloc` 和 `dealloc` 需要维护一致的分配状态。
- 非法释放和重复释放应被检测出来，而不是静默接受。

## 构建命令

```powershell
cargo build -p ai-os-kernel
```

## QEMU 运行命令

```powershell
qemu-system-riscv64 -machine virt -nographic -bios default -kernel target/riscv64gc-unknown-none-elf/debug/ai-os-kernel
```

## 自动测试命令

starter 验收命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -ExpectIncomplete
```

未来 solution 验收命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
```

Lab3 开发过程中还需要保证 Lab2 不回归：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
```

## Starter 预期结果

starter 应能正常构建并启动 QEMU，输出中包含：

```text
[Lab3] start
[Lab3] TODO: implement physical frame allocator
```

starter 不应输出：

```text
[Lab3] PASS
```

## Solution 预期输出

solution 完成后，QEMU 测试应至少验证：

- 使用 `ekernel` 初始化可分配起点。
- 分配多个不同物理页。
- 每个物理页地址按 4 KiB 对齐。
- 释放后能够重新分配。
- 不分配内核占用范围。
- 输出 `[Lab3] PASS`。

## 验收标准

starter 阶段：

- `cargo fmt --all -- --check` 通过。
- `cargo build -p ai-os-kernel` 通过。
- `cargo clippy -p ai-os-kernel -- -D warnings` 通过。
- `scripts/test-lab3.ps1 -ExpectIncomplete` 通过。
- `scripts/test-lab2.ps1` 继续通过。

solution 阶段：

- 主机单元测试覆盖地址取整、页号转换、分配、释放、耗尽、非法释放和重复释放。
- QEMU 集成测试输出 `[Lab3] PASS`。
- 不引入 Lab4 虚拟内存、任务管理、系统调用或文件系统功能。

## 常见错误

- `ceil` 对已对齐地址额外加 1 页。
- 忘记把 `ekernel` 向上对齐到页边界。
- 把内核镜像或启动栈所在页加入空闲页池。
- `alloc` 在耗尽后仍返回页号。
- `dealloc` 接受从未分配过的页。
- 重复释放同一个页后导致后续重复分配。

## 调试建议

- 先用小范围页号手动推演 `floor` 和 `ceil`。
- 将分配器状态画成 `[start, current, end)` 的区间。
- 在 QEMU 输出中只打印稳定 marker，不依赖完整 OpenSBI banner。
- 遇到 hang 时先确认是否破坏了内核栈或 trap 入口。

## 思考题

1. 为什么物理页分配器不能从 `0x80200000` 直接开始分配？
2. `floor` 和 `ceil` 对已对齐地址的行为有什么不同？
3. 为什么重复释放会破坏分配器状态？
4. 如果未来要支持设备树解析，`0x87e00000` 附近的内存应该如何保留？
5. 物理页分配器和 Lab4 的 Sv39 页表分配有什么关系？

## 教师验收方法

教师可以先在 `lab3-starter` 上运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -ExpectIncomplete
```

该命令通过说明 starter 可构建、可启动，并且没有提前给出 Lab3 答案。

在未来 `lab3-solution` 上，应运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
```

该命令必须看到 `[Lab3] PASS` 才能通过。
