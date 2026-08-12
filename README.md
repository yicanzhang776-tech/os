# Lab2：Trap 与异常处理

## 交互学习与数据边界

本分支已同步[可视化学习环境](docs/interactive-demo/README.md)和[AI 教学助教说明](docs/teaching-agent.md)。预测、回放、分支比较和规则诊断继续在本地处理；教学反馈与脱敏运行记录只在主动预览、同意后远程提交；教学智能体会把问题及按需读取的受限证据发送到火山方舟，API Key 只保存在服务端环境变量中。

solution 中教师可用智能体检查现象、运行证据和口试追问；回答不是标准答案，也不参与自动评分。


当前分支：`lab2-solution`
当前实验：Lab2 Trap 与异常处理
适合对象：已经完成 Lab1，第一次接触 RISC-V trap 的本科生
预计时间：3 到 5 小时
分支定位：教师参考实现和验收材料，不建议直接发给学生作为起点。

学生起点位于 `lab2-starter`。本分支在保留 starter 教学文档的基础上，额外提供参考实现、解题说明和教师指南。

## 5 分钟快速开始

1. 检查环境：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
   ```

2. 构建内核：

   ```powershell
   cargo build -p ai-os-kernel
   ```

3. 启动 QEMU，观察当前 solution 输出：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
   ```

4. 阅读任务一，理解 trap 初始化和参考实现边界：

   ```text
   docs/labs/lab2/TASKS.md
   ```

5. 运行 Stage 1 测试：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 1
   ```

## 你要完成的三个任务

| 阶段 | 任务 | 完成后关键输出 |
|---|---|---|
| Stage 1 | 设置 trap 入口与 `stvec` | `[Lab2-T1] stvec configured` 和 `[Lab2-T1] PASS` |
| Stage 2 | 读取并解释 `scause/sepc/stval` | `[Lab2-T2] breakpoint decoded` 和 `[Lab2-T2] PASS` |
| Stage 3 | 推进 `sepc` 并从 breakpoint 返回 | `[Lab2] breakpoint handled` 和 `[Lab2] PASS` |

三个任务由易到难。任务一只安装 trap 入口；任务二只读取和解释异常原因；任务三才完成返回路径和最终验收。

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- [实验总览](docs/labs/lab2/README.md)
- [任务书](docs/labs/lab2/TASKS.md)
- [分级提示](docs/labs/lab2/HINTS.md)
- [测试说明](docs/labs/lab2/TESTING.md)
- [参考答案说明](docs/labs/lab2/SOLUTION.md)
- [教师指南](docs/labs/lab2/TEACHER_GUIDE.md)

旧版单页说明 [docs/labs/lab2.md](docs/labs/lab2.md) 只保留跳转说明。请优先阅读 `docs/labs/lab2/` 目录下的教学文档。

## 学生分支允许修改

- `kernel/src/trap.rs`
- `kernel/src/main.rs` 中标记为 `TODO(LAB2-*)` 的少量 marker 边界

## 学生分支禁止修改

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `kernel/src/console.rs`
- `kernel/linker.ld`
- `scripts/test-lab2.ps1`
- 其他实验或后续实验模块

禁止修改的文件是本实验基础设施。修改这些文件可能让测试失去教学意义。

## 分阶段测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
```

教师可在 `lab2-starter` 中使用 starter incomplete 验证确认起点分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -ExpectIncomplete
```

## 学生最终提交要求

学生完成 Lab2 后应提交：

- 修改后的 `kernel/src/trap.rs`
- 如确有必要，修改后的 `kernel/src/main.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及自己理解的 breakpoint trap 处理路径

建议提交信息：

```text
lab2: complete trap and breakpoint exercise
```

## 答案说明

完整参考实现位于当前 `lab2-solution` 分支。教学使用时建议先让学生在 `lab2-starter` 独立完成，再由教师根据本分支讲解关键实现。`lab2-solution` 中额外包含：

- `docs/labs/lab2/SOLUTION.md`
- `docs/labs/lab2/TEACHER_GUIDE.md`

## 本轮文档与验收说明（2026-08-09）

- 当前分支是 Lab2 教师参考实现，包含参考答案说明和教师验收材料。
- 使用 `-Stage 1`、`-Stage 2`、`-Stage 3` 验证任务标志、完整行为和最终 `[Lab2] PASS`；`-Stage` 与 `-ExpectIncomplete` 不能同时使用。
- 可视化页面支持预测、真实运行、时间线回放、starter/solution 对比、确定性诊断和 `os-demo.run/v1` 导出。
- 教师评分工具只放在 `main`。导入运行记录只建议 build/QEMU 客观状态，仍需代码审查、防硬编码检查、实验报告和口试。
- 本轮未在此工作分支触发远程 CI；分支本地验收结果见最终交付报告。
