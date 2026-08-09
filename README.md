# Lab7 Starter：设备与简化文件系统

当前分支：`lab7-starter`

当前实验：Lab7 设备与简化文件系统。

适合对象：已经完成 Lab1-Lab6，理解启动、异常、内存、调度、用户态和系统调用基础的本科生。

预计时间：8 到 12 小时。

本分支是学生起点，只包含任务说明、提示、测试脚本和待补全代码。参考答案在教师使用的 `lab7-solution` 分支中，本分支不包含 `SOLUTION.md` 或完整实现。

## 5 分钟快速开始

1. 检查环境：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

2. 构建内核：

```powershell
cargo build -p ai-os-kernel
```

3. 运行当前 starter 验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

4. 阅读任务一：

```text
docs/labs/lab7/TASKS.md
```

5. 完成任务一后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
```

## 三个递进任务

| 阶段 | 任务 | 学习重点 | 验收标志 |
|---|---|---|---|
| 任务一 | RAM 字节设备 | `read_at`、`write_at`、边界检查 | `[Lab7-T1] PASS` |
| 任务二 | 简化文件系统与 fd 表 | `open/read/write/close`、文件偏移、错误 fd | `[Lab7-T2] PASS` |
| 任务三 | 用户态文件 I/O 验收 | 文件系统调用路径和 QEMU 行为 | `[Lab7] PASS` |

任务由易到难。先完成内存设备，再用设备构建单文件文件系统，最后接入用户态文件 I/O 验收。

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- 实验总览：[docs/labs/lab7/README.md](docs/labs/lab7/README.md)
- 任务书：[docs/labs/lab7/TASKS.md](docs/labs/lab7/TASKS.md)
- 分级提示：[docs/labs/lab7/HINTS.md](docs/labs/lab7/HINTS.md)
- 测试说明：[docs/labs/lab7/TESTING.md](docs/labs/lab7/TESTING.md)

## 快速命令

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

分阶段测试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

starter 初始状态下，`-ExpectIncomplete` 应通过，默认完整测试应失败，因为本分支不会输出 `[Lab7] PASS`。

## 允许修改的主要文件

- `kernel/src/drivers/mod.rs`
- `kernel/src/fs/mod.rs`
- `kernel/src/syscall.rs`
- `kernel/src/trap.rs`
- `kernel/src/user.rs`

## 禁止修改的基础设施

- QEMU 启动参数和测试超时逻辑。
- Lab1-Lab6 的成功标志。
- 启动汇编、链接脚本、页表和调度器等非 Lab7 目标代码，除非任务明确要求。
- `main`/`master` 分支。

## 最终提交要求

完成 Lab7 后，提交内容应包含代码、必要注释和测试结果说明。不要提交 `target/`、QEMU 日志、账号、Token、密钥或本机私有路径。

## 本轮文档与验收说明（2026-08-09）

- 当前分支是 Lab7 学生起点，不包含参考答案或教师指南。
- 学生使用 `-Stage 1`、`-Stage 2`、`-Stage 3` 逐步验证；教师使用 `-ExpectIncomplete` 检查原始 starter 能启动、保留 TODO 且没有 `[Lab7] PASS`。
- `-Stage` 与 `-ExpectIncomplete` 不能同时使用；默认命令等价于 Stage 3，未完成时失败是正式验收结果，不应改写为通过。
- 可视化页面支持预测、真实运行、时间线回放、starter/solution 对比和运行证据导出；不会自动切换分支或上传代码、日志。
- 教师评分工具只放在 `main`；运行证据导出为 `os-demo.run/v1` 后，由教师在 `main` 人工导入和复核。
- 本轮未在此工作分支触发远程 CI；分支本地验收结果见最终交付报告。
