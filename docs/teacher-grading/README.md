# 教师验收与评分工具

本目录为 Lab1-Lab7 提供统一的教师评分入口。评分页面本身是零服务器、零数据库、纯本地的原生 HTML/CSS/JavaScript，可直接通过 `file://` 打开。它不执行学生代码，不调用网络 API，不自动上传实验日志或成绩，也不把 `[LabN] PASS` 或教学智能体回答等同于学生完全掌握。

AI 教学助教、远程反馈和教师评分是三条独立链路。教师可用智能体帮助检查现象、运行证据和生成口试追问，但任何回答都不自动增加分数；最终仍需代码审查、口试、实验报告和人工确认。运行记录从可视化页面以 `os-demo.run/v1` 导入后，只建议 build/QEMU 客观状态。

## 立即使用

直接打开：

```text
docs/teacher-grading/index.html
```

评分记录保存在当前浏览器的 `localStorage`。关闭或刷新页面后可从“本机评分记录”加载；需要跨设备评阅时，手动导出 JSON，再在另一台设备导入。

## 与 solution 的边界

| 内容 | `labN-solution` | 本工具 |
|---|---|---|
| 正确参考实现 | 提供 | 不提供、不复制 |
| 实现过程与边界说明 | `SOLUTION.md` 提供 | 展示代码检查位置和口试要点 |
| 基础评分建议 | `TEACHER_GUIDE.md` 提供 | 严格按其权重形成统一量表 |
| 自动测试结果 | 作为参考实现证据 | 记录学生提交的客观证据 |
| 证据、分数和总评 | 不负责统一记录 | 统一操作、计算、保存和导出 |

七套量表的权重来源是各 solution 分支的 `TEACHER_GUIDE.md`，每个 Lab 严格为 100 分。口试只纳入教师指南已有的“代码清晰度、解释或实验报告”项目，不新增另一套权重。

## 多位学生的本机评分记录

每份记录都有独立 `recordId`，优先使用 `crypto.randomUUID()`；不支持时使用 Web Crypto 的 `getRandomValues()` 生成 UUID。记录索引至少保存 Lab、学生/小组、提交标识、教师、最终分、更新时间和 `recordId`。

推荐操作：

1. 选择 Lab，填写学生、小组和提交信息。
2. 点击“保存当前记录”。
3. 评阅下一位学生时点击“新建记录”，填写后再次保存。
4. 使用下拉列表选择记录，再点击“加载记录”。
5. “另存为新记录”会保留当前内容并生成新的 `recordId`。
6. “删除所选记录”会在确认后删除；导出的文件不受影响。

旧版按 `os-teacher-grading/v1/<labId>` 保存的草稿会在首次打开新版页面时迁移为独立记录。旧量表总分按新版教师指南权重等比例恢复，旧分项证据会写入迁移说明；旧键不会立即删除。

## 导入 Demo 运行证据

可视化 Demo 会导出 `os-demo.run/v1`。评分页面复用 `docs/interactive-demo/run-transfer.js` 的真实协议校验，不猜测字段，也不会自行启动 Cargo、QEMU 或 shell。

推荐课堂闭环是：学生在对应 starter 分支完成任务并使用[可视化页面](../interactive-demo/README.md)预测、运行和回放；教师保存或接收其 `os-demo.run/v1`，回到 `main` 打开本评分页面导入证据，再完成人工代码审查、实验报告和口试。页面中的“实验教学评价”属于学习体验反馈，不会进入本工具的成绩计算。

导入步骤：

1. 在 Demo 中完成一次运行并导出 JSON。
2. 在评分页“QEMU / 构建日志解析”区域点击“导入 os-demo.run/v1”。
3. 确认页面显示的 Lab、starter/solution/custom 角色、branch、commit、runId、构建结果、QEMU 结论、当前 Lab PASS、TODO、缺少的前置 PASS、失败和超时证据。
4. 若导入会覆盖教师已经填写且结论不同的 build/qemu 状态，页面会先要求确认。
5. 检查关联摘要后再保存评分记录。

运行记录只会自动建议以下客观检查项：

- `build`：`lifecycle.buildResult=success/failure` 对应通过/失败；构建失败时 QEMU 记为“未运行”。
- `qemu`：构建成功但没有 QEMU 启动或完成证据时记为“未运行”；只有 QEMU 确实运行、出现当前 Lab 的 PASS 且没有 TODO、失败或超时证据时才建议通过。QEMU 已结束但没有当前 Lab PASS 时建议失败。

