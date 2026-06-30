# 比赛提交检查清单

本文档用于提交官方 GitLab 仓库前的最终检查。

## Git 分支

- [ ] 当前不在 `main/master` 上进行开发修改。
- [ ] `p0-minimal-qemu-baseline` 已推送。
- [ ] `lab1-starter` 和 `lab1-solution` 已推送。
- [ ] `lab2-starter` 和 `lab2-solution` 已推送。
- [ ] `lab3-starter` 和 `lab3-solution` 已推送。
- [ ] `lab4-starter` 和 `lab4-solution` 已推送。
- [ ] `lab5-starter` 和 `lab5-solution` 已推送。
- [ ] `lab6-starter` 和 `lab6-solution` 已推送。
- [ ] `lab7-starter` 和 `lab7-solution` 已推送。
- [ ] `git status --short` 输出为空。

## 环境与构建

- [ ] `rustc`、`cargo`、`rustup` 可用。
- [ ] 已安装 `riscv64gc-unknown-none-elf` target。
- [ ] `qemu-system-riscv64` 可用。
- [ ] Windows PowerShell 环境下 `scripts/check-env.ps1` 通过。
- [ ] WSL2/Ubuntu 环境下 `scripts/check-env.sh` 通过。

## 本地验证

提交前建议执行：

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

验收成功时应看到：

- `[Lab1] PASS`
- `[Lab2] PASS`
- `[Lab3] PASS`
- `[Lab4] PASS`
- `[Lab5] PASS`
- `[Lab6] PASS`
- `[Lab7] PASS`

## 安全与隐私

- [ ] 仓库中没有 API Key、Token、密码或私有仓库地址。
- [ ] 仓库中没有比赛账号、个人隐私或本机绝对路径。
- [ ] `target/`、QEMU 日志、临时文件和 IDE 缓存未提交。
- [ ] 官方截图或参考资料已经脱敏。

## 文档

- [ ] 根 `README.md` 能说明项目状态、依赖、构建和测试方法。
- [ ] `docs/requirements.md` 覆盖赛题要求映射。
- [ ] `docs/architecture.md` 覆盖系统架构和模块边界。
- [ ] `docs/testing.md` 覆盖主机测试、QEMU 测试和 CI 策略。
- [ ] `docs/labs/README.md` 覆盖 7 个实验路线。
- [ ] `docs/labs/lab1.md` 到 `docs/labs/lab7.md` 覆盖实验目标、任务边界、测试和教师验收。
- [ ] `docs/ai-collaboration.md` 记录 AI 协作过程。
- [ ] `docs/final-report.md` 可作为设计方案与开发文档。
- [ ] `docs/demo-script.md` 可作为演示视频或答辩讲稿。

## 提交说明

建议在官方提交说明中强调：

- P0 不计入正式实验，只作为可重复运行工程基线。
- 正式实验共 7 个，均有 starter/solution 分支。
- 基础实验难度面向普通本科生，复杂能力放入扩展任务或思考题。
- Lab7 当前使用内存文件系统，virtio-block 和真实磁盘是扩展方向。
