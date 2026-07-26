# 赛题要求映射

本文档用“赛题要求 - 项目实现 - 验收方式”映射当前状态。未完成内容标记为“规划中”，不把规划内容写成已完成。

| 赛题要求 | 项目实现状态 | 验收方式 |
|---|---|---|
| Rust 内核 | P0 已具备最小 Rust 裸机内核；正式教学模块仍规划中 | `cargo build -p ai-os-kernel` |
| RISC-V 64 | P0 已配置 `riscv64gc-unknown-none-elf` | 检查 `.cargo/config.toml` 和构建目标 |
| QEMU 运行 | P0 已能在 QEMU `virt` + OpenSBI 下输出最小日志 | `scripts/test-qemu.ps1` 或 `make test-qemu` |
| 至少 5 个教学实验 | 规划中；当前正式规划 7 个递进式教学实验 | 查看 `docs/labs/README.md` 和 Lab 文档 |
| Rust Crate 模块化 | P0 有 workspace 和 `kernel` crate；多个 crate 规划中 | `cargo metadata`；后续检查 workspace 成员 |
| 单元测试或系统测试 | P0 有 QEMU 冒烟测试；主机单测和实验系统测试规划中 | `scripts/test-qemu.ps1`；后续 `scripts/test-lab.ps1` |
| 可发布 Crate 条件 | 规划中；P0 kernel 当前 `publish = false` | 后续检查 license、README、docs、`cargo package` |
| Markdown 文档 | 已建立文档骨架 | 检查 `docs/` |
| Mermaid 图 | 已在规划文档中使用 Mermaid | Markdown 渲染检查 |
| 创新性 | 规划中；方向为 AI 协作学习记录、递进式反馈、自动测试闭环 | 后续查看设计报告和 AI 协作记录 |
| 完整性 | 规划中；P0 仅完成运行基线 | 阶段验收表和最终演示 |
| 代码质量 | P0 代码已按最小基线编写；完整规则见 `AGENTS.md` | `cargo fmt`、`cargo clippy`、代码审阅 |
| 文档完整性 | 已建立骨架；详细内容仍需随实现补齐 | 检查 requirements、architecture、plan、testing、labs |

## 评分维度对齐

- 创新性：规划中，重点体现 AI 协作教学设计和自动反馈。
- 完整性：规划中，最终需要 P0、Lab1-Lab7、测试、文档和演示材料闭环。
- 代码质量：P0 已有最小规范，后续模块需持续执行格式化、Clippy 和测试。
- 文档完整性：当前为骨架，后续随代码实现逐步补齐细节。
