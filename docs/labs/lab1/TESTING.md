# Lab1 测试说明

## 环境检查

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

需要具备：

- `rustc`
- `cargo`
- `rustup`
- `riscv64gc-unknown-none-elf`
- `qemu-system-riscv64`

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
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 1
```

必须看到：

```text
[Lab1-T1] kernel entered
[Lab1-T1] PASS
```

## Stage 2 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 2
```

必须看到：

```text
[Lab1-T2] console ready
[Lab1-T2] PASS
```

Stage 2 会同时检查 Stage 1 marker 是否仍然存在。

## Stage 3 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```

必须看到：

```text
[Lab1] start
[Lab1] console ready
[Lab1] PASS
```

Stage 3 会同时检查 Stage 1 和 Stage 2 marker。

## ExpectIncomplete 测试

教师可在 starter 初始状态运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -ExpectIncomplete
```

该测试要求：

- 内核能构建。
- QEMU 能启动并正常退出。
- 输出中包含 Lab1 TODO marker。
- 输出中不包含 `[Lab1] PASS`。

## 常见测试失败原因

- 缺少 QEMU：运行环境检查并安装 `qemu-system-riscv64`。
- Stage 1 失败：任务一 marker 拼写不完全一致。
- Stage 2 失败：`console_write` 没有真正输出传入字符串。
- Stage 3 失败：忘记输出 `[Lab1] PASS` 或删除了 `sbi::shutdown()`。
- QEMU 超时：内核没有正常调用 SBI reset。

## 成功输出

完整 Lab1 solution 输出应包含：

```text
[Lab1-T1] kernel entered
[Lab1-T1] PASS
[Lab1-T2] console ready
[Lab1-T2] PASS
[Lab1] start
[Lab1] console ready
[Lab1] PASS
```
