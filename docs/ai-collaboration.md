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
- 提供官方 GitLab 仓库、赛题截图、评分标准和环境资料信息。
- 决定采用 `labN-starter` / `labN-solution` 独立分支模式。
- 决定从 Lab5 开始，每个实验拆成约 3 个递进小任务，整体难度保持中等，面向普通本科生教学。
- 确认 Lab7 基础版本采用内存文件系统，不引入 virtio-block 或真实磁盘。
- 明确未经授权不得执行 `git push`。
- 在最终阶段授权推送 P0、Lab1-Lab7 分支，并授权将 `main` 快进到最终成果用于 GitLab 默认展示。

## AI 负责的内容

- 根据赛题要求提出 P0/P1/P2/P3 阶段划分建议。
- 设计 7 个递进式教学实验方案。
- 生成项目规范文档和实验文档骨架。
- 生成 P0 最小 Rust/RISC-V/QEMU 内核基线代码。
- 补充构建、运行、环境检查和 QEMU 冒烟测试脚本。
- 逐步实现 Lab1-Lab7 的 starter/solution 本地分支。
- 为 Lab3-Lab7 补充主机单元测试和 QEMU 系统测试。
- 执行并报告格式检查、构建、Clippy、主机单元测试和 QEMU 测试结果。
- 在获得人工授权后推送 P0、Lab1-Lab7 分支，统一实验分支命名格式，并同步最终状态文档。

## 阶段方案摘要

| 阶段 | 采用方案 |
|---|---|
| P0 | Rust `no_std`/`no_main` 最小内核，QEMU `virt` + OpenSBI 启动，输出 `[P0] PASS` |
| Lab1 | 启动、SBI 控制台和最小输出路径教学化 |
| Lab2 | S-mode trap entry、breakpoint 异常处理和 `sepc += 4` |
| Lab3 | 物理地址、物理页号和固定范围 frame allocator |
| Lab4 | Sv39 恒等映射、页表页所有权、`satp` 和 `sfence.vma` |
| Lab5 | 单核、内核态、协作式轮转调度，保存 `ra`、`sp`、`s0..s11` |
| Lab6 | 内置用户程序、最小 U-mode 进入、`write`/`exit` 系统调用 |
| Lab7 | 内存设备、简化文件系统、fd 表和 `open/read/write/close` 教学路径 |

## 实际执行过的代表性命令

已执行过的命令包括：

```powershell
git branch --show-current
git status --short
git branch -vv
git log --oneline --decorate --graph --all -20
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
git diff --check
```

具体输出以终端记录和阶段总结为准。

## AI 建议被人工调整或否决的内容

- AI 曾建议安装 Superpowers 插件的本地缓存方案，后来按人工要求撤销该安装步骤。
- AI 曾在实验文档中提前列出较具体的未来函数和目录，后来按人工要求收敛为文档骨架，并将未确定内容标记为“待 P0 架构确定后补充”。
- 人工明确要求从 Lab5 开始不要设计过多小任务，基础任务约 3 个即可；AI 后续按该教学约束调整 Lab5-Lab7。
- 人工确认 Lab4 第一版采用恒等映射，而非高地址内核映射。
- 人工确认 Lab7 基础版本采用内存文件系统，virtio-block 作为扩展而非基础必做。

## 已知限制

- Lab5 未实现抢占式调度、多核调度和优先级调度。
- Lab6 未实现 ELF 加载、多进程和复杂用户指针校验。
- Lab7 未实现 virtio-block、真实磁盘、复杂路径解析和工业级文件系统。
- 仓库已提供最终设计方案与开发文档、提交检查清单、演示脚本和 AI 协作记录；演示视频和答辩 PPT 仍需项目成员按比赛要求制作。

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
- 队员在最终设计报告和答辩材料中的署名分工说明。
- 演示视频、答辩 PPT 和比赛平台最终提交记录。
