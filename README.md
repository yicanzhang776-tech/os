# Lab1：启动与 SBI 控制台

当前分支：`lab1-starter`
当前实验：Lab1 启动与 SBI 控制台
适合对象：第一次接触 Rust 裸机内核的本科生
预计时间：2 到 4 小时
参考答案：`lab1-solution` 分支，本 starter 分支不包含完整答案。

## 5 分钟快速开始

1. 检查环境：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
   ```

2. 构建内核：

   ```powershell
   cargo build -p ai-os-kernel
   ```

3. 启动 QEMU，观察当前 starter 输出：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
   ```

4. 阅读任务一，找到启动入口和 TODO：

   ```text
   docs/labs/lab1/TASKS.md
   ```

5. 完成任务一后运行 Stage 1 测试：

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
- [实验总览](docs/labs/lab1/README.md)
- [任务书](docs/labs/lab1/TASKS.md)
- [分级提示](docs/labs/lab1/HINTS.md)
- [测试说明](docs/labs/lab1/TESTING.md)

旧版单页说明 [docs/labs/lab1.md](docs/labs/lab1.md) 只保留跳转说明。请优先阅读 `docs/labs/lab1/` 目录下的教学文档。

## 允许修改

- `kernel/src/main.rs`
- `kernel/src/console.rs`

## 禁止修改

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

教师可用 starter incomplete 验证确认本分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -ExpectIncomplete
```

## 最终提交要求

学生完成 Lab1 后应提交：

- 修改后的 `kernel/src/main.rs`
- 修改后的 `kernel/src/console.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及自己理解的启动路径

建议提交信息：

```text
lab1: complete boot and SBI console exercise
```

## 答案说明

完整参考实现位于 `lab1-solution` 分支。请先独立完成 starter，再查看 solution。`lab1-solution` 中会额外包含：

- `docs/labs/lab1/SOLUTION.md`
- `docs/labs/lab1/TEACHER_GUIDE.md`
