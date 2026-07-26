# 演示视频与答辩讲解脚本

本文档用于准备作品演示视频和现场答辩。建议视频控制在 5 到 8 分钟，重点展示项目目标、实验路线、自动测试和最终运行效果。

## 1. 开场介绍

讲解要点：

- 本项目参加 2026 年全国大学生计算机系统能力大赛操作系统设计赛。
- 赛道为 OS 功能挑战赛道第 20 题：AI 合作的操作系统教学实验环境。
- 项目使用 Rust 编写 RISC-V 64 教学内核，通过 QEMU/OpenSBI 运行。
- 项目目标不是追求工业级完整 OS，而是构建适合本科生学习的递进式实验平台。

可展示文件：

- `README.md`
- `docs/requirements.md`
- `docs/labs/README.md`

## 2. 仓库和分支结构

讲解要点：

- P0 是工程运行基线，不计入正式实验。
- Lab1 到 Lab7 是正式教学实验。
- 每个实验都有 `labN-starter` 和 `labN-solution`。
- starter 保留学生任务边界，solution 提供教师参考答案。

可运行命令：

```powershell
git branch -vv
git log --oneline --decorate -12
```

## 3. 实验路线

按以下顺序介绍：

1. Lab1：启动与 SBI 控制台。
2. Lab2：Trap 与异常处理。
3. Lab3：物理内存管理。
4. Lab4：Sv39 虚拟内存。
5. Lab5：任务管理与协作式调度。
6. Lab6：用户态与系统调用。
7. Lab7：设备与简化文件系统。

讲解重点：

- 每个实验约 3 个递进小任务。
- 难度面向普通本科生，先看得见输出，再理解内部机制。
- 高级内容如抢占式调度、ELF、virtio-block 放到扩展任务。

可展示文件：

- `docs/labs/lab1.md`
- `docs/labs/lab4.md`
- `docs/labs/lab7.md`

## 4. 构建与测试

讲解要点：

- 使用 Rust workspace 和 `kernel` crate。
- 默认目标是 `riscv64gc-unknown-none-elf`。
- QEMU 使用 `virt` 机器和 `-bios default` 进入 OpenSBI。
- 自动测试不只看进程启动，还检查稳定 PASS marker。

可运行命令：

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

## 5. QEMU 最终演示

运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

讲解输出：

```text
[Lab1] PASS
[Lab2] PASS
[Lab3] PASS
[Lab4] PASS
[Lab5] PASS
[Lab6] PASS
[Lab7] PASS
```

Lab7 重点输出：

```text
[Lab7] start
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

解释：

- Lab6 先进入最小用户态并处理系统调用。
- Lab7 用户程序继续触发文件 I/O 系统调用。
- 内核通过内存设备和简化文件系统完成 `open/write/read/close`。
- 成功后输出 `[Lab7] PASS` 并通过 SBI 退出 QEMU。

## 6. AI 协作说明

讲解要点：

- AI 参与需求分析、实验方案设计、代码生成、错误修复、测试执行和文档整理。
- 人类负责关键需求确认、教学难度控制、分支策略和最终取舍。
- AI 协作记录保存在 `docs/ai-collaboration.md`。

可展示文件：

- `docs/ai-collaboration.md`
- `docs/final-acceptance-report.md`

## 7. 结尾总结

总结话术：

本项目已经完成 P0 工程基线和 7 个递进式正式教学实验。每个实验都有学生 starter、教师 solution、自动测试和 Markdown 文档。当前实现覆盖启动、异常、物理内存、虚拟内存、任务调度、用户态系统调用和简化文件系统，能够通过 QEMU 完成端到端验收。

后续扩展方向：

- 高地址内核映射。
- 抢占式调度和多核调度。
- ELF 加载和多进程。
- virtio-block 和真实文件系统。
- 更完整的在线实验评测平台。
