# AI 合作的操作系统教学实验环境：项目复习与评审指南

> 取证日期：2026-08-09。代码和分支事实以最新 `origin/*` 为准；测试数字只引用同一工作区实际命令。

## 一句话定位

项目以真实 Rust/RISC-V 教学内核为载体，用 P0、七个递进 Lab、starter/solution 答案隔离、Stage 验收、运行可视化和教师评分组成本科教学闭环。

## 读者入口

- 学生：当前 `labN-starter` 根 README、任务书、提示、测试和可视化页面。
- 教师：对应 `labN-solution`、教师指南，以及 `main` 的评分工具。
- 评委：`main` 的 README、DESIGN、架构、验收报告、Demo 和答辩 PPT。

## 远程取证基线

| 分支 | 提交 | 分支 | 提交 |
|---|---|---|---|
| `main` | `ef6e401` | `p0-minimal-qemu-baseline` | `9d1ed35` |
| `lab1-starter` | `b51b941` | `lab1-solution` | `ebee81f` |
| `lab2-starter` | `79ffc96` | `lab2-solution` | `443554b` |
| `lab3-starter` | `5c87868` | `lab3-solution` | `9c3eb30` |
| `lab4-starter` | `27ff99d` | `lab4-solution` | `ebabc04` |
| `lab5-starter` | `e8cb62f` | `lab5-solution` | `2b51de3` |
| `lab6-starter` | `226a29f` | `lab6-solution` | `ec94a63` |
| `lab7-starter` | `57473da` | `lab7-solution` | `72d18b0` |

所有文档同步均基于上述远程提交完成；没有使用落后的本地教学分支作为事实来源。

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
- 2026-08-09 实测：46 项 host tests、133 项前端/评分测试、main 21 组 Stage、solution 21 组 Stage、starter 7 组 `-ExpectIncomplete` 和 7 组默认失败语义全部符合预期；P0 QEMU 通过。
- 16 个正式分支 Markdown 相对链接为零断链；22 页 PPT 已完成全页渲染和溢出检查。

## 当前审计提醒

- 正式 PPT 已在仓库中；演示视频状态仍需成员确认。
- 远程教学分支包含 CI 文件，但流水线是否成功必须查看平台记录。
- 官方题目和评分整理仍缺脱敏原始截图，不能凭记忆补写。
- 可视化和评分工具均为本地优先实现，没有服务器、数据库、统一登录或云同步。

## 答辩推荐路线

`main README` → `labN-starter` 任务与 Stage → 可视化预测和真实运行 → 时间线回放/分支对比/诊断 → 导出运行证据 → 教师评分导入与人工复核 → QEMU 最终 PASS → 教学边界和 AI 协作。
