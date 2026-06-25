# AI 合作的操作系统教学实验环境

本项目参加 2026 年全国大学生计算机系统能力大赛，赛项为操作系统设计赛，题目为 OS 功能挑战赛道第 20 题：AI 合作的操作系统教学实验环境。

项目目标是使用 Rust 设计一个运行于 RISC-V 64 和 QEMU/OpenSBI 环境中的操作系统内核教学实验平台。最终成果应适合本科生学习、教师教学和比赛验收。

## 当前项目状态

当前处于 P0 工程运行基线阶段：

- 已建立 Rust workspace。
- 已建立最小 `kernel` crate。
- 已配置目标架构 `riscv64gc-unknown-none-elf`。
- 已能在 QEMU `virt` 机器上通过 OpenSBI 进入 S-mode 内核。
- 已能输出最小启动日志和稳定成功标识 `[P0] PASS`。
- 已提供可重复执行的构建、运行、环境检查和 QEMU 冒烟测试命令。

Lab1 到 Lab7 仍处于规划和文档骨架阶段，尚未实现正式教学实验功能。

## P0 与 Lab1-Lab7 的区别

P0 是工程运行基线，不计入正式教学实验。P0 只负责：

- Rust 裸机工程能够编译。
- 目标架构为 `riscv64gc-unknown-none-elf`。
- 能够在 QEMU `virt` 机器上运行。
- 使用 OpenSBI 进入 S-mode 内核。
- 内核能够输出最小启动信息。
- 提供可重复执行的构建、运行和测试命令。

Lab1 到 Lab7 是面向学生的正式教学实验：

1. Lab1：启动与 SBI 控制台。
2. Lab2：Trap 与异常处理。
3. Lab3：物理内存管理。
4. Lab4：Sv39 虚拟内存。
5. Lab5：任务管理与协作式调度。
6. Lab6：用户态与系统调用。
7. Lab7：设备与简化文件系统。

## 当前仓库目录结构

```text
.
├── .cargo/
│   └── config.toml
├── docs/
│   ├── README.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── development-plan.md
│   ├── testing.md
│   ├── ai-collaboration.md
│   └── labs/
├── kernel/
│   ├── Cargo.toml
│   ├── linker.ld
│   └── src/
│       └── main.rs
├── scripts/
│   ├── check-env.ps1
│   ├── check-env.sh
│   ├── run-qemu.ps1
│   └── test-qemu.ps1
├── AGENTS.md
├── Cargo.toml
├── Cargo.lock
├── Makefile
└── README.md
```

## 环境依赖

必需依赖：

- Rust 编译器 `rustc`。
- Cargo 构建工具。
- rustup 工具链管理器。
- Rust target：`riscv64gc-unknown-none-elf`。
- QEMU RISC-V 64：`qemu-system-riscv64`。
- OpenSBI：当前通过 QEMU `-bios default` 使用 QEMU 自带 OpenSBI 固件。

可选依赖：

- `make`：用于执行 `Makefile` 中的快捷命令。没有 `make` 时，可直接使用 PowerShell 脚本。

## Windows PowerShell 环境说明

建议在 Windows PowerShell 中执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

如果缺少依赖，可参考：

```powershell
winget install --id Rustlang.Rustup -e
winget install --id SoftwareFreedomConservancy.QEMU -e
rustup target add riscv64gc-unknown-none-elf
rustup component add rust-src llvm-tools-preview
```

本项目不会在检查脚本中自动安装系统软件。

## WSL2 或 Ubuntu 环境说明

在 WSL2/Ubuntu 中建议安装：

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add riscv64gc-unknown-none-elf
sudo apt update
sudo apt install qemu-system-misc make
```

检查环境：

```sh
sh scripts/check-env.sh
```

不同发行版中 QEMU 包名可能不同。若 `qemu-system-riscv64` 不存在，请检查发行版对应的 RISC-V QEMU system emulator 包。

## 构建命令

```powershell
cargo build -p ai-os-kernel
```

或：

```powershell
make build
```

## QEMU 运行命令

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
```

Makefile：

```powershell
make run
```

底层 QEMU 参数为：

```text
qemu-system-riscv64 -machine virt -nographic -bios default -kernel target/riscv64gc-unknown-none-elf/debug/ai-os-kernel
```

## P0 自动测试命令

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
```

Makefile：

```powershell
make test-qemu
```

P0 测试会执行：

1. 构建 `ai-os-kernel`。
2. 启动 QEMU `virt` 机器。
3. 捕获 QEMU 串口输出。
4. 检查稳定成功标识 `[P0] PASS`。
5. 设置超时，避免 QEMU 无限挂起。
6. QEMU 异常退出或缺少成功标识时返回失败。

## P0 成功时的真实预期输出

QEMU 会先输出 OpenSBI banner。内核自身输出应包含：

```text
[ai-os] P0 minimal RISC-V kernel baseline
[ai-os] booted on QEMU virt through OpenSBI
[P0] PASS
[ai-os] shutting down through SBI system reset
QEMU P0 smoke test passed.
```

其中 `[P0] PASS` 是 P0 自动验收的稳定成功标识。

## 常见错误和排查方法

### `rustc`、`cargo` 或 `rustup` 不存在

运行：

```powershell
winget install --id Rustlang.Rustup -e
```

重新打开终端后再执行环境检查。

### 缺少 `riscv64gc-unknown-none-elf`

运行：

```powershell
rustup target add riscv64gc-unknown-none-elf
```

### `qemu-system-riscv64` 不存在

Windows 可运行：

```powershell
winget install --id SoftwareFreedomConservancy.QEMU -e
```

安装后重新打开终端，或确认 QEMU 安装目录已加入 `PATH`。

### QEMU 启动后没有 `[P0] PASS`

说明内核没有执行到 P0 成功路径。请检查：

- `kernel/src/main.rs` 中是否仍输出 `[P0] PASS`。
- `kernel/linker.ld` 中入口地址是否仍为 `0x80200000`。
- QEMU 是否使用 `-bios default` 和 `-kernel` 加载当前构建产物。

### QEMU 测试超时

测试脚本会在超时后终止 QEMU。若发生超时，请检查内核是否卡在死循环、panic 或未执行 SBI system reset。

## Cargo.lock 提交策略

当前仓库包含可执行内核 crate，且比赛验收需要可重复构建。因此建议提交 `Cargo.lock`，用于锁定依赖版本并提升复现性。若后续拆出单独发布到 crates.io 的纯库 crate，可再按 Rust 库发布惯例单独评估。

## 当前尚未实现的内容

- Lab1-Lab7 的具体代码。
- `scripts/test-lab.ps1` 统一实验测试入口。
- 用户态程序和系统调用。
- trap、内存管理、任务管理、文件系统和设备驱动。
- GitLab CI。
- 完整设计报告、AI 协作阶段记录、演示材料。
