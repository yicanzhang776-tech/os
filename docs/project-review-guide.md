# AI 合作的操作系统教学实验环境：项目复习与评审指南

> 取证日期：2026-08-13。集成前事实基线为 `origin/main` `4e60638` 与 `origin/agent-mvp` `d46cbba`；首次集成发布提交为远端 `main` `18182c1`，当前正式状态以本指南所在的远端分支 HEAD 为准。测试数字只引用本轮实际命令。

## 一句话定位

项目以真实 Rust/RISC-V 教学内核为载体，用 P0、七个递进 Lab、starter/solution 答案隔离、Stage 验收、运行可视化、证据约束教学智能体、自愿远程反馈和教师人工评分组成本科教学闭环。

## 最新能力与数据口径

AI 教学助教通过本地 `/api/agent` 调用火山方舟 Agent Plan，六个白名单工具只允许读取受限教学证据或启动登记测试。首次提问需要会话级明确同意，模型回答不是标准答案、根因判定或评分依据。预测/回放/本地诊断、主动反馈、方舟智能体和本地评分分别使用不同数据链路，详见 [教学智能体与数据边界](teaching-agent.md)。

## 读者入口

- 学生：当前 `labN-starter` 根 README、任务书、提示、测试和可视化页面。
- 教师：对应 `labN-solution`、教师指南，以及 `main` 的评分工具。
- 评委：`main` 的 README、DESIGN、架构、验收报告、Demo 和答辩 PPT。

## 首次集成发布取证点

| 分支 | 提交 | 分支 | 提交 |
|---|---|---|---|
| `main` | `18182c1` | `p0-minimal-qemu-baseline` | `9dd630a` |
| `lab1-starter` | `4f2bdfc` | `lab1-solution` | `0b294be` |
| `lab2-starter` | `9f2f2da` | `lab2-solution` | `6e3a3c5` |
| `lab3-starter` | `702998e` | `lab3-solution` | `b4302bf` |
| `lab4-starter` | `d83e5c8` | `lab4-solution` | `e1da166` |
| `lab5-starter` | `2e83fb2` | `lab5-solution` | `9304591` |
| `lab6-starter` | `449555c` | `lab6-solution` | `ad15c61` |
| `lab7-starter` | `ea4bc7d` | `lab7-solution` | `ed67c4a` |

以上为首次集成发布后的远端提交，用于说明本轮内容来源，不冒充后续修正文档所在分支的最新 HEAD。可视化分支为 `e1047ca`，教师评分分支为 `36a37f7`；`agent-mvp` `d46cbba` 保留为开发历史来源。所有同步均以发布前最新远端为基线，没有使用落后的传统本地备份分支作为事实来源。

## P0-Lab7 路线

| 阶段 | 机制 | 教学边界 |
|---|---|---|
| P0 | Rust 裸机、QEMU/OpenSBI、SBI 输出与退出 | 工程基线，不计正式实验 |
| Lab1 | boot、启动栈、SBI console | 建立可观察入口 |
| Lab2 | trap、scause、sepc、breakpoint | 不提前引入中断并发 |
| Lab3 | 地址类型与物理页分配 | 无通用堆 |
| Lab4 | Sv39、PTE、satp、sfence.vma | 先用恒等映射 |
| Lab5 | TCB、状态机、上下文切换 | 单 hart、协作式、内核态 |
| Lab6 | U-mode、ecall、syscall | 内置程序，不做 ELF/多进程 |
| Lab7 | RAM device、SimpleFs、fd、文件 syscall | 不做真实磁盘和复杂路径 |

## 可视化必须讲清的内容

1. `telemetry.rs` 把教学事件写入 SBI 串口，本地桥接器将真实 QEMU 输出转换为 `os-demo.event/v1`。
2. 学生先预测，再明确启动构建/QEMU；页面不会自动切分支或上传代码。
3. 事件知识目录把 `lab + step` 关联到代码符号、知识点、原因和状态变化。
4. 回放、筛选和分支差异都基于原始事件；隐藏事件不会从状态计算中消失。
5. 诊断是本地确定性规则，只在证据充分时报告现象，根因统一作为可能原因。
6. `os-demo.run/v1` 可本地导入导出，并作为教师评分的客观证据来源。

## 两类评价不能混淆

- 教学反馈：学生/教师对讲解和工具的主观体验，不计算成绩。
- 教师评分：七套 100 分量表，可导入运行证据，但仍依赖代码审查、报告和口试；不会自动增加分数。

## 测试与可靠性

- host tests 验证纯 Rust 算法，QEMU 验证 CSR、SBI、分页、切换和 U-mode 等真实路径。
- solution 使用 `-Stage 1/2/3`，starter 起点使用 `-ExpectIncomplete`。
- 8 月 8 日可靠性同步曾覆盖 Stage 参数；本轮以回归测试恢复，并保留显式目标、旧产物清理、退出码和超时处理。
- 看到 PASS 不足以证明理解或排除硬编码，教师必须检查禁止修改范围和真实控制流。
- 2026-08-13 集成前 `origin/main` Node 基线 176/176 通过；当时最终全量回归为 585 项中 579 通过、6 跳过、0 失败。2026-08-16 在当前 `main @ b4b5675` 重新执行 31 个 Node 测试文件，结果为 586 项中 580 通过、6 跳过、0 失败。
- 2026-08-16 复核确认 Rust 格式、RISC-V workspace 构建、Clippy、`os-demo-event` 9/9、内核主机测试 46/46、main QEMU，以及 7 个 starter incomplete 和 7 个 solution Stage 3 共 14/14 分支验收通过。21 个既有交付分支的提交材料导航已原子同步并逐分支核对；在线 Agent Plan 未运行，远程 CI 结果尚未核实。

## 当前审计提醒

- 正式 PPT 已在仓库中；演示视频状态仍需成员确认。
- 远程教学分支包含 CI 文件，但流水线是否成功必须查看平台记录。
- 官方题目和评分整理仍缺脱敏原始截图，不能凭记忆补写。
- 本地可视化与教师评分不自动联网；自愿反馈使用负责人 HTTPS/JSONL 服务，教学智能体在同意后使用方舟云端模型。

## 答辩推荐路线

`main README` → `labN-starter` 任务与 Stage → 预测和真实 QEMU → 本地规则诊断 → 手动教学智能体 → 回放/分支对比 → 主动反馈或运行证据提交 → 教师评分导入与人工复核 → 教学边界和 AI 协作。