它不会自动填写或增加任何分项分数，也不会自动填写代码质量、设计解释、实验报告或口试分数。其他 Lab 的 PASS 不能代替当前 Lab PASS。评分记录只保存经过长度限制和净化的 branch、commit、runId 与结论摘要，不保存完整事件、稳定输出或终端日志。

## 构建与检查命令

RISC-V 内核构建必须明确指定目标，避免 Cargo 在 x86_64 主机上解释 RISC-V 汇编寄存器：

```powershell
cargo build -p ai-os-kernel --target riscv64gc-unknown-none-elf
cargo clippy -p ai-os-kernel --target riscv64gc-unknown-none-elf -- -D warnings
```

`cargo fmt --all -- --check` 不依赖目标架构。`node --test docs/teacher-grading/grading-core.test.js` 是主机上的纯 JavaScript 逻辑测试，只验证评分、存储迁移和导入协议，不构建或运行学生内核。

## 自动验收与人工验收的边界

自动证据可以表明：

- 指定目标的工程构建是否成功。
- QEMU 运行是否出现当前实验 marker、TODO、失败或超时。
- Demo 记录中是否缺少前置实验 PASS。

自动证据不能单独证明：

- 学生没有硬编码输出或绕过测试。
- TrapFrame、TaskContext 等汇编/Rust 布局完全合理。
- `unsafe` 使用满足安全前提。
- 页表权限遵循最小权限原则。
- 学生真正理解实现而不是复制代码。

因此最终评分必须由教师结合代码审查、实验说明和口试决定。建议封顶仍是可关闭的教学建议：构建失败建议不超过 39 分；QEMU 失败建议不超过 59 分；违规修改基础设施或测试判定建议不超过 59 分并人工复核。

## 评分 JSON 与运行 JSON

页面明确区分两类协议：

- `os-teacher-grading/v1`：评分记录，可导入后继续评阅。
- `os-demo.run/v1`：Demo 运行记录，只能作为客观证据关联。

评分 JSON 导入会校验顶层对象、协议、Lab、字符串长度、分项分数、证据对象和检查状态。未知分项/检查项会忽略；缺失字段恢复默认值；越界分数会限制到 0 与该项满分之间；损坏的 `scores`、`checks` 或 `evidence` 会安全恢复，不会导致页面崩溃。评分文件上限为 256 KiB，Demo 运行文件继续遵循其 1 MiB 和 512 事件上限。

## 导出、内容净化与人工匿名化

- Markdown 和 JSON 都包含关联运行证据的 branch、commit、runId 和结论摘要。
- 导出不会自动上传，文件只保存到教师选择的本地位置。
- 内容净化会清理常见访问令牌、本机用户路径、HTML 和危险控制字符，但不等于身份匿名化。
- 工具不会自动匿名化姓名和自由文本。Markdown 与 JSON 仍可能包含学生姓名、教师姓名、提交标识、教师总评和口试记录。
- 共享前应由教师手工使用匿名编号并删除不必要的个人信息；不要把真实成绩、学号、个人信息或未人工脱敏的评语提交到公开 Git 仓库。

## Starter 防泄露检查

对每个 `labN-starter`，教师至少确认：

- `scripts/test-labN.ps1 -ExpectIncomplete` 能正常结束。
- 输出包含当前实验 TODO，不包含当前实验 PASS。
- starter 保留前置实验能力。
- TODO 对应真实代码缺口，而不是隐藏或删除 PASS 字符串。
- 分支中不包含 solution 的完整函数体、答案注释或可直接复制的补丁。

## 开发验证

```powershell
node --check docs/teacher-grading/rubric-data.js
node --check docs/teacher-grading/grading-core.js
node --check docs/teacher-grading/app.js
node --test docs/teacher-grading/grading-core.test.js
```

同时应执行 `docs/interactive-demo` 下已有的 Node 测试，确认没有破坏 `os-demo.run/v1` 兼容性。

## 当前限制

- 评分页面没有服务器、数据库、登录系统或云同步；这不代表项目中的远程反馈或方舟教学智能体也是本地链路。
- 没有班级管理、排名、统计大屏或批量成绩分析。
- 不执行学生代码，不读取学生仓库，不直接运行 Cargo/QEMU/shell。
- 不连接 AI 模型自动评分。
- `localStorage` 受当前浏览器与页面来源隔离；清理浏览器站点数据前应先导出需要保留的记录。
- 最终成绩仍由教师根据课程规则和真实证据确认。
