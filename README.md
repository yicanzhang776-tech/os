# Lab2：Trap 与异常处理

当前分支：`lab2-starter`
当前实验：Lab2 Trap 与异常处理
适合对象：已经完成 Lab1，第一次接触 RISC-V trap 的本科生
预计时间：3 到 5 小时
参考答案：`lab2-solution` 分支，本 starter 分支不包含完整答案。

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

4. 阅读任务一，找到 trap 初始化 TODO：

   ```text
   docs/labs/lab2/TASKS.md
   ```

5. 完成任务一后运行 Stage 1 测试：

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
- [实验总览](docs/labs/lab2/README.md)
- [任务书](docs/labs/lab2/TASKS.md)
- [分级提示](docs/labs/lab2/HINTS.md)
- [测试说明](docs/labs/lab2/TESTING.md)

旧版单页说明 [docs/labs/lab2.md](docs/labs/lab2.md) 只保留跳转说明。请优先阅读 `docs/labs/lab2/` 目录下的教学文档。

## 教学评价

运行 `sh scripts/run-interactive-demo.sh` 后，页面会识别当前 Lab2 starter 分支。在原有问题之后，还会显示五道与 `stvec`、breakpoint、`scause/sepc/stval` 及异常返回相关的专项题，第 5 题会评价分阶段任务对定位 Trap 路径错误是否有帮助。详细用法见 [可视化使用说明](docs/interactive-demo/README.md)。

## 允许修改

- `kernel/src/trap.rs`
- `kernel/src/main.rs` 中标记为 `TODO(LAB2-*)` 的少量 marker 边界

## 禁止修改

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

教师可用 starter incomplete 验证确认本分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -ExpectIncomplete
```

## 最终提交要求

学生完成 Lab2 后应提交：

- 修改后的 `kernel/src/trap.rs`
- 如确有必要，修改后的 `kernel/src/main.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及自己理解的 breakpoint trap 处理路径

建议提交信息：

```text
lab2: complete trap and breakpoint exercise
```

## 答案说明

完整参考实现位于 `lab2-solution` 分支。请先独立完成 starter，再查看 solution。`lab2-solution` 中会额外包含：

- `docs/labs/lab2/SOLUTION.md`
- `docs/labs/lab2/TEACHER_GUIDE.md`
