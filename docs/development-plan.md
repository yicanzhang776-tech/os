# 开发计划与当前进度

本文档记录 P0-Lab7 的阶段目标、完成状态和后续可选扩展。

## 阶段完成情况

| 阶段 | 目标 | 当前状态 | 主要验收命令 |
|---|---|---|---|
| P0 | 最小 Rust/RISC-V/QEMU 运行基线 | 已完成 | `scripts/test-qemu.ps1` |
| Lab1 | 启动与 SBI 控制台 | 已完成 starter/solution | `scripts/test-lab1.ps1` |
| Lab2 | Trap 与异常处理 | 已完成 starter/solution | `scripts/test-lab2.ps1` |
| Lab3 | 物理内存管理 | 已完成 starter/solution | `scripts/test-lab3.ps1`；主机单测 |
| Lab4 | Sv39 虚拟内存 | 已完成 starter/solution | `scripts/test-lab4.ps1`；主机单测 |
| Lab5 | 任务管理与协作式调度 | 已完成 starter/solution | `scripts/test-lab5.ps1`；主机单测 |
| Lab6 | 用户态与系统调用 | 已完成 starter/solution | `scripts/test-lab6.ps1`；主机单测 |
| Lab7 | 设备与简化文件系统 | 已完成 starter/solution | `scripts/test-lab7.ps1`；主机单测 |

## 当前分支组织

- `p0-minimal-qemu-baseline`：P0 稳定基线。
- `labN-starter`：第 N 个实验的学生起点，保留清晰 TODO，不输出本实验 PASS。
- `labN-solution`：第 N 个实验的教师参考实现，输出对应 `[LabN] PASS`。

P0 与 Lab1-Lab7 的 starter/solution 分支均已推送到官方 GitLab。`lab7-solution` 是教学实验的最终解答分支；`main` 是 GitLab 默认集成展示入口，另外包含可视化遥测和最新展示材料，两者用途不同。

## 当前完成状态与可选后续

1. P0 与 Lab1-Lab7 已形成构建、运行、主机测试和 QEMU 系统测试闭环。
2. `docs/final-report.md`、`docs/submission-checklist.md` 和 `docs/demo-script.md` 已作为最终提交材料加入仓库。
3. 后续可根据比赛提交格式制作演示视频、答辩 PPT 和最终版报告 PDF。
4. 若希望所有历史 starter/solution 分支都单独运行最新 CI，可将最终 CI 配置同步到对应分支；当前集成展示入口为 `main`，教学最终解答分支为 `lab7-solution`。

## 最终验收建议

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
```

## 风险与后续材料

- GitLab runner 可能缺少 QEMU 或 Rust target，需要根据 CI 日志补安装命令。
- 由于 `.gitlab-ci.yml` 只在包含该文件的分支生效，若希望旧 starter/solution 分支也自动跑最新 CI，需要将最终 CI 配置同步到对应分支。
- 仓库内已提供最终设计方案与开发文档、提交清单、演示脚本和 AI 协作记录；比赛视频和答辩 PPT 仍需按现场提交要求制作。
