# 项目验收状态报告

日期：2026-08-16
当前事实基线：远端 `main @ b4b5675`，五项实验报告分支 `tg-rcore-five-lab-report @ 805629b`。
正式交付范围包含 21 个既有 GitLab 远端分支：17 个教学上下文分支和 4 个辅助分支。根目录提交材料导航已原子同步到这 21/21 个分支，未创建远端 `codex/*` 分支。推送本报告所在的临时 `docs/final-material-sync` 分支后，远端物理总数暂为 22；该临时分支不计入产品分支统计，当前正式状态以本报告所在分支最终提交为准。

> 本报告只把实际执行结果记为通过。2026-08-13 的 Stage 全量结果作为历史验收保留；2026-08-16 的五项实验上传后复核单独列出。远程 CI 的平台结果尚未核实，Agent Plan 在线八项联调仍标记为“未运行”。

## 本轮已确认结果

| 项目 | 结果 |
|---|---|
| 2026-08-13 历史 Node 全量回归 | 585 项：579 通过、6 跳过、0 失败；保留为当时集成证据 |
| 2026-08-16 当前 Node 全量回归 | 31 个测试文件；586 项：580 通过、6 跳过、0 失败 |
| `cargo fmt --all -- --check` | 通过 |
| RISC-V 交叉构建 | `cargo build --workspace --target riscv64gc-unknown-none-elf` 通过 |
| Clippy | `cargo clippy --workspace --target riscv64gc-unknown-none-elf -- -D warnings` 通过 |
| 主机单元测试 | `cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc`：46/46 通过 |
| 独立事件协议 Crate | `cargo test -p os-demo-event --target x86_64-pc-windows-msvc --locked`：9/9 通过 |
| 通用 `cargo test --workspace` | 失败：仓库默认 RISC-V 目标没有 `test` crate；显式主机 workspace 测试又因裸机 binary 的 `panic_impl` 与 `std` 冲突；未修改内核来掩盖该事实 |
| 2026-08-13 main P0 与 Stage | P0 QEMU 通过；Lab1-Lab7 的 Stage 1/2/3 共 21/21 通过 |
| 2026-08-13 七个 solution 分支 | Stage 1/2/3 共 21/21 通过 |
| 2026-08-13 七个 starter 分支 | `-ExpectIncomplete` 7/7 通过；默认完整验收 7/7 按预期失败且无当前 Lab PASS；冲突参数 7/7 明确拒绝 |
| P0 正式分支 | QEMU smoke 通过 |
| 21 个既有交付分支提交材料导航 | 21/21 远端提交与对应本地分支一致；导航 Blob 完全相同 |
| starter 答案隔离 | 7/7 无答案/教师文件、无对应 Markdown 链接、无内核改动；工具策略含拒绝规则 |
| 24 页正式 PPT | 24 页；第 4、22 页已更新为 21 个既有交付分支、580/586 Node 结果和五项实验报告状态，并重新渲染检查 |
| `git diff --check` | 2026-08-16 文档收尾分支复核通过；最终提交前仍需再次执行 |
| 远端发布 | 21/21 个既有交付分支的导航更新原子推送成功；提交逐一匹配。推送本临时文档分支后远端物理总数暂为 22，远端 `codex/*` 为 0 |
| 远程 CI | 已完成推送；当前环境无法读取 GitLab 流水线最终状态，记为“结果未核实” |
| Agent Plan 在线八项联调 | 未运行，尚未在本轮进程中安全取得有效密钥 |

## 五项实验上传后统一复核（2026-08-16）

