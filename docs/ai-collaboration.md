# AI 协作记录

本文档记录本项目的人机协作过程，用于满足比赛对 AI 工具使用说明、过程记录和成果归因的要求。

## 记录原则

- 记录真实发生的协作内容。
- 不编造不存在的讨论、测试或决策。
- 无法确认的历史内容标记为“待项目成员补充”。
- 记录关注需求、决策、实现、验证和人工取舍，不堆砌完整聊天流水。
- 不记录账号、密码、Token、私有仓库地址或个人隐私。

## 人类负责的内容

- 确认比赛题目和赛道：2026 年全国大学生计算机系统能力大赛，操作系统设计赛，OS 功能挑战赛道第 20 题。
- 确认项目名称：AI 合作的操作系统教学实验环境。
- 确认 P0 与 Lab1-Lab7 的区别。
- 确认 7 个递进式教学实验路线。
- 提供官方 GitLab 仓库和赛题截图信息。
- 决定 P0、Lab1、Lab2 采用独立分支保存稳定基线、学生起点和参考答案。
- 决定本阶段不 push、不进入 Lab3。

## AI 负责的内容

- 根据赛题要求提出 P0/P1/P2/P3 阶段划分建议。
- 设计 7 个递进式教学实验方案。
- 生成项目规范文档和实验文档骨架。
- 生成 P0 最小 Rust/RISC-V/QEMU 内核基线代码。
- 补充构建、运行、环境检查和 QEMU 冒烟测试脚本。
- 将 Lab1 拆分为启动、SBI 和 console 教学实验。
- 将 Lab2 拆分为 trap starter 和 trap solution。
- 执行并报告实际格式检查、构建、Clippy 和 QEMU 测试结果。

## 当前 P0 阶段采用的方案

P0 采用最小可运行内核方案：

- 使用 Rust `no_std`/`no_main`。
- 使用 `riscv64gc-unknown-none-elf` 目标。
- 使用 QEMU `virt` 机器。
- 使用 QEMU `-bios default` 加载 OpenSBI。
- OpenSBI 进入 S-mode 后跳转到内核入口。
- 内核输出最小启动日志和 `[P0] PASS`。
- 使用 SBI system reset 退出 QEMU。

## Lab1 阶段采用的方案

Lab1 从 P0 派生：

- `lab1-starter` 保留启动、SBI console 和成功标志 TODO。
- `lab1-solution` 补全成功标志，输出 `[Lab1] PASS`。
- Lab1 不引入 trap、memory、task、syscall、user、fs 或 drivers。
- Lab1 使用 `scripts/test-lab1.ps1` 作为 solution 验收脚本。

## Lab2 阶段采用的方案

Lab2 从 Lab1 solution 派生：

- `lab2-starter` 新增 `trap` 模块教学边界，但不安装完整 trap 入口。
- `lab2-solution` 安装 S-mode trap entry，触发并处理 breakpoint 异常。
- 参考实现使用 32 位 `ebreak`，处理后将 `sepc` 推进 4 字节。
- Lab2 使用 `scripts/test-lab2.ps1` 作为 solution 验收脚本。
- Lab2 不引入 Lab3 及之后功能。

## 实际执行过的构建和测试命令

已执行过的命令包括：

```powershell
git branch --show-current
git status
git status --short
git branch -vv
git log --oneline --decorate --graph --all -20
git merge-base p0-minimal-qemu-baseline lab1-starter
git merge-base lab1-starter lab1-solution
git merge-base lab1-solution lab2-starter
git merge-base lab2-starter lab2-solution
cargo fmt --all
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
git diff --check
git diff --stat
```

具体输出以终端记录和阶段总结为准。

## AI 建议被人工调整或否决的内容

- AI 曾建议安装 Superpowers 插件的本地缓存方案，后来按人工要求撤销该安装步骤。
- AI 曾在实验文档中提前列出较具体的未来函数和目录，后来按人工要求收敛为文档骨架，并将未确定内容标记为“待 P0 架构确定后补充”。
- 关于“最新教学实验环境”是否特指 rCore 参考项目，目前尚未确认，标记为待项目成员补充。
- 当前 starter 分支直接运行正式 solution 测试会失败。后续 CI 方案需要人工确认采用教师专用脚本、模式参数，或按分支名选择验证方式。

## 已知限制

- 当前完成 P0、Lab1 和 Lab2 的本地分支基线，尚未 push。
- Lab3-Lab7 尚未实现。
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
