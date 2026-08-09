# Lab6 测试说明

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
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 1
```

成功时应包含：

```text
[Lab6-T1] user context ready
[Lab6-T1] PASS
```

## Stage 2 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 2
```

成功时应包含：

```text
[Lab6-T2] syscall ABI ready
[Lab6-T2] PASS
```

## Stage 3 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
```

成功时应包含：

```text
[Lab6] user program: hello
[Lab6] syscall write handled
[Lab6] syscall exit handled
[Lab6] PASS
```

## ExpectIncomplete 测试

starter 分支应通过：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -ExpectIncomplete
```

该测试确认：

- 内核可以构建。
- QEMU 可以启动并正常退出。
- Lab5 仍输出 `[Lab5] PASS`。
- Lab6 输出 starter TODO。
- Lab6 不会提前输出 `[Lab6] PASS`。

## 常见测试失败原因

- Stage 1 缺少 `[Lab6-T1] PASS`：通常是 `sepc` 或 `sstatus` 设置不完整。
- Stage 2 缺少 `[Lab6-T2] PASS`：通常是 `dispatch` 仍返回 `Unimplemented`。
- Stage 3 超时：可能是 `ecall` 后没有推进 `sepc`。
- QEMU 崩溃：用户代码页或用户栈权限可能没有映射正确。
