# AI 合作的操作系统教学实验环境

本项目参加 2026 年全国大学生计算机系统能力大赛，赛项为操作系统设计赛，题目为 OS 功能挑战赛道第 20 题：AI 合作的操作系统教学实验环境。

项目目标是使用 Rust 设计一个运行于 RISC-V 64 和 QEMU/OpenSBI 环境中的操作系统内核教学实验平台。最终成果面向本科生学习、教师教学和比赛验收。

## 如何阅读当前分支

本仓库使用 P0 基线分支和 Lab1-Lab7 的 starter/solution 分支组织教学内容。GitLab 页面显示哪个阶段，取决于左上角当前选择的分支。

| 分支 | 含义 | 验收方式 |
|---|---|---|
| `main` | 默认集成展示入口，包含可视化遥测和最新材料 | 查看完整项目、文档和展示材料 |
| `p0-minimal-qemu-baseline` | P0 工程运行基线，不计入正式教学实验 | `scripts/test-qemu.ps1` 输出 `[P0] PASS` |
| `labN-starter` | 第 N 个实验的学生起点 | 能构建和启动，使用 `-ExpectIncomplete` 验证未泄露答案 |
| `labN-solution` | 第 N 个实验的教师参考实现 | 对应 `scripts/test-labN.ps1` 输出 `[LabN] PASS` |
| `lab7-solution` | 当前完整成果分支 | Lab1-Lab7 全部通过 QEMU 验收 |

如果正在浏览 `lab1-starter`、`lab2-starter` 等分支，README 中的项目总览仍描述整个仓库的教学体系；该分支本身只保留到对应实验的学生起点。完整教学参考实现请查看 `lab7-solution`，包含可视化遥测和最新展示材料的集成版本请查看 `main`。

## 当前项目状态

仓库已经建立 P0 工程基线，并完成 Lab1 到 Lab7 的 starter/solution 分支：

- P0：Rust 裸机内核可交叉编译，并能在 QEMU `virt` + OpenSBI 下启动。
- Lab1：启动与 SBI 控制台。
- Lab2：Trap 与异常处理。
- Lab3：物理内存管理。
- Lab4：RISC-V Sv39 虚拟内存。
- Lab5：单核内核态协作式调度。
- Lab6：最小用户态与系统调用。
- Lab7：设备抽象与教学版内存文件系统。

所有实验使用独立成功标志，例如 `[Lab7] PASS`。starter 分支保留学生任务边界和 TODO，solution 分支提供教师参考实现。

在 `main` / `lab7-solution` 中还包含：

- `docs/final-report.md`：最终技术报告草稿。
- `docs/submission-checklist.md`：提交前检查清单。
- `docs/demo-script.md`：演示视频与答辩讲解脚本。
- `docs/ai-collaboration.md`：AI 协作记录。

## OS 实验可视化与教学反馈

可视化页面位于 [docs/interactive-demo/index.html](docs/interactive-demo/index.html)。它把 P0–Lab7 放入同一张知识地图，实时识别当前 Git 分支，并用构建与 QEMU 串口证据展示实验进度。Ubuntu 中可运行：

```sh
sh scripts/check-env.sh
sh scripts/run-interactive-demo.sh
```

目前页面底部提供学生、教师和其他学习者使用的教学评价表。评价允许如实选择“理解加深”“没有明显变化”“没有帮助”或“更加困惑”。页面还会根据 P0、Lab1–Lab7 以及 starter/solution 分支显示五道针对实验内容的教学评价题，用来评价讲解、任务、提示、可视化和运行反馈，而不是考查知识答案；随后再填写补充反馈。结果可以保存在本机或导出 Markdown/JSON；使用账号提交时，反馈者用自己的 GitLab 账号检查并发布预填 Issue。

当前不足是没有独立数据库、匿名在线问卷、班级统计页面和统一登录系统，草稿也不会跨设备同步。没有 GitLab 项目权限的使用者需要导出 Markdown 后交给教师或项目负责人。现阶段先用真实试用反馈验证教学价值；未来在服务器、维护人员和有效样本具备后，再考虑匿名收集、集中统计、处理状态跟踪与更完整的分支事件标记。详细说明见 [docs/interactive-demo/README.md](docs/interactive-demo/README.md)。

## 实验路线

```mermaid
flowchart LR
    P0["P0 最小运行基线"] --> L1["Lab1 启动与SBI控制台"]
    L1 --> L2["Lab2 Trap与异常处理"]
    L2 --> L3["Lab3 物理内存管理"]
    L3 --> L4["Lab4 Sv39虚拟内存"]
    L4 --> L5["Lab5 协作式调度"]
    L5 --> L6["Lab6 用户态与系统调用"]
    L6 --> L7["Lab7 设备与简化文件系统"]
```

从 Lab5 开始，每个实验拆分为约 3 个循序渐进的小任务，面向普通本科生教学，整体难度控制在中等水平。

## P0 与 Lab1-Lab7 的区别

P0 是工程运行基线，不计入正式教学实验。P0 只负责：

- Rust 裸机工程能够编译。
- 目标架构为 `riscv64gc-unknown-none-elf`。
- 能够在 QEMU `virt` 机器上运行。
- 使用 OpenSBI 进入 S-mode 内核。
- 内核能够输出最小启动信息。
- 提供可重复执行的构建、运行和测试命令。

Lab1 到 Lab7 是面向学生的正式教学实验，每个实验都有 starter 分支、solution 分支、实验文档和自动测试脚本。

## 目录结构

不同阶段分支的文件树会随实验进度逐步增加。集成展示分支 `main` 与教学最终解答分支 `lab7-solution` 的主要结构如下：

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

Windows PowerShell 环境检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

WSL2/Ubuntu 环境检查：

```sh
sh scripts/check-env.sh
```

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

## 自动测试命令

早期分支可能尚未包含后续实验脚本。若当前分支没有某个 `scripts/test-labN.ps1`，请切换到对应的 `labN-starter`、`labN-solution` 或最终成果分支。

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

## 教学版边界与扩展方向

- 统一的 `scripts/test-lab.ps1 all` 测试入口。
- 高地址内核映射。
- 抢占式调度、多核调度和优先级调度。
- ELF 加载、多用户程序、多进程地址空间。
- virtio-block、真实磁盘文件系统和复杂路径解析。
- 更完整的演示视频和答辩 PPT 可基于 `docs/demo-script.md` 与 `docs/final-report.md` 继续制作。
