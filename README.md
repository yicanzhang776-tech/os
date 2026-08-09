# Lab1：启动与 SBI 控制台

当前分支：`lab1-solution`
当前实验：Lab1 启动与 SBI 控制台
适合对象：第一次接触 Rust 裸机内核的本科生
预计时间：2 到 4 小时
分支定位：教师参考实现和验收材料，不建议直接发给学生作为起点。

学生起点位于 `lab1-starter`。本分支在保留 starter 教学文档的基础上，额外提供参考实现、解题说明和教师指南。

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

4. 阅读任务一，理解启动入口和参考实现边界：

   ```text
   docs/labs/lab1/TASKS.md
   ```

5. 运行 Stage 1 测试：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 1
   ```

## 你要完成的三个任务

| 阶段 | 任务 | 完成后关键输出 |
|---|---|---|
| Stage 1 | 理解内核启动流程 | `[Lab1-T1] kernel entered` 和 `[Lab1-T1] PASS` |
| Stage 2 | 实现 SBI 字符与字符串输出 | `[Lab1-T2] console ready` 和 `[Lab1-T2] PASS` |
| Stage 3 | 完成启动日志与正常关机 | `[Lab1] start`、`[Lab1] console ready`、`[Lab1] PASS` |

三个任务由易到难。任务一只要求补全少量启动标记；任务二补全 console 输出接口；任务三整理最终启动日志，并使用 SBI reset 正常退出 QEMU。

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- [实验总览](docs/labs/lab1/README.md)
- [任务书](docs/labs/lab1/TASKS.md)
- [分级提示](docs/labs/lab1/HINTS.md)
- [测试说明](docs/labs/lab1/TESTING.md)
- [参考答案说明](docs/labs/lab1/SOLUTION.md)
- [教师指南](docs/labs/lab1/TEACHER_GUIDE.md)

旧版单页说明 [docs/labs/lab1.md](docs/labs/lab1.md) 只保留跳转说明。请优先阅读 `docs/labs/lab1/` 目录下的教学文档。

## 学生分支允许修改

- `kernel/src/main.rs`
- `kernel/src/console.rs`

## 学生分支禁止修改

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `kernel/linker.ld`
- `scripts/test-lab1.ps1`
- 其他实验或后续实验模块

禁止修改的文件是本实验基础设施。修改这些文件可能让测试失去教学意义。

## 分阶段测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```

教师可在 `lab1-starter` 中使用 starter incomplete 验证确认起点分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -ExpectIncomplete
```

## 学生最终提交要求

学生完成 Lab1 后应提交：

- 修改后的 `kernel/src/main.rs`
- 修改后的 `kernel/src/console.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及自己理解的启动路径

建议提交信息：

```text
lab1: complete boot and SBI console exercise
```

## 答案说明

完整参考实现位于当前 `lab1-solution` 分支。教学使用时建议先让学生在 `lab1-starter` 独立完成，再由教师根据本分支讲解关键实现。`lab1-solution` 中额外包含：

- `docs/labs/lab1/SOLUTION.md`
- `docs/labs/lab1/TEACHER_GUIDE.md`

## 本轮文档与验收说明（2026-08-09）

- 当前分支是 Lab1 教师参考实现，包含参考答案说明和教师验收材料。
- 使用 `-Stage 1`、`-Stage 2`、`-Stage 3` 验证任务标志、完整行为和最终 `[Lab1] PASS`；`-Stage` 与 `-ExpectIncomplete` 不能同时使用。
- 可视化页面支持预测、真实运行、时间线回放、starter/solution 对比、确定性诊断和 `os-demo.run/v1` 导出。
- 教师评分工具只放在 `main`。导入运行记录只建议 build/QEMU 客观状态，仍需代码审查、防硬编码检查、实验报告和口试。
- 本轮未在此工作分支触发远程 CI；分支本地验收结果见最终交付报告。
