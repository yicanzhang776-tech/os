# 项目验收状态报告

日期：2026-08-09
取证基线：`origin/main` 提交 `ef6e401`

## 分支与材料状态

- `main`：评委和教师集成入口，包含 P0-Lab7、可视化、教师评分工具和答辩 PPT。
- `p0-minimal-qemu-baseline`：工程运行基线。
- `lab1-starter/solution` 至 `lab7-starter/solution`：14 个正式教学分支。
- 远程教学分支均包含当前 CI 配置；CI 文件存在不等于远程流水线已经成功，需另查平台记录。
- 正式 PPT 已存在。演示视频是否录制完成尚未由项目成员确认。

## 本轮已实际执行

| 验证 | 结果 |
|---|---|
| `cargo fmt --all -- --check` | 通过 |
| host unit tests | 46 passed，0 failed |
| RISC-V 显式目标构建 | 通过 |
| RISC-V Clippy（`-D warnings`） | 通过 |
| 可视化与评分工具 Node tests | 133 passed，0 failed（使用桌面应用捆绑 Node） |
| JavaScript / PowerShell / Linux Shell 语法 | 通过；Shell 使用 Git for Windows Bash |
| `main` 的 Stage 1/2/3 QEMU 验收 | 21 组通过，包含 `[Lab1] PASS` 至 `[Lab7] PASS` |
| 7 个 solution 的 Stage 1/2/3 | 21 组通过，并观察到对应 T1/T2 任务标志 |
| 7 个 starter 的 `-ExpectIncomplete` | 7 组通过 |
| 7 个 starter 的默认 Stage 3 | 7 组按预期失败，串口均没有当前 Lab 最终 PASS |
| `-Stage` 与 `-ExpectIncomplete` 互斥 | main、solution、starter 共 21 个脚本入口均明确拒绝 |
| P0 QEMU 基线 | 通过，观察到 `[P0] PASS` |
| 16 个正式分支 Markdown 相对链接 | 全部通过，零断链 |
| starter 答案隔离 | 同步未修改实现代码；不存在 `SOLUTION.md` / `TEACHER_GUIDE.md` 文件或链接 |
| 22 页正式 PPT | 全页渲染通过，溢出检查通过，真实页面截图和来源备注已加入 |
| `git diff --check` | 16 个工作分支全部通过 |

上述结果只对应 2026-08-09 的隔离工作区和下列 `origin/*` 基线。远程 CI 未在本轮触发，因此不能把本地通过写成远程流水线成功；演示视频状态也仍待项目成员确认。

## Stage 回归原因与修复边界

8 月 8 日的可靠性同步保留了显式目标构建、旧产物清理、构建退出码、日志分离和超时处理，但替换脚本时丢失了 `-Stage` 参数及阶段 marker 判定。本轮通过失败回归测试确认该问题，再恢复 `-Stage 1/2/3`、与 `-ExpectIncomplete` 的互斥检查及阶段证据验证。

## 当前限制

- Lab5 不包含抢占、多核或复杂优先级。
- Lab6 不包含 ELF、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘或复杂目录树。
- 可视化、反馈和评分记录默认只保存在本地浏览器，无服务器、数据库、登录或云同步。
- 教学反馈不计算成绩；教师评分不能只凭 PASS，必须人工复核代码、报告和口试。
