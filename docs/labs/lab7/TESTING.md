# Lab7 测试说明

> 智能体 `run_test` 只能启动登记的本 Lab starter/solution 测试，并与页面交互运行共用任务锁；模型回答和工具返回不能替代脚本最终结果。

`-Stage 1/2/3` 分别验证三个任务阶段；`-ExpectIncomplete` 只验证原始 starter。两者互斥。

## 环境检查

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

## 构建与静态检查

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

## starter incomplete 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

应看到：

```text
[Lab7-T1] TODO: implement RAM byte device
[Lab7-T2] TODO: implement simple file system
[Lab7] TODO: implement memory file system
```

不能看到 `[Lab7] PASS`。

## Stage 1

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
```

成功标志：

```text
[Lab7-T1] PASS
```

## Stage 2

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
```

成功标志：

```text
[Lab7-T2] PASS
```

## Stage 3

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

成功标志：

```text
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

## 常见失败原因

- QEMU 缺失或未加入 `PATH`。
- starter 分支直接运行完整测试，因缺少 `[Lab7] PASS` 失败。
- `read_at/write_at` 越界检查不正确。
- fd 关闭后仍能读写。
- 用户程序没有触发 Lab7 文件 I/O 路径。
