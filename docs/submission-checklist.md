# 比赛提交检查清单

## 分支与工作区

- [ ] 不直接在 `main/master` 修改。
- [ ] 以最新远程 P0、Lab1-Lab7 starter/solution 为基线。
- [ ] starter 不包含 `SOLUTION.md`、`TEACHER_GUIDE.md`、答案函数体或可复制补丁。
- [ ] `git status --short` 中只有计划内文件，未包含 `target/`、日志、缓存和 PPT 临时文件。

## Rust 与 QEMU

- [ ] `cargo fmt --all -- --check`。
- [ ] `cargo build -p ai-os-kernel --target riscv64gc-unknown-none-elf`。
- [ ] `cargo clippy -p ai-os-kernel --target riscv64gc-unknown-none-elf -- -D warnings`。
- [ ] host unit tests。
- [ ] P0 QEMU 验收。
- [ ] 每个 solution 的 Stage 1/2/3。
- [ ] 每个 starter 的 `-ExpectIncomplete`，并确认默认最终 PASS 不成立。
- [ ] `-Stage` 与 `-ExpectIncomplete` 同时使用时明确拒绝。

## 可视化与评分工具

- [ ] 可视化全部 Node tests 和 JavaScript 语法检查。
- [ ] 教师评分核心测试和离线页面检查。
- [ ] `os-demo.run/v1` 可被评分工具导入。
- [ ] 损坏、超限、错误协议或错误 Lab 文件被拒绝。
- [ ] 教学反馈与教师评分在文档中明确分开。
- [ ] 页面和文档未声称自动上传、AI 自动诊断根因或 AI 自动评分。

## 文档与 PPT

- [ ] 16 个正式分支 Markdown 相对链接零断链。
- [ ] 文档命令与实际脚本参数一致。
- [ ] 没有“PPT 待制作”“CI 待同步”和未经本轮验证的旧测试数字。
- [ ] README、设计、架构、测试、演示脚本、验收报告和评审指南互相一致。
- [ ] PPT 使用真实本地页面截图，所有测试数字来自同一提交的实际命令。
- [ ] PPT 全页渲染，逐页检查溢出、重叠、标题换行、截图清晰度和来源备注。

## 安全与隐私

- [ ] 无 API Key、Token、密码、Cookie、私有仓库地址或本机绝对路径。
- [ ] 官方截图已脱敏。
- [ ] 学生姓名、成绩、教师评语和提交标识未进入公开仓库。
- [ ] Demo/评分导出文件在公开分享前已人工匿名化。

## 官方材料

- [ ] 题目、评分和提交格式已经人工对照比赛平台最新通知。
- [ ] PPT 文件可打开，演示视频实际状态已由项目成员确认。
- [ ] 未完成或未运行的项目如实标记，不写成“已通过”。
