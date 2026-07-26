# 测试设计

本文档记录当前 P0-Lab7 的测试分层、脚本入口和 CI 策略。测试目标是保证每个实验既能作为学生 starter 验证，也能作为教师 solution 验收。

## 当前可用测试

### 环境检查

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

```sh
sh scripts/check-env.sh
```

### 格式、构建和静态检查

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
```

### 主机单元测试

```powershell
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

主机单元测试覆盖与硬件无关的纯 Rust 逻辑，例如地址转换、物理页分配器、Sv39 页表算法、任务状态机、系统调用分发和内存文件系统。

### QEMU 系统测试

P0：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
```

Lab1 到 Lab7：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

## Starter 与 Solution 验收策略

每个实验分支有两类验收：

- `labN-starter`：必须能构建、能启动 QEMU、不能输出 `[LabN] PASS`，并且必须输出清晰的 `[LabN] TODO` 或等价未完成提示。
- `labN-solution`：必须输出对应 `[LabN] PASS`，并保持之前实验的回归输出。

PowerShell starter 验收示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

Linux CI 使用统一脚本 `scripts/test-qemu.sh`：

```sh
scripts/test-qemu.sh --name Lab7 --marker "[Lab7] PASS" --mode expect-incomplete --require "[Lab7] TODO: implement memory file system"
scripts/test-qemu.sh --name Lab7 --marker "[Lab7] PASS"
```

## 日志约定

稳定 token 使用大写实验名：

- `[P0] PASS`
- `[Lab1] PASS`
- `[Lab2] PASS`
- `[Lab3] PASS`
- `[Lab4] PASS`
- `[Lab5] PASS`
- `[Lab6] PASS`
- `[Lab7] PASS`

测试脚本只依赖这些稳定 marker 和少量实验关键 marker，不依赖完整 OpenSBI banner。

## CI 策略

`.gitlab-ci.yml` 按分支名称选择验收方式：

- `p0-minimal-qemu-baseline`：运行 P0 正向验收。
- `labN-starter`：运行 incomplete 验收，防止 starter 泄露答案。
- `labN-solution`：运行 solution 正向验收，必须看到 `[LabN] PASS`。

如果 GitLab runner 缺少 QEMU、Rust target、rustfmt 或 clippy，需要根据 CI 日志补充环境安装；本地验收结果仍应作为比赛提交说明的一部分。

## 最终本地验收建议

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
git diff --check
```
