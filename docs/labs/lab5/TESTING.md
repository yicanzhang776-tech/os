# Lab5 测试说明

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

## Stage 1 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 1
```

成功时应包含：

```text
[Lab5-T1] task table ready
[Lab5-T1] PASS
```

## Stage 2 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 2
```

成功时应包含：

```text
[Lab5-T2] round robin ready
[Lab5-T2] PASS
```

## Stage 3 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
```

成功时应包含：

```text
[Lab5] scheduler finished
[Lab5] PASS
```

## ExpectIncomplete 测试

starter 分支应通过：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -ExpectIncomplete
```

该测试确认：

- 内核可以构建。
- QEMU 可以启动并正常退出。
- Lab4 仍输出 `[Lab4] PASS`。
- Lab5 输出 starter TODO。
- Lab5 不会提前输出 `[Lab5] PASS`。

## 常见测试失败原因

- Stage 1 缺少 `[Lab5-T1] PASS`：通常是 `TaskContext::goto` 或 `add_task` 未完成。
- Stage 2 缺少 `[Lab5-T2] PASS`：通常是 `fetch_next` 没有正确维护 `next_scan`。
- Stage 3 超时：任务没有主动 yield 或调度器没有退出条件。
- QEMU 崩溃：`__switch` 保存恢复寄存器的偏移可能不匹配。
