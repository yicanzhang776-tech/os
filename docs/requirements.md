# 赛题要求映射

本文档用“赛题要求 - 项目实现 - 验收方式”映射当前状态。已实现内容基于本地分支和真实测试记录；仍未覆盖的内容明确标记为“扩展”或“后续材料”。

## 新增教学创新与验收映射

| 能力 | 当前实现 | 验收证据 |
|---|---|---|
| 教学智能体 | `POST /api/agent`、`os-tutor.agent/v1`、火山方舟 Agent Plan、六个白名单工具 | API/循环/工具/模型客户端/学生端测试；在线八项联调单独记录 |
| 首次数据同意 | 会话级 `os-teaching-agent-consent-v1`；页面说明受限证据可能发送云端 | 未同意不请求、会话存储、4000 字符、纯文本和演示模式测试 |
| 远程教学反馈 | 主动预览同意后向 HTTPS 接收服务提交反馈或脱敏运行记录 | 8890 协议、CORS、邀请码、大小、幂等、脱敏和 JSONL 测试 |
| 教师人工评分 | 七套 100 分量表，可导入运行证据但不自动加分 | 本地多记录、导入导出、建议封顶、评分核心测试和人工审查 |
| 数据边界 | 本地确定性链路、主动反馈链路、方舟智能体链路、本地评分链路分离 | 文档扫描、浏览器告知、无密钥上下文和错误净化测试 |

智能体的目标是提供证据化提示，不是生成完整答案、自动确定根因或代替教师评分。

| 赛题要求 | 项目实现状态 | 验收方式 |
|---|---|---|
| Rust 内核 | 已实现。`kernel` crate 使用 Rust `no_std`/`no_main` 构建教学内核 | `cargo build -p ai-os-kernel` |
| RISC-V 64 | 已实现。目标为 `riscv64gc-unknown-none-elf` | 检查 `.cargo/config.toml`；执行交叉编译 |
| QEMU 运行 | 已实现。QEMU `virt` + OpenSBI 进入 S-mode，运行 P0-Lab7 | `scripts/test-qemu.ps1`；`scripts/test-lab*.ps1` |
| 至少 5 个教学实验 | 已实现 7 个递进式教学实验，每个实验有 starter/solution 分支 | 查看 `docs/labs/README.md`、`labN-starter`、`labN-solution` |
| Rust Crate 模块化 | 已实现 workspace、`kernel` crate 和独立的 `os-demo-event` no_std Crate；后者由内核 telemetry 实际调用 | `cargo metadata`；`cargo test -p os-demo-event`；代码结构审查 |
| 单元测试或系统测试 | 已实现主机单元测试和 QEMU 系统测试 | `cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc`；Lab 脚本 |
| 可发布 Crate 条件 | `os-demo-event` 已具备说明文档、许可、仓库元数据和公开 API 边界；内核 crate 仍保持 `publish = false` | `cargo package -p os-demo-event --allow-dirty`；检查两个 `Cargo.toml` |
| Markdown 文档 | 已建立并持续更新需求、架构、计划、测试、AI协作和实验文档 | 检查 `docs/` 和根 `README.md` |
| Mermaid 图 | 已在实验路线和部分实验文档中使用 Mermaid | Markdown 渲染检查 |
| 创新性 | 已体现：AI 协作记录、starter/solution 分支、自动化 QEMU 验收、三段式本科教学任务设计 | 查看 `docs/ai-collaboration.md` 和 `docs/labs/` |
| 过程可视化 | 已实现。内核遥测和稳定串口输出经本地桥接器转换为知识地图、时间线、事件解释与系统状态 | 启动 `scripts/run-interactive-demo.*`；检查真实 QEMU 事件 |
| 学习闭环 | 已实现运行前预测、预测与实际对照、时间线回放、starter/solution 差异和本地规则诊断 | `docs/interactive-demo/README.md`；Node 自动测试 |
| 教学评价 | 已实现分支相关的五题教学反馈；仅本地保存或由使用者主动导出/提交，不计算成绩 | 可视化页面反馈区；`feedback.test.js` |
| 教师评分 | 已实现七套 100 分量表、多学生本机记录、运行证据导入、人工复核与导出 | `docs/teacher-grading/README.md`；`grading-core.test.js` |
| 完整性 | 已完成 P0 和 Lab1-Lab7 闭环；最终设计方案与开发文档、提交检查清单和演示脚本已加入仓库 | 全量验收命令和最终材料审查 |
| 代码质量 | 已执行格式化、Clippy、主机单测和 QEMU 回归；unsafe 边界在实验文档中说明 | `cargo fmt --all -- --check`；`cargo clippy -p ai-os-kernel -- -D warnings` |
| 文档完整性 | 已覆盖实验目标、任务边界、测试方法、常见错误、教师验收和最终设计方案与开发文档 | 检查 `docs/labs/*.md`、`docs/testing.md`、`docs/final-report.md` |

## 评分维度对齐

- 创新性：通过 AI 协作记录、递进式教学分支、真实运行可视化、预测回放和双层评价体系体现。
- 完整性：P0 与 Lab1-Lab7 已形成构建、运行、测试闭环；仓库已补充最终设计方案与开发文档、提交检查清单和演示脚本。
- 代码质量：当前要求持续通过 fmt、build、Clippy、主机单元测试和 QEMU 系统测试。
- 文档完整性：实验文档已经覆盖 starter/solution、学生任务、测试和教师验收；最终设计方案与开发文档已整理到 `docs/final-report.md`。

## 当前明确限制

- Lab5 不包含抢占式调度、多核调度或优先级调度。
- Lab6 不包含 ELF 加载、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘、复杂路径解析或工业级文件系统。
- 以上限制属于教学版边界，可作为扩展任务或答辩说明。
