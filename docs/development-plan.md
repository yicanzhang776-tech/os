# 开发计划

## P0：最小可运行内核

| 项目 | 内容 |
|---|---|
| 目标 | 建立 Rust 裸机工程，能在 QEMU `virt` + OpenSBI 中启动、输出日志并退出 |
| 主要文件 | `Cargo.toml`、`.cargo/config.toml`、`kernel/`、`Makefile`、`scripts/run-qemu.ps1`、`scripts/test-qemu.ps1` |
| 完成标准 | 可交叉编译；QEMU 输出 P0 启动日志；测试脚本可重复执行 |
| 验证命令 | `cargo fmt --all`；`cargo build -p ai-os-kernel`；`cargo clippy -p ai-os-kernel -- -D warnings`；`scripts/test-qemu.ps1` |
| 风险 | Windows PATH、QEMU 安装、OpenSBI 行为差异、裸机 unsafe 代码边界 |

## P1：Lab1-Lab3

| 项目 | 内容 |
|---|---|
| 目标 | 完成启动/控制台、trap 基础、物理内存管理三个教学实验 |
| 主要文件 | `docs/labs/lab1.md`、`docs/labs/lab2.md`、`docs/labs/lab3.md`；后续按架构创建对应内核模块 |
| 完成标准 | Lab1-Lab3 有 starter code、学生任务、参考实现边界和自动测试 |
| 验证命令 | 规划中：`scripts/test-lab.ps1 lab1`、`scripts/test-lab.ps1 lab2`、`scripts/test-lab.ps1 lab3` |
| 风险 | trap 入口调试困难；物理内存边界容易 off-by-one；测试 token 需要稳定 |

## P2：Lab4-Lab6

| 项目 | 内容 |
|---|---|
| 目标 | 完成 Sv39 虚拟内存、任务管理、用户态与系统调用 |
| 主要文件 | `docs/labs/lab4.md`、`docs/labs/lab5.md`、`docs/labs/lab6.md`；后续创建 `memory`、`task`、`syscall`、`user` 相关模块 |
| 完成标准 | 内核能启用分页；能运行多个任务；至少一个用户程序可通过系统调用输出和退出 |
| 验证命令 | 规划中：`scripts/test-lab.ps1 lab4`、`scripts/test-lab.ps1 lab5`、`scripts/test-lab.ps1 lab6` |
| 风险 | 页表启用后故障定位复杂；上下文切换 ABI 容易出错；用户指针校验需要谨慎设计 |

## P3：Lab7、完整测试、文档和验收

| 项目 | 内容 |
|---|---|
| 目标 | 完成设备与简化文件系统实验，补齐测试、报告、AI 协作记录和验收材料 |
| 主要文件 | `docs/labs/lab7.md`、`docs/testing.md`、设计报告、AI 协作记录、演示说明 |
| 完成标准 | Lab1-Lab7 全部可测试；文档说明完整；演示流程可复现 |
| 验证命令 | 规划中：`scripts/test-lab.ps1 all`；`cargo fmt --all`；`cargo clippy --all-targets -- -D warnings` |
| 风险 | 文件系统范围过大；CI runner 可能缺 QEMU；文档与代码容易不同步 |
