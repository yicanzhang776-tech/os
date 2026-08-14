# Lab4 测试说明

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

## Stage 1 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 1
```

成功时应包含：

```text
[Lab4-T1] address and PTE ready
[Lab4-T1] PASS
```

## Stage 2 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 2
```

成功时应包含：

```text
[Lab4-T2] page table maps
[Lab4-T2] PASS
```

## Stage 3 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 3
```

成功时应包含：

```text
[Lab4] page table built
[Lab4] satp activated
[Lab4] paging is active
[Lab4] PASS
```

默认命令等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
```

## ExpectIncomplete 测试

教师可在 starter 初始状态运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -ExpectIncomplete
```

该模式要求：

- 内核能构建。
- QEMU 能启动并退出。
- Lab3 回归 marker `[Lab3] PASS` 存在。
- 不输出 `[Lab4] PASS`。
- 输出 Lab4 TODO marker。
