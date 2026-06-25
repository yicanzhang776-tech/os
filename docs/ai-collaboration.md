# AI 协作记录

本文档记录本项目的人机协作过程，用于满足比赛对 AI 工具使用说明、过程记录和成果归因的要求。

## 记录原则

- 记录真实发生的协作内容。
- 不编造不存在的讨论、测试或决策。
- 无法确认的历史内容标记为“待项目成员补充”。
- 记录应当关注需求、决策、实现、验证和人工取舍，而不是堆砌完整聊天流水。

## 人类负责的内容

- 确认比赛题目和赛道：2026 年全国大学生计算机系统能力大赛，操作系统设计赛，OS 功能挑战赛道第 20 题。
- 确认项目名称：AI 合作的操作系统教学实验环境。
- 确认 P0 与 Lab1-Lab7 的区别。
- 确认 7 个递进式教学实验路线。
- 提供官方 GitLab 仓库和赛题截图信息。
- 决定哪些阶段允许修改文件、哪些阶段禁止提交和推送。

## AI 负责的内容

- 根据赛题要求提出 P0/P1/P2/P3 阶段划分建议。
- 设计 7 个递进式教学实验方案。
- 生成项目规范文档和实验文档骨架。
- 生成 P0 最小 Rust/RISC-V/QEMU 内核基线代码。
- 补充构建、运行、环境检查和 QEMU 冒烟测试脚本。
- 执行并报告实际构建、Clippy 和 QEMU 测试结果。

## 当前 P0 阶段采用的方案

P0 采用最小可运行内核方案：

- 使用 Rust `no_std`/`no_main`。
- 使用 `riscv64gc-unknown-none-elf` 目标。
- 使用 QEMU `virt` 机器。
- 使用 QEMU `-bios default` 加载 OpenSBI。
- OpenSBI 进入 S-mode 后跳转到内核入口。
- 内核输出最小启动日志和 `[P0] PASS`。
- 使用 SBI system reset 退出 QEMU。

## 实际执行过的构建和测试命令

已执行过的命令包括：

```powershell
git branch --show-current
git status
git status --short
git log --oneline --all -10
cargo fmt --all
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
git diff --check
git diff --stat
```

具体输出以终端记录和阶段总结为准。

## AI 建议被人工调整或否决的内容

- AI 曾建议安装 Superpowers 插件的本地缓存方案，后来按人工要求撤销该安装步骤。
- AI 曾在实验文档中提前列出较具体的未来函数和目录，后来按人工要求收敛为文档骨架，并将未确定内容标记为“待 P0 架构确定后补充”。
- 关于“最新教学实验环境”是否特指 rCore 参考项目，目前尚未确认，标记为待项目成员补充。

## 已知限制

- 当前只完成 P0 工程运行基线，不代表正式教学实验已完成。
- Lab1-Lab7 仍是规划和文档骨架。
- 尚未建立 GitLab CI。
- 尚未形成完整 AI 交互记录归档。
- 部分官方赛题细节来自截图和人工说明，后续应整理为仓库内参考资料。

## 后续每阶段记录模板

```markdown
## 阶段名称

- 日期：
- 人类参与者：
- AI 工具/模型：
- 阶段目标：
- 人类输入的关键需求：
- AI 给出的主要建议：
- 人工采纳的建议：
- 人工调整或否决的建议：
- 修改文件：
- 实际执行命令：
- 测试结果：
- 遗留问题：
- 下一步计划：
```

## 待项目成员补充

- 官方完整任务书或网页内容归档。
- 队员分工。
- 后续每次关键 AI 协作的摘要记录。
- 演示视频、答辩材料和最终报告中的 AI 使用说明。
