# 比赛提交检查清单

## 2026-08-16 五项实验上传后统一复核

- [x] 根 `README.md`、`docs/README.md` 和全分支导航均提供五项实验 PDF、Markdown 与证据入口。
- [x] 21/21 个既有交付分支包含内容一致的根导航，远端提交与本地对应分支一致；临时文档发布分支不计入产品分支统计。
- [x] 报告关键材料共检查 99 个 Markdown 相对链接，零断链。
- [x] 五项材料包含 5 份补丁、15 张分章截图、15 份分章日志、环境记录、AI 协作记录、manifest、Markdown 与 30 页 PDF。
- [x] manifest 已按 Git Blob 的 LF 规范重新生成 22 个文本哈希，本地文件与 Git Blob 均验证为 43/43 匹配，并已推送至 `tg-rcore-five-lab-report @ 805629b`。
- [x] 7 个 starter 目标答案与教师文档隔离，实际 QEMU 均停在 TODO。
- [x] 7 个 starter incomplete 与 7 个 solution Stage 3 共 14/14 通过；main QEMU/OpenSBI 通过。
- [x] 当前 Node 全量为 586 项中 580 通过、6 跳过、0 失败；在线 Agent Plan 仍为未运行。
- [x] PPT 第 4、22 页已更新为 21 分支、580/586 Node 与五项实验状态，并重新渲染检查。

## 分支与工作区

- [x] 不直接在 `main/master` 修改；本轮使用独立 `docs/final-material-sync` 分支。
- [x] 以最新远程 P0、Lab1-Lab7 starter/solution 为基线。
- [x] starter 不包含目标 `SOLUTION.md`、`TEACHER_GUIDE.md`、答案函数体或可复制补丁。
- [x] `git status --short` 中只有计划内 Markdown 与 PPT，未包含 `target/`、日志、缓存和 PPT 临时文件。

## 教学智能体与数据边界

- [ ] `/api/context.agent` 只含协议、配置状态、提供方、模型和 `remoteStore`，不含密钥或请求头。
- [ ] 未同意时不发送；同意只使用 `os-teaching-agent-consent-v1` 会话键。
- [ ] 4000/4001 字符、纯文本危险 HTML、固定中文错误、上下文变化和任务锁均有测试。
- [ ] 演示模式不自动提问，“清空当前显示”不声称删除持久化数据。
- [ ] 不再笼统声称“完全本地”“不使用 AI”“不上传代码和日志”；四层数据边界分别说明。
- [ ] 智能体回答不作为标准答案、根因判定或自动评分，教师仍完成代码审查、口试、报告和人工确认。
- [ ] 在线八项联调仅在真实通过后勾选，密钥不进入命令日志和截图。

## 反馈、文档与视觉

- [ ] 8890/8891、JSONL、邀请码、筛选导出和备份边界已说明。
- [ ] 全部正式分支 Markdown 相对链接为零断链，starter 无答案/教师文件或链接。
- [x] 24 页 PPT 已全页渲染；24/24 PNG 有效，修改后的第 4、22 页已重点检查换行、溢出和清晰度。
- [x] 21 个既有交付分支的提交材料导航已完成原子推送，且没有创建远端 `codex/*` 分支。
- [ ] 远程 CI 最终结果需从 GitLab 平台记录核实；“已推送”不得写成“CI 已通过”。

## Rust 与 QEMU

- [x] `cargo fmt --all -- --check`。
- [x] `cargo build --workspace --target riscv64gc-unknown-none-elf --locked`。
- [x] `cargo clippy -p ai-os-kernel --target riscv64gc-unknown-none-elf -- -D warnings`。
- [x] host unit tests：事件 Crate 9/9、内核 46/46。
- [x] main P0-Lab7 QEMU/OpenSBI 验收。
- [x] 每个 solution 的 Stage 1/2/3：2026-08-13 为 21/21；2026-08-16 再次复核 Stage 3 为 7/7。
- [x] 每个 starter 的 `-ExpectIncomplete`：2026-08-16 为 7/7，并确认当前 Lab 最终 PASS 不成立。
- [x] `-Stage` 与 `-ExpectIncomplete` 同时使用时明确拒绝：2026-08-13 为 7/7。

## 可视化与评分工具

- [x] 可视化、智能体、反馈与评分完整 Node tests：580/586 通过、0 失败、6 跳过。
- [ ] 教师评分核心测试和离线页面检查。
- [ ] `os-demo.run/v1` 可被评分工具导入。
- [ ] 损坏、超限、错误协议或错误 Lab 文件被拒绝。
- [ ] 教学反馈与教师评分在文档中明确分开。
- [ ] 页面和文档未声称自动上传、AI 自动诊断根因或 AI 自动评分。

## 文档与 PPT

- [ ] 21 个既有交付分支的 Markdown 相对链接零断链；当前已确认统一导航 21/21 一致，报告关键文档 99 个相对链接零断链。
- [ ] 文档命令与实际脚本参数一致。
- [x] 当前状态不再使用 18/19 分支或 579/585 Node 旧数字；历史数字均带明确日期和“历史记录”说明。
- [ ] README、设计、架构、测试、演示脚本、验收报告和评审指南互相一致。
- [ ] PPT 使用真实本地页面截图，所有测试数字来自同一提交的实际命令。
- [x] PPT 全页渲染为 24/24 张 1920×1080 图片；总览检查无空白页，修改页无溢出、重叠或标题截断。

## 安全与隐私

- [ ] 无 API Key、Token、密码、Cookie、私有仓库地址或本机绝对路径。
- [ ] 官方截图已脱敏。
- [ ] 学生姓名、成绩、教师评语和提交标识未进入公开仓库。
- [ ] Demo/评分导出文件在公开分享前已人工匿名化。

## 官方材料

- [ ] 题目、评分和提交格式已经人工对照比赛平台最新通知。
- [ ] PPT 文件可打开，演示视频实际状态已由项目成员确认。
- [ ] 未完成或未运行的项目如实标记，不写成“已通过”。
