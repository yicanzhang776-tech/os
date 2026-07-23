# Lab1: Boot and SBI Console

## 实验背景

Lab1 是 P0 之后的第一个正式教学实验。P0 只证明工程能够在 QEMU/OpenSBI 上运行；Lab1 将这条最小启动路径拆成适合学生阅读和补全的 `boot`、`sbi`、`console` 和 `main` 模块。

## 学习目标

- 理解 QEMU `virt` 机器、OpenSBI 和 S-mode 内核之间的启动关系。
- 理解 Rust 裸机内核的入口、启动栈和 `panic_handler`。
- 理解 SBI legacy console 输出字符的最小调用路径。
- 理解自动测试为什么依赖稳定、唯一的成功标志。

## 前置知识

- Rust 基础语法和 `no_std` 基本概念。
- RISC-V 基础寄存器和函数调用约定。
- QEMU、OpenSBI、S-mode 的基本分工。

## 前置实验

- P0: 最小可运行内核基线。

## 分支切换命令

```powershell
git switch lab1-starter
git switch lab1-solution
```

切换分支前应先确认工作区干净：

```powershell
git status --short
```

## Starter 和 Solution 的区别

| 分支 | 用途 | 预期结果 |
|---|---|---|
| `lab1-starter` | 学生起点，保留启动和控制台路径的 TODO 边界 | 能编译和启动，但 Lab1 自动测试因缺少成功标志而失败 |
| `lab1-solution` | 教师参考答案 | 能编译、启动并输出 Lab1 成功标志 |

## 涉及模块

- `boot`: 设置启动栈，并跳转到 Rust 内核入口。
- `sbi`: 封装 SBI console putchar 和 system reset。
- `console`: 提供内核内部的行输出接口。
- `main`: 组织 Lab1 启动日志、成功标志和 panic 输出。

## 学生需要补全的任务

- 阅读 `_start -> kernel_main -> console -> sbi` 的调用链。
- 区分 OpenSBI 固件输出和内核自己输出的日志。
- 补全 Lab1 成功标志，使自动测试能够识别实验完成。
- 保持 SBI system reset 退出路径可用，避免 QEMU 挂起。

## 不允许修改的基础设施

- 不修改 `.cargo/config.toml` 中的目标架构配置。
- 不修改 `kernel/linker.ld` 的内核加载地址和入口约定。
- 不修改 QEMU 测试脚本的成功判定逻辑来绕过实验任务。
- 不引入 Lab2 及之后实验的 trap、memory、task、syscall、user、fs 或 drivers 功能。

## 核心知识点

- OpenSBI 负责从 M-mode 进入 S-mode 内核。
- Rust 裸机入口需要手动设置栈。
- SBI console 是早期内核最小调试输出手段。
- 自动测试应匹配稳定日志，而不是只判断 QEMU 是否启动。

## 构建命令

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
```

## QEMU 运行命令

```powershell
make run
```

如果当前环境没有 `make`，可以使用项目脚本或直接参考 `Makefile` 中的 QEMU 参数。QEMU 可执行文件所在目录需要加入 `PATH`。

## 自动测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```

## Starter 预期现象

`lab1-starter` 应能编译并在 QEMU 中启动，输出类似：

```text
[Lab1] start
[Lab1] console is available
[Lab1] TODO: replace this placeholder with the success marker
```

`scripts/test-lab1.ps1` 应明确失败，失败原因应是没有找到 Lab1 成功标志，而不是编译错误、QEMU 错误或脚本错误。

## Solution 预期输出

`lab1-solution` 应输出：

```text
[Lab1] start
[Lab1] console is available
[Lab1] PASS
```

测试脚本应输出：

```text
Lab1 QEMU smoke test passed.
```

## 验收标准

- `cargo fmt --all -- --check` 通过。
- `cargo build -p ai-os-kernel` 通过。
- `cargo clippy -p ai-os-kernel -- -D warnings` 通过。
- `lab1-starter` 能启动但不输出 Lab1 成功标志。
- `lab1-solution` 输出 Lab1 成功标志，测试退出码为 0。
- Lab1 不包含 Lab2 及之后实验功能。

## 常见错误

- 把 OpenSBI 的启动输出误认为内核输出。
- 忘记在输出末尾换行，导致日志难以匹配。
- 修改 QEMU 参数后测试脚本和手动运行不一致。
- 让内核无限循环，导致 QEMU 测试超时。

## 调试建议

- 先确认 `scripts/check-env.ps1` 能找到 Rust target 和 QEMU。
- 查看 `target/qemu-lab1.log` 中捕获的串口输出。
- 如果 QEMU 挂起，检查是否仍能走到 SBI system reset。
- 如果测试失败，优先看失败信息是否为缺少成功标志。

## 思考题

- 为什么 P0 不计入正式教学实验，而 Lab1 才算第一个学生实验？
- OpenSBI 在本项目中承担了哪些硬件初始化职责？
- 为什么早期内核通常先实现 console 输出，而不是直接实现复杂设备驱动？

## 教师验收说明

- 教师应分别检查 `lab1-starter` 和 `lab1-solution`。
- starter 分支的“预期失败”是教学设计的一部分，但如果接入 CI，应使用教师专用脚本或模式参数将“未包含成功标志”判定为 starter 验收通过。
- solution 分支必须运行正式测试脚本，并且只有看到 Lab1 成功标志时才通过。

## 预计完成时间

2 到 4 小时。
