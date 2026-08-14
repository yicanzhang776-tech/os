# Lab3 测试说明

> 智能体 `run_test` 只能启动登记的本 Lab starter/solution 测试，并与页面交互运行共用任务锁；模型回答和工具返回不能替代脚本最终结果。

`-Stage 1/2/3` 分别验证三个任务阶段；`-ExpectIncomplete` 只验证原始 starter。两者互斥。

## 环境检查

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

## 构建

```powershell
cargo build -p ai-os-kernel
```

## QEMU 运行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
```

starter 初始状态会输出 TODO marker，这是正常现象。

## Stage 1 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 1
```

成功时应包含：

```text
[Lab3-T1] address types ready
[Lab3-T1] PASS
```

## Stage 2 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 2
```

成功时应包含：

```text
[Lab3-T2] allocator can allocate
[Lab3-T2] PASS
```

## Stage 3 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 3
```

成功时应包含：

```text
[Lab3] frame allocator ready
[Lab3] PASS
```

默认命令等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
```

## ExpectIncomplete 测试

教师可在 starter 初始状态运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -ExpectIncomplete
```

该模式要求：

- 内核能构建。
- QEMU 能启动并退出。
- 输出 `[Lab2] PASS` 和 `[Lab3] start`。
- 不输出 `[Lab3] PASS`。
- 输出 Lab3 TODO marker。

## 常见测试失败原因

- Stage 1 失败：`floor`、`ceil` 或 `page_offset` 有 off-by-one 错误。
- Stage 2 失败：`alloc` 没有推进 `next`，或错误包含了 `end` 页。
- Stage 3 失败：`dealloc` 没有复用释放页，或没有识别非法释放。
- QEMU 超时：可能破坏了内核占用内存或没有正常 shutdown。
