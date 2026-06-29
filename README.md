# AI 合作的操作系统教学实验环境

本项目参加 2026 年全国大学生计算机系统能力大赛，赛项为操作系统设计赛，题目为 OS 功能挑战赛道第 20 题：AI 合作的操作系统教学实验环境。

项目目标是使用 Rust 设计一个运行于 RISC-V 64 和 QEMU/OpenSBI 环境中的操作系统内核教学实验平台。最终成果面向本科生学习、教师教学和比赛验收。

## 当前项目状态

当前本地仓库已经建立 P0 工程基线，并完成 Lab1 到 Lab7 的 starter/solution 分支：

- P0：Rust 裸机内核可交叉编译，并能在 QEMU `virt` + OpenSBI 下启动。
- Lab1：启动与 SBI 控制台。
- Lab2：Trap 与异常处理。
- Lab3：物理内存管理。
- Lab4：RISC-V Sv39 虚拟内存。
- Lab5：单核内核态协作式调度。
- Lab6：最小用户态与系统调用。
- Lab7：设备抽象与教学版内存文件系统。

所有实验使用独立成功标志，例如 `[Lab7] PASS`。starter 分支保留学生任务边界和 TODO，solution 分支提供教师参考实现。

当前限制：

- Lab7 使用固定容量内存文件系统，不接入 virtio-block 或真实磁盘。
- Lab6 使用内置用户程序，不实现 ELF 加载、多进程或复杂用户指针校验。
- Lab5 只实现单核、内核态、协作式调度，不实现抢占、多核或优先级调度。
- 当前尚未执行远端推送；推送需要人工明确授权。

## P0 与 Lab1-Lab7 的区别

P0 是工程运行基线，不计入正式教学实验。P0 只负责：

- Rust 裸机工程能够编译。
- 目标架构为 `riscv64gc-unknown-none-elf`。
- 能够在 QEMU `virt` 机器上运行。
- 使用 OpenSBI 进入 S-mode 内核。
- 内核能够输出最小启动信息。
- 提供可重复执行的构建、运行和测试命令。

Lab1 到 Lab7 是面向学生的正式教学实验，每个实验约 3 个循序渐进的小任务，整体难度控制在普通本科生可完成的中等水平。

## 当前仓库目录结构

```text
.
├── .cargo/                 # Rust 目标配置
├── docs/                   # 需求、架构、测试、AI协作和实验文档
├── kernel/                 # RISC-V 教学内核 crate
│   ├── linker.ld
│   └── src/
│       ├── drivers/        # Lab7 内存设备抽象
│       ├── fs/             # Lab7 简化文件系统
│       ├── memory/         # Lab3/Lab4 内存管理
│       ├── task/           # Lab5 协作式调度
│       ├── syscall.rs      # Lab6/Lab7 系统调用分发
│       ├── trap.rs         # Lab2 及后续 trap/syscall 路径
│       └── user.rs         # Lab6/Lab7 内置用户程序
├── scripts/                # 环境检查、QEMU运行和实验测试脚本
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

## 构建与运行

```powershell
cargo build -p ai-os-kernel
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
```

或使用 Makefile：

```powershell
make build
make run
```

底层 QEMU 参数为：

```text
qemu-system-riscv64 -machine virt -nographic -bios default -kernel target/riscv64gc-unknown-none-elf/debug/ai-os-kernel
```

## 自动测试命令

P0：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
```

Lab1 到 Lab7：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

starter 分支可使用 `-ExpectIncomplete` 验证“能启动但未泄露答案”：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

主机单元测试：

```powershell
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

## 成功输出示例

最终 `lab7-solution` 的 QEMU 输出会包含：

```text
[Lab1] PASS
[Lab2] PASS
[Lab3] PASS
[Lab4] PASS
[Lab5] PASS
[Lab6] PASS
[Lab7] PASS
```

Lab7 关键输出：

```text
[Lab7] start
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

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

### QEMU 启动后没有对应 `[LabN] PASS`

请先确认当前分支是否为对应的 solution 分支。starter 分支不会输出本实验的 PASS 标志，应使用 `-ExpectIncomplete` 进行教师侧验证。

### QEMU 测试超时

测试脚本会在超时后终止 QEMU。若发生超时，请检查内核是否卡在死循环、panic、异常重复触发或未执行 SBI system reset。

## Cargo.lock 提交策略

当前仓库包含可执行内核 crate，且比赛验收需要可重复构建。因此建议提交 `Cargo.lock`，用于锁定依赖版本并提升复现性。若后续拆出单独发布到 crates.io 的纯库 crate，可再按 Rust 库发布惯例单独评估。

## 尚未实现或作为扩展的内容

- 统一的 `scripts/test-lab.ps1 all` 测试入口。
- 高地址内核映射。
- 抢占式调度、多核调度和优先级调度。
- ELF 加载、多用户程序、多进程地址空间。
- virtio-block、真实磁盘文件系统和复杂路径解析。
- 最终设计报告、演示视频和答辩材料。
