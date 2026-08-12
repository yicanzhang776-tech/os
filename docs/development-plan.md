# 开发计划与当前进度

本文档记录 P0-Lab7 的阶段目标、完成状态和后续可选扩展。

## 2026-08-12 集成阶段

- 已从最新 `origin/main` 建立隔离工作分支，并无提交合并 `origin/agent-mvp`。
- 已保留远程反馈、运行记录接收、8890/8891 管理、可视化和教师评分，同时接入智能体后端。
- 已增加学生端 AI 教学助教面板、首次会话级同意、固定中文错误、纯文本回答和 `/api/context` 能力说明。
- 文档、24 页 PPT、全分支白名单同步和在线 Agent Plan 联调以本轮实际结果为准；远程 CI 在未推送时标记为“未运行”。

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
3. 已加入 OS 实验可视化、预测回放、本地规则诊断、教学反馈和教师评分工具。
4. 正式答辩 PPT 已纳入仓库；演示视频是否录制完成仍需项目成员按实际情况确认。
5. P0 与 Lab1-Lab7 的远程教学分支均已包含当前 CI 配置。文档和 Stage 接口仍需在各分支受控同步并逐分支复验。

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
- CI 配置存在不代表远程流水线已实际成功；仍应以对应分支最新流水线记录为准。
- 仓库已包含答辩 PPT。比赛视频和最终报告 PDF 的实际状态需要项目成员确认，不能仅凭仓库文件推断。
