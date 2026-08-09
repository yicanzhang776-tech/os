# Lab2 测试说明

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
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 1
```

成功时应包含：

```text
[Lab2-T1] stvec configured
[Lab2-T1] PASS
```

## Stage 2 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 2
```

成功时应包含：

```text
[Lab2-T2] breakpoint decoded
[Lab2-T2] PASS
```

## Stage 3 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 3
```

成功时应包含：

```text
[Lab2] breakpoint handled
[Lab2] PASS
```

默认命令等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
```

## ExpectIncomplete 测试

教师可在 starter 初始状态运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -ExpectIncomplete
```

该模式要求：

- 内核能构建。
- QEMU 能启动并退出。
- 输出 `[Lab1] PASS` 和 `[Lab2] start`。
- 不输出 `[Lab2] PASS`。
- 输出 Lab2 TODO marker。

## 常见测试失败原因

- QEMU 超时：可能没有正常调用 SBI reset，或重复触发 breakpoint。
- Stage 1 失败：`stvec` 没有正确配置。
- Stage 2 失败：没有正确识别 breakpoint。
- Stage 3 失败：没有推进 `sepc` 或最终 marker 不正确。
- 输出里仍有 TODO：说明还没有完成对应阶段。
