# Lab6 Solution：用户态与系统调用

## 交互学习与数据边界

本分支已同步[可视化学习环境](docs/interactive-demo/README.md)和[AI 教学助教说明](docs/teaching-agent.md)。预测、回放、分支比较和规则诊断继续在本地处理；教学反馈与脱敏运行记录只在主动预览、同意后远程提交；教学智能体会把问题及按需读取的受限证据发送到火山方舟，API Key 只保存在服务端环境变量中。

solution 中教师可用智能体检查现象、运行证据和口试追问；回答不是标准答案，也不参与自动评分。


当前分支：`lab6-solution`

当前实验：Lab6 用户态与系统调用参考实现与教师验收材料。

适合对象：教师、助教和完成 `lab6-starter` 后需要对照参考实现的学生。

> 注意：本分支包含完整参考答案，不建议直接作为学生起始分支发布给学生。学生应从 `lab6-starter` 开始。

## 本分支包含什么

- Lab6 三个教学任务的完整参考实现。
- 与 `lab6-starter` 相同的任务书、提示和测试说明。
- 额外的参考答案说明：`docs/labs/lab6/SOLUTION.md`。
- 教师验收和授课建议：`docs/labs/lab6/TEACHER_GUIDE.md`。
- 分阶段测试脚本：`scripts/test-lab6.ps1 -Stage 1/2/3`。

## Lab6 三个递进任务

| 阶段 | 任务 | 关键输出 |
|---|---|---|
| Stage 1 | `UserContext`、`sepc`、用户栈和 `sstatus.SPP/SPIE` | `[Lab6-T1] user context ready`，`[Lab6-T1] PASS` |
| Stage 2 | syscall id、参数寄存器和 `write/yield/exit` 分发 | `[Lab6-T2] syscall ABI ready`，`[Lab6-T2] PASS` |
| Stage 3 | 进入 U-mode，处理最小用户程序的 `write` 和 `exit` | `[Lab6] syscall write handled`，`[Lab6] syscall exit handled`，`[Lab6] PASS` |

## 快速验收

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
cargo build -p ai-os-kernel
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
```

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- [Lab6 总览](docs/labs/lab6/README.md)
- [任务书](docs/labs/lab6/TASKS.md)
- [分级提示](docs/labs/lab6/HINTS.md)
- [测试说明](docs/labs/lab6/TESTING.md)
- [参考答案说明](docs/labs/lab6/SOLUTION.md)
- [教师指南](docs/labs/lab6/TEACHER_GUIDE.md)

## 参考实现边界

本分支实现的是教学版用户态与系统调用：

- 只运行一个内置用户程序。
- 只处理 `write`、`yield`、`exit` 的最小 ABI。
- 真实进入 U-mode，并由 `ecall` 回到 S-mode。
- 不实现 ELF 加载、多进程、复杂用户指针校验或文件系统。

## 建议使用方式

教师可先向学生发布 `lab6-starter`，课堂讲解 `TASKS.md` 和 `HINTS.md`。验收或讲评时再切换到本分支，对照 `SOLUTION.md` 和 `TEACHER_GUIDE.md` 说明关键实现。

## 本轮文档与验收说明（2026-08-09）

- 当前分支是 Lab6 教师参考实现，包含参考答案说明和教师验收材料。
- 使用 `-Stage 1`、`-Stage 2`、`-Stage 3` 验证任务标志、完整行为和最终 `[Lab6] PASS`；`-Stage` 与 `-ExpectIncomplete` 不能同时使用。
- 可视化页面支持预测、真实运行、时间线回放、starter/solution 对比、确定性诊断和 `os-demo.run/v1` 导出。
- 教师评分工具只放在 `main`。导入运行记录只建议 build/QEMU 客观状态，仍需代码审查、防硬编码检查、实验报告和口试。
- 本轮未在此工作分支触发远程 CI；分支本地验收结果见最终交付报告。
