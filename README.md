# AI 合作的操作系统教学实验环境

本项目参加 2026 年全国大学生计算机系统能力大赛，赛项为操作系统设计赛，题目为 OS 功能挑战赛道第 20 题：AI 合作的操作系统教学实验环境。

项目目标是使用 Rust 设计一个运行于 RISC-V 64 和 QEMU/OpenSBI 环境中的操作系统内核教学实验平台。最终成果面向本科生学习、教师教学和比赛验收。

## 提交文档入口

- **设计方案与开发文档**：[DESIGN.md](DESIGN.md)
- **OS实验可视化展示**：[介绍与启动说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)；[GitHub 最新目录](https://github.com/yicanzhang776-tech/os/tree/main/docs/interactive-demo)）
- **答辩汇报 PPT**：[docs/slides/AI-OS-Teaching-Defense-Final.pptx](docs/slides/AI-OS-Teaching-Defense-Final.pptx)
- 同步备份位置：[docs/final-report.md](docs/final-report.md)
- 提交检查清单：[docs/submission-checklist.md](docs/submission-checklist.md)
- 演示视频与答辩讲解脚本：[docs/demo-script.md](docs/demo-script.md)
- AI 协作记录：[docs/ai-collaboration.md](docs/ai-collaboration.md)

## OS实验可视化展示

可视化页面把 P0 和 Lab1-Lab7 放入同一张操作系统知识地图，将实验代码、当前 Git 分支以及 QEMU/OpenSBI 串口输出联系起来。学生既可以沿实验顺序理解知识的递进关系，也可以从执行流程、系统层次、资源状态和保护边界等维度观察同一知识点。

页面主要提供以下内容：

- 自动识别 `p0-minimal-qemu-baseline` 以及 Lab1-Lab7 的 starter/solution 分支，并定位当前实验与学习角色。
- 展示从启动、Trap、物理内存、Sv39 虚拟内存、任务调度、用户态与系统调用到设备和文件系统的完整知识链。
- 将真实构建结果和串口输出转换为时间线、知识节点状态及关键证据，而不是播放固定动画。
- 区分 starter 的 TODO、构建失败和 solution 的完成标志，未完成内容不会被误判为通过。
- 同时支持离线讲解和实时实验模式；实时模式下切换实验分支后，页面会自动跟踪新的分支上下文。

运行前，学生需要先预测当前分支可能出现的结果并写下判断依据，再由页面启动真实构建与 QEMU。一次运行的结构化事件可以保存在当前浏览器中逐步回放；分别保存同一 Lab 的 starter 与 solution 运行后，还可以比较两者的共同事件和分支独有事件。Linux 运行链路、事件协议、分支映射和具体操作见 [docs/interactive-demo/README.md](docs/interactive-demo/README.md)。

已保存或刚完成的运行可以导出为稳定的 `os-demo.run/v1` JSON，也可以生成 Markdown 运行总结。JSON 可以在另一台电脑的本地页面中导入，导入后继续逐步回放并参与 starter/solution 比较。导入文件只在浏览器本地读取，不上传服务器、不执行文件中的代码，也不会自动切换 Git 分支。

时间线中的事件可以点击查看进一步解释。页面以 `lab + step` 作为稳定键，将运行证据关联到事件名称、OS 知识点、仓库内代码文件、函数或符号、发生原因、状态变化以及可能出现的下一事件；同时高亮知识地图中的对应节点。代码位置使用“仓库相对路径 + 函数/符号”，不依赖容易随修改变化的绝对行号。未登记或旧格式事件会保留原始信息并安全降级，不会中断页面，也不会自动推进知识节点。

运行时间线支持按事件状态、来源、Lab、步骤和关键词筛选，并提供播放/暂停、0.5/1/2/4 倍速、上一步/下一步、首个失败事件与首个 starter/solution 差异跳转。每条事件显示与前一条原始事件的耗时，页面同时显示运行总时长和事件数量，并支持空格、方向键、Home/End、F、D、`/` 与 Esc 快捷键。筛选只改变页面显示和导航，既不会改写已保存事件，也不会省略状态计算所需的隐藏事件；回放状态始终由当前位置之前的完整原始事件序列重建。

### 演示模式

课堂讲解或答辩时，在 Ubuntu/Linux 中运行 `sh scripts/run-interactive-demo.sh`（不要添加 `--run`），再打开 <http://127.0.0.1:4173/?mode=presentation>，也可以从普通页面点击按钮进入演示模式。该模式会放大知识地图、时间线、事件解释、系统状态和 starter/solution 差异，隐藏教学评价、开发调试信息与次要控制，并提供全屏、本地运行记录导入、一键重置和键盘回放。推荐入口为 [Lab1](http://127.0.0.1:4173/?mode=presentation&lab=lab1)、[Lab2](http://127.0.0.1:4173/?mode=presentation&lab=lab2)、[Lab4](http://127.0.0.1:4173/?mode=presentation&lab=lab4) 和 [Lab5](http://127.0.0.1:4173/?mode=presentation&lab=lab5)。

演示模式不会自动运行 QEMU、切换 Git 分支或上传运行记录；真实运行仍必须由使用者明确确认。本次浏览器会话只保存演示视图位置，重置演示状态不会删除本机已有的运行记录、预测或教学反馈。退出演示模式后恢复普通布局，普通模式原有功能不受影响。详细操作见[可视化使用说明](docs/interactive-demo/README.md)。

### 本地确定性规则诊断

可视化页面使用 `diagnostics.js` 在本机按固定规则分析当前 Lab、分支角色、构建结果、`os-demo.event/v1` 事件、经过净化和长度限制的稳定输出以及最终运行状态，不使用 AI 模型、智能体、网络 API 或外部服务。规则覆盖构建环境、starter TODO、QEMU 超时，以及 Lab2-Lab7 的 Trap、`sepc`、`satp`、页帧、调度、系统调用和文件 I/O 常见现象。

诊断中的“能确定”只表示触发现象具有直接证据，根因仍统一表述为“可能原因”；证据不足时不会猜测，starter 按设计停在 TODO 会显示为正常教学停点而不是错误。运行历史只保存净化后的限长证据，不保存诊断结论；加载历史记录时会根据同一组规则重新计算。

### 教学评价与反馈

页面底部提供学生、教师、助教和其他学习者使用的教学评价表。评价可以如实选择“理解加深”“没有明显变化”“没有帮助”或“更加困惑”。页面还会根据 P0、Lab1–Lab7 以及 starter/solution 分支显示五道针对实验内容的教学评价题，用来评价讲解、任务、提示、可视化和运行反馈，而不是考查知识答案；随后再填写补充反馈。结果可以保存为本机草稿或导出 Markdown/JSON；使用账号提交时，反馈者会前往 GitLab 预填页面，用自己的账号检查后再发布。

目前没有独立数据库、匿名在线问卷、班级统计页面和统一登录系统，草稿也不会跨设备同步。没有 GitLab 项目权限时，可以导出 Markdown 后交给教师或项目负责人。现阶段先通过同学和教师的真实试用验证教学价值；未来在具备服务器、维护人员和有效样本后，再考虑匿名收集、集中统计、处理状态跟踪与更完整的分支事件标记。

### 启动实时模式

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1 -ServeOnly
```

Ubuntu：

```sh
sh scripts/check-env.sh
sh scripts/run-interactive-demo.sh
```

Windows PowerShell 脚本属于兼容入口，不影响 Ubuntu/Linux 下的实验构建和可视化运行。

启动后访问 `http://127.0.0.1:4173`。需要在启动页面时立即构建并运行当前分支时，Windows 可去掉 `-ServeOnly`，Ubuntu 可运行 `sh scripts/run-interactive-demo.sh --run`。完整操作、分支切换方式和自动化测试命令见[可视化使用说明](docs/interactive-demo/README.md)。

### 仓库页面中的链接说明

`docs/interactive-demo/index.html` 是页面源码路径，不是已经部署到公网的动态页面。直接浏览源码或离线打开页面时可以查看教学内容，但实时分支识别、构建和 QEMU 事件需要在本机启动上述桥接服务。

如果代码托管页面提示该文件“在主频道/主分支上并不存在”，请先确认当前仓库和分支中是否确实包含 `docs/interactive-demo/`。本项目当前完整版本位于 [GitHub main 分支](https://github.com/yicanzhang776-tech/os/tree/main)；把项目复制到其他 GitLab 仓库时，应同步整个仓库目录和分支，而不能只替换 `README.md`，否则 README 中的文档链接会指向尚未上传的文件。

## 如何阅读当前分支

本仓库使用 P0 基线分支和 Lab1-Lab7 的 starter/solution 分支组织教学内容。GitHub 或 GitLab 页面显示哪个阶段，取决于当前选择的分支。

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

- `DESIGN.md`：设计方案与开发文档，便于在 GitLab 根目录直接查看。
- `docs/final-report.md`：设计方案与开发文档的 docs 目录备份。
- `docs/submission-checklist.md`：提交前检查清单。
- `docs/demo-script.md`：演示视频与答辩讲解脚本。
- `docs/ai-collaboration.md`：AI 协作记录。

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

### 跨平台运行与文件行尾说明

本项目主要在 Ubuntu/Linux 环境中构建和运行，操作系统内核、QEMU 实验以及可视化页面均以 Linux 环境作为主要验收环境。

仓库同时保留部分 Windows PowerShell 脚本，用于 Windows 环境下的依赖检查、QEMU 启动和实验测试。Linux 用户不需要执行这些 PowerShell 脚本，可直接使用对应的 Shell、Cargo、QEMU 和 Node.js 命令。

为了避免 Windows 的 CRLF 行尾与 Linux 的 LF 行尾产生整文件差异，仓库使用 `.gitattributes` 对后续新增的可视化和教学评价文件进行约束：

- `docs/interactive-demo/` 中的 HTML、CSS、JavaScript 和 Markdown 文件统一使用 LF。
- Linux Shell 启动脚本统一使用 LF。
- Windows PowerShell 启动脚本保留 CRLF。
- 原有 Lab 实验代码、实验文档和测试内容不进行全仓库重新规范化，避免产生与功能无关的大规模修改。

后续修改可视化或教学评价内容时，建议通过本地 Git 提交，并在提交前执行：

```bash
git status --short
git diff --stat
git diff --check
```

如果修改内容出现大量与实际功能无关的行尾变化，应先停止提交并检查编辑器的行尾设置。不要直接执行全仓库行尾重新规范化操作。

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

可视化事件知识目录与本地桥接器测试：

```powershell
node --test docs/interactive-demo/diagnostics.test.js docs/interactive-demo/event-catalog.test.js docs/interactive-demo/feedback.test.js docs/interactive-demo/prediction-model.test.js docs/interactive-demo/presentation-mode.integration.test.js docs/interactive-demo/presentation-mode.test.js docs/interactive-demo/protocol.test.js docs/interactive-demo/run-history.test.js docs/interactive-demo/run-transfer.test.js docs/interactive-demo/server.test.js docs/interactive-demo/state-model.test.js docs/interactive-demo/state-diff.test.js docs/interactive-demo/timeline-controller.test.js
node --check docs/interactive-demo/event-catalog.js
node --check docs/interactive-demo/prediction-model.js
node --check docs/interactive-demo/presentation-mode.js
node --check docs/interactive-demo/run-history.js
node --check docs/interactive-demo/run-transfer.js
node --check docs/interactive-demo/state-model.js
node --check docs/interactive-demo/state-diff.js
node --check docs/interactive-demo/timeline-controller.js
node --check docs/interactive-demo/server.js
node --check docs/interactive-demo/app.js
node --check docs/interactive-demo/diagnostics.js
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
