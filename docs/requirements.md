# 赛题要求映射

本文档用“赛题要求 - 项目实现 - 验收方式”映射当前状态。已实现内容基于本地分支和真实测试记录；仍未覆盖的内容明确标记为“扩展”或“后续材料”。

| 赛题要求 | 项目实现状态 | 验收方式 |
|---|---|---|
| Rust 内核 | 已实现。`kernel` crate 使用 Rust `no_std`/`no_main` 构建教学内核 | `cargo build -p ai-os-kernel` |
| RISC-V 64 | 已实现。目标为 `riscv64gc-unknown-none-elf` | 检查 `.cargo/config.toml`；执行交叉编译 |
| QEMU 运行 | 已实现。QEMU `virt` + OpenSBI 进入 S-mode，运行 P0-Lab7 | `scripts/test-qemu.ps1`；`scripts/test-lab*.ps1` |
| 至少 5 个教学实验 | 已实现 7 个递进式教学实验，每个实验有 starter/solution 分支 | 查看 `docs/labs/README.md`、`labN-starter`、`labN-solution` |
| Rust Crate 模块化 | 已实现 workspace 和 `kernel` crate；内核内按 `memory`、`task`、`syscall`、`fs` 等模块组织 | `cargo metadata`；代码结构审查 |
| 单元测试或系统测试 | 已实现主机单元测试和 QEMU 系统测试 | `cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc`；Lab 脚本 |
| 可发布 Crate 条件 | 部分满足。当前内核 crate 面向比赛教学工程，`publish = false`；文档、许可和 API 边界可继续完善 | 检查 `kernel/Cargo.toml`；后续可补 `cargo package` 评估 |
| Markdown 文档 | 已建立并持续更新需求、架构、计划、测试、AI协作和实验文档 | 检查 `docs/` 和根 `README.md` |
| Mermaid 图 | 已在实验路线和部分实验文档中使用 Mermaid | Markdown 渲染检查 |
| 创新性 | 已体现：AI 协作记录、starter/solution 分支、自动化 QEMU 验收、三段式本科教学任务设计 | 查看 `docs/ai-collaboration.md` 和 `docs/labs/` |
| 完整性 | 已完成 P0 和 Lab1-Lab7 闭环；最终设计方案与开发文档、提交检查清单和演示脚本已加入仓库 | 全量验收命令和最终材料审查 |
| 代码质量 | 已执行格式化、Clippy、主机单测和 QEMU 回归；unsafe 边界在实验文档中说明 | `cargo fmt --all -- --check`；`cargo clippy -p ai-os-kernel -- -D warnings` |
| 文档完整性 | 已覆盖实验目标、任务边界、测试方法、常见错误、教师验收和最终设计方案与开发文档 | 检查 `docs/labs/*.md`、`docs/testing.md`、`docs/final-report.md` |

## 评分维度对齐

- 创新性：通过 AI 协作过程记录、递进式教学分支和自动反馈脚本体现。
- 完整性：P0 与 Lab1-Lab7 已形成构建、运行、测试闭环；仓库已补充最终设计方案与开发文档、提交检查清单和演示脚本。
- 代码质量：当前要求持续通过 fmt、build、Clippy、主机单元测试和 QEMU 系统测试。
- 文档完整性：实验文档已经覆盖 starter/solution、学生任务、测试和教师验收；最终设计方案与开发文档已整理到 `docs/final-report.md`。

## 当前明确限制

- Lab5 不包含抢占式调度、多核调度或优先级调度。
- Lab6 不包含 ELF 加载、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘、复杂路径解析或工业级文件系统。
- 以上限制属于教学版边界，可作为扩展任务或答辩说明。
