# 教师验收与评分工具

本分支 `teacher-grading-tools` 为 P0/Lab1-Lab7 教学实验提供统一的教师验收、分项评分和评阅记录工具。

它不包含新的操作系统内核功能，也不复制 `labN-solution` 的实现代码。它解决的是另一个问题：教师应当依据哪些运行证据、代码检查和口头解释判断学生完成程度，并形成可保存、可导出、可复核的评分记录。

## 分支成果入口

- [打开教师评分页面](docs/teacher-grading/index.html)
- [阅读完整使用说明](docs/teacher-grading/README.md)
- [查看 Lab1-Lab7 评分量表](docs/teacher-grading/rubric-data.js)
- [查看评分与日志解析规则](docs/teacher-grading/grading-core.js)
- [查看核心逻辑测试](docs/teacher-grading/grading-core.test.js)

## 与 main 和 solution 的关系

| 内容 | `main` | `labN-solution` | 本分支 |
|---|---|---|---|
| 项目完整展示 | 是 | 按实验阶段 | 否 |
| 正确实现代码 | 包含最终实现 | 提供当前实验答案 | 不新增、不复制 |
| 自动测试 | 提供 | 用于参考实现验收 | 记录为一类评分证据 |
| 分项评分标准 | 非主要职责 | `TEACHER_GUIDE.md` 提供基础评分建议 | 按教师指南统一操作、记录和计算 |
| 口试与人工审查 | 非主要职责 | 提供实验解释要点和教师提示 | 提供统一记录入口，计入原有解释/报告项 |
| 评分记录导出 | 不提供 | 不提供 | 支持 Markdown、JSON 和打印 |

需要查看完整内核和可视化成果时，请切换到 `main`；需要查看某一实验参考实现时，请切换到对应的 `labN-solution`。

## 已实现功能

- Lab1-Lab7 按各 solution 分支 `TEACHER_GUIDE.md` 统一的 100 分评分量表。
- 自动测试证据与人工检查证据分离。
- 分项得分、验收证据和教师评语记录。
- 构建日志和 QEMU 串口日志辅助解析。
- 当前实验 PASS、TODO 和前置实验 PASS 检查。
- 构建失败、QEMU 失败和违规修改的建议封顶规则。
- 各实验关键代码检查位置。
- 常见错误、可能原因和扣分建议。
- 口试问题及回答要点。
- 以独立 `recordId` 保存多位学生或小组的本机评分记录，并兼容迁移旧版按 Lab 草稿。
- 导入 Demo 导出的 `os-demo.run/v1`，只关联净化后的 branch、commit、runId 和结论摘要。
- Markdown、JSON 脱敏导出，评分 JSON 导入和打印。
- starter 分支答案泄露检查说明。
- 桌面端和移动端响应式布局。

## 使用步骤

1. 打开 `docs/teacher-grading/index.html`。
2. 选择 Lab1-Lab7 中需要验收的实验。
3. 填写学生、小组、提交标识、教师和日期。
4. 点击“保存当前记录”；评阅下一位学生时点击“新建记录”，避免相互覆盖。
5. 标记格式、构建、Clippy、QEMU 和人工检查结果；RISC-V 构建命令必须显式使用 `--target riscv64gc-unknown-none-elf`。
6. 可粘贴日志做临时辅助解析，或导入 Demo 的 `os-demo.run/v1` 运行记录；导入只更新有结论的 build/qemu 状态。
7. 根据代码审查和实际证据填写四项教师指南分数，至少抽查一道口试题并记录解释。
8. 填写总评，保存本机记录，或导出 Markdown/JSON；共享前先把姓名、学号和自由文本脱敏。

页面完全在本机运行，不调用网络接口，也不会自动上传日志或成绩。

## 评分原则

每个实验满分 100 分，权重直接来自对应 solution 分支的 `TEACHER_GUIDE.md`：前三项对应 Stage/任务验收，最后一项为代码清晰度、解释或实验报告。口试只作为最后一项的证据，不另设冲突权重。solution 提供参考实现和基础评分建议；本工具负责统一操作、证据记录、成绩计算和导出。

默认建议封顶规则：

| 情况 | 建议最高分 |
|---|---:|
| 目标内核无法构建 | 39 |
| QEMU 端到端验收失败 | 59 |
| 修改禁止变更的基础设施或测试判定 | 59，并人工复核 |

封顶是教学建议，不是不可修改的自动判分。教师可以关闭“应用建议封顶”，再依据本课程规定决定最终成绩。

## 自动测试不能替代人工检查

看到 `[LabN] PASS` 只能证明指定运行标志出现，不能单独证明：

- 学生没有硬编码输出或绕过测试。
- 汇编结构和 Rust 数据布局完全一致。
- `unsafe` 使用满足安全前提。
- 页表、用户态和文件系统权限边界正确。
- 学生真正理解代码而不是直接复制实现。

因此评分工具会同时展示代码检查位置、人工检查项和口试题。

## Starter 防泄露验收

教师验收 `labN-starter` 时至少应确认：

- `scripts/test-labN.ps1 -ExpectIncomplete` 能正常结束。
- 输出包含当前实验 TODO。
- 输出不包含当前实验 PASS。
- 前置实验能力没有回归。
- TODO 对应真实代码缺口，而不只是隐藏 PASS 字符串。
- 分支中不存在 solution 的完整函数体或可直接复制的答案补丁。

## 数据与隐私

- 每份记录以独立 `recordId` 保存在当前浏览器的 `localStorage`，索引只用于本机加载。
- 运行记录只保留经过限制和净化的证据摘要，不保存完整终端日志。
- 导出的 JSON 可能包含姓名和教师评语。
- 不要把真实成绩、学号或个人信息提交到公开仓库。
- 需要共享评分记录时，建议使用匿名编号。

## 目录结构

```text
docs/teacher-grading/
├── index.html                 # 教师评分页面
├── styles.css                # 响应式页面样式
├── app.js                    # 页面交互、本机多记录和 Demo 证据导入
├── rubric-data.js            # Lab1-Lab7 评分项与口试要点
├── grading-core.js           # 计分、封顶、日志解析和导出
├── grading-core.test.js      # 核心逻辑测试
└── README.md                 # 详细使用与评分边界
```

## 验证命令

需要 Node.js，仓库根目录执行：

```powershell
node --check docs/teacher-grading/rubric-data.js
node --check docs/teacher-grading/grading-core.js
node --check docs/teacher-grading/app.js
node --test docs/teacher-grading/grading-core.test.js
```

当前核心测试覆盖：

- 七套量表与教师指南权重一致且总分均为 100。
- 多位学生独立记录、旧版草稿迁移和损坏 JSON 恢复。
- 分值边界、检查状态和建议封顶计算。
- `os-demo.run/v1` 的构建、PASS、TODO、失败、超时和跨 Lab 判定。
- Markdown/JSON 导出的关联证据与协议校验。

## 当前边界

- 页面完全离线，不执行学生代码，不直接运行 Cargo、QEMU 或 shell 命令。
- 页面不会自动读取学生仓库或替教师检查代码。
- 页面不会连接 AI 模型进行自动评分。
- 页面不会自动上传日志或成绩，也没有服务器、数据库、登录、班级管理、排名、统计大屏和云同步。
- `[LabN] PASS` 只是客观运行证据，不等于学生完全掌握；运行记录不会自动填写代码质量、设计解释或口试分数。
- 最终成绩仍由教师依据课程规则和真实证据确认。