| 复核项 | 实际结果 | 判定 |
|---|---|---|
| main 文档入口 | 根 `README.md`、`docs/README.md` 和全分支根导航均可进入 PDF、Markdown 与证据目录 | 通过 |
| 远端分支与导航 | 临时文档分支发布前为 21 个既有交付分支；21/21 导航 Blob 一致 | 通过 |
| 报告相对链接 | README、文档索引、五项报告和导航共检查 99 个相对链接，零断链 | 通过 |
| 当前文档收尾分支 Markdown | 全仓检查 124 个相对链接，零断链 | 通过 |
| 五项实验材料 | 5 份补丁、15 张分章截图、15 份分章日志、环境记录、AI 协作记录、manifest、Markdown 与 PDF 均存在 | 通过 |
| 证据哈希 | 报告分支以 Git Blob 的 LF 字节为规范重新生成 22 个文本哈希；43 项全部匹配，manifest 已记录 `SHA-256`、`LF`、`43/43` | 已提交并推送至 `tg-rcore-five-lab-report @ 805629b` |
| starter 答案隔离 | 7/7 不含目标 `SOLUTION.md`、`TEACHER_GUIDE.md`；实际 QEMU 均停在对应 TODO | 通过 |
| starter/solution QEMU | 7 个 starter incomplete + 7 个 solution Stage 3，14/14 退出码为 0 | 通过 |
| main QEMU/OpenSBI | P0 与 Lab1-Lab7 PASS、`os-demo.event/v1` 结构化事件均出现 | 通过 |
| Rust 与 Node | rustfmt、RISC-V build、Clippy、事件 Crate 9/9、内核 46/46、Node 580/586 且 0 失败 | 通过 |
| 五项实验 PDF | 根 PDF 与正式 PDF SHA-256 均为 `4a4e83d15b79a9733c5a43ea72eeec99484594c0a940a7d80c4a97601de0aa88`；30 页可提取文本，抽查页面无乱码、裁切或重叠 | 通过 |
| PPT 更新 | 24 页全部导出为 1920×1080 图片；24/24 有效，总览无空白页，第 4、22 页数字和状态更新后无溢出、重叠或截断 | 通过 |

manifest 的 22 项 CRLF/LF 哈希不一致已在报告分支修复并推送。修复只更新 manifest，没有改写日志、补丁、截图或 PDF；验证同时读取 Git Blob 和当前工作树文件，43/43 匹配。远端修复提交为 `tg-rcore-five-lab-report @ 805629b`。

## 分支与材料状态

- `main`：评委和教师集成入口，包含 P0-Lab7、可视化、教师评分工具和答辩 PPT。
- `p0-minimal-qemu-baseline`：工程运行基线。
- `lab1-starter/solution` 至 `lab7-starter/solution`：14 个正式教学分支。
- `interactive-demo-learning-map` 与上述 16 个分支共同组成 17 个教学上下文。
- `agent-mvp`、`lab-atlas-ai-tutor`、`teacher-grading-tools`、`tg-rcore-five-lab-report`：4 个辅助功能与报告分支。
- `docs/final-material-sync`：仅用于本轮文档审阅与合并的临时发布分支，不属于上述 21 个正式交付分支。
- 远程教学分支均包含当前 CI 配置；CI 文件存在不等于远程流水线已经成功，需另查平台记录。
- 正式 PPT 已存在。演示视频是否录制完成尚未由项目成员确认。

## 历史验收记录的处理

8 月 9 日报告中的 host、Node、Stage、分支链接和 22 页 PPT 数字只代表当时旧基线。8 月 13 日的 585 项 Node、18 个同步分支和 Stage 全量结果保留为历史记录；当前提交状态以 8 月 16 日的 586 项 Node、21 个远端分支和上方上传后统一复核表为准。在线 Agent Plan 仍未运行，远程 CI 结果尚未核实，演示视频状态仍待项目成员确认。

## Stage 回归原因与修复边界

8 月 8 日的可靠性同步保留了显式目标构建、旧产物清理、构建退出码、日志分离和超时处理，但替换脚本时丢失了 `-Stage` 参数及阶段 marker 判定。本轮通过失败回归测试确认该问题，再恢复 `-Stage 1/2/3`、与 `-ExpectIncomplete` 的互斥检查及阶段证据验证。

## 当前限制

- Lab5 不包含抢占、多核或复杂优先级。
- Lab6 不包含 ELF、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘或复杂目录树。
- 预测、回放、规则诊断和教师评分保持本地；反馈/脱敏运行记录可主动提交到负责人服务，教学智能体可在同意后发送受限证据到火山方舟。
- 教学反馈不计算成绩；教师评分不能只凭 PASS，必须人工复核代码、报告和口试。
