# 项目验收状态报告

日期：2026-08-13
集成前事实基线：`origin/main` `4e606380cc4c3e9a349d41d5700114d1435bb2c2`，`origin/agent-mvp` `d46cbba54e6d0db06ec6bf5fe364245c9c39bb1e`
首次集成发布提交：远端 `main` `18182c1`；其余 17 个既有远端分支也已分别更新，未创建远端 `codex/*` 分支。当前正式状态以本报告所在的远端分支 HEAD 为准。

> 本报告只把实际执行结果记为通过。远程分支推送已经完成，但远程 CI 的平台结果尚未核实；Agent Plan 在线八项联调仍标记为“未运行”。本地 Rust/QEMU、全分支同步、链接与 24 页 PPT 视觉验收均引用截至 2026-08-13 的实际输出，不沿用 8 月 9 日数字。

## 本轮已确认结果

| 项目 | 结果 |
|---|---|
| 合并前 `origin/main` Node 基线 | 176/176 通过 |
| 合并后完整 Node 基线 | 577 项：571 通过、6 跳过、0 失败；跳过项为在线方舟与 Windows 不支持的链接节点场景 |
| 学生端与上下文定向测试 | 80/80 通过 |
| 集成完成后的最终 Node 全量回归 | 585 项：579 通过、6 跳过、0 失败；包含新增学生端同意、错误映射、纯文本渲染和演示模式测试 |
| `cargo fmt --all -- --check` | 通过 |
| RISC-V 交叉构建 | `cargo build --workspace --target riscv64gc-unknown-none-elf` 通过 |
| Clippy | `cargo clippy --workspace --target riscv64gc-unknown-none-elf -- -D warnings` 通过 |
| 主机单元测试 | `cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc`：46/46 通过 |
| 通用 `cargo test --workspace` | 失败：仓库默认 RISC-V 目标没有 `test` crate；显式主机 workspace 测试又因裸机 binary 的 `panic_impl` 与 `std` 冲突；未修改内核来掩盖该事实 |
| main P0 与 Stage | P0 QEMU 通过；Lab1-Lab7 的 Stage 1/2/3 共 21/21 通过 |
| 七个 solution 分支 | Stage 1/2/3 共 21/21 通过 |
| 七个 starter 分支 | `-ExpectIncomplete` 7/7 通过；默认完整验收 7/7 按预期失败且无当前 Lab PASS；冲突参数 7/7 明确拒绝 |
| P0 正式分支 | QEMU smoke 通过 |
| 18 个同步工作分支核心 Node 回归 | 18/18 进程退出码为 0 |
| 18 个工作分支 Markdown 相对链接 | 18/18 零断链 |
| starter 答案隔离 | 7/7 无答案/教师文件、无对应 Markdown 链接、无内核改动；工具策略含拒绝规则 |
| 24 页正式 PPT | 24 页；仓库溢出检查通过；PowerPoint 全页复渲染检查通过；真实 8891 管理页截图已替换 |
| `git diff --check` | 集成分支与 17 个同步工作分支全部通过 |
| 远端发布 | 18/18 个既有目标分支原子推送成功；推送后提交逐一匹配，远端分支总数仍为 19，远端 `codex/*` 为 0 |
| 远程 CI | 已完成推送；当前环境无法读取 GitLab 流水线最终状态，记为“结果未核实” |
| Agent Plan 在线八项联调 | 未运行，尚未在本轮进程中安全取得有效密钥 |

## 分支与材料状态

- `main`：评委和教师集成入口，包含 P0-Lab7、可视化、教师评分工具和答辩 PPT。
- `p0-minimal-qemu-baseline`：工程运行基线。
- `lab1-starter/solution` 至 `lab7-starter/solution`：14 个正式教学分支。
- 远程教学分支均包含当前 CI 配置；CI 文件存在不等于远程流水线已经成功，需另查平台记录。
- 正式 PPT 已存在。演示视频是否录制完成尚未由项目成员确认。

## 历史验收记录的处理

8 月 9 日报告中的 host、Node、Stage、分支链接和 22 页 PPT 数字只代表当时旧基线，不作为本轮集成证据。上表已经写入本轮 Rust、QEMU、全分支、24 页 PPT 和正式推送结果；在线 Agent Plan 仍未运行，远程 CI 结果尚未核实，演示视频状态仍待项目成员确认。

## Stage 回归原因与修复边界

8 月 8 日的可靠性同步保留了显式目标构建、旧产物清理、构建退出码、日志分离和超时处理，但替换脚本时丢失了 `-Stage` 参数及阶段 marker 判定。本轮通过失败回归测试确认该问题，再恢复 `-Stage 1/2/3`、与 `-ExpectIncomplete` 的互斥检查及阶段证据验证。

## 当前限制

- Lab5 不包含抢占、多核或复杂优先级。
- Lab6 不包含 ELF、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘或复杂目录树。
- 预测、回放、规则诊断和教师评分保持本地；反馈/脱敏运行记录可主动提交到负责人服务，教学智能体可在同意后发送受限证据到火山方舟。
- 教学反馈不计算成绩；教师评分不能只凭 PASS，必须人工复核代码、报告和口试。
