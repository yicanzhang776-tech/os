# AI 合作的操作系统教学实验环境

本项目参加 2026 年全国大学生计算机系统能力大赛，赛项为操作系统设计赛，题目为 OS 功能挑战赛道第 20 题：AI 合作的操作系统教学实验环境。

项目目标是使用 Rust 设计一个运行于 RISC-V 64 和 QEMU/OpenSBI 环境中的操作系统内核教学实验平台。最终成果面向本科生学习、教师教学和比赛验收。

## 最新集成能力与数据边界

当前集成基线将七个实验、结构化遥测可视化、自愿远程反馈、教师本地评分和 AI 教学助教组成一条可验证的教学闭环。教学助教通过本地 `POST /api/agent` 调用火山方舟 Agent Plan，默认模型为 `ark-code-latest`；服务端只开放六个受限工具，学生首次发送前必须阅读数据告知并在当前浏览器会话中明确同意。独立助教页可把使用者输入的 Key 激活到当前 Node 进程，Key 不写入浏览器存储、文件或 Git，服务停止后自动消失。

数据并非笼统的“完全本地”：预测、回放、分支比较和确定性规则诊断继续在浏览器与本地桥接器处理；教学反馈和脱敏运行记录仅在使用者预览并主动同意后发送到负责人配置的 HTTPS 服务；教学助教会把问题及按需取得的受限证据发送到火山方舟；教师评分页面仍在本地运行，不自动上传成绩，也不因智能体回答自动加分。详见 [AI 教学助教与数据边界](docs/teaching-agent.md)。

## 提交文档入口

- 一页式提交材料导航：[00-提交材料导航.md](00-提交材料导航.md)
- 赛题 30% 五个基础实验 PDF：[tg-rCore 五个基础实验练习总结报告](https://gitlab.eduxiji.net/T2026105749911072/project3136859-388774/-/blob/tg-rcore-five-lab-report/00-tg-rCore-%E4%BA%94%E4%B8%AA%E5%9F%BA%E7%A1%80%E5%AE%9E%E9%AA%8C%E6%80%BB%E7%BB%93%E6%8A%A5%E5%91%8A.pdf)
- 赛题 30% Markdown 与证据包：[总结报告](https://gitlab.eduxiji.net/T2026105749911072/project3136859-388774/-/blob/tg-rcore-five-lab-report/docs/reference-labs/tg-rcore-five-basic-experiments.md) / [截图、日志、补丁与 manifest](https://gitlab.eduxiji.net/T2026105749911072/project3136859-388774/-/tree/tg-rcore-five-lab-report/docs/reference-labs)
- 设计方案与开发文档：[DESIGN.md](DESIGN.md)
- Ubuntu/Linux 本地复现与测试：[docs/testing.md](docs/testing.md)
- 答辩汇报 PPT：[docs/slides/AI-OS-Teaching-Defense-Final.pptx](docs/slides/AI-OS-Teaching-Defense-Final.pptx)
- 同步备份位置：[docs/final-report.md](docs/final-report.md)
- 提交检查清单：[docs/submission-checklist.md](docs/submission-checklist.md)
- 演示视频与答辩讲解脚本：[docs/demo-script.md](docs/demo-script.md)
- AI 协作记录：[docs/ai-collaboration.md](docs/ai-collaboration.md)
- 完整实验教学资料（评委/教师入口）：[docs/labs/README.md](docs/labs/README.md)
- 教师验收与评分工具：[docs/teacher-grading/README.md](docs/teacher-grading/README.md)
- MIT xv6、rCore/LearningOS 与本项目三方比较：[docs/three-way-comparison.md](docs/three-way-comparison.md)

## 如何阅读当前分支

本仓库使用 P0 基线分支和 Lab1-Lab7 的 starter/solution 分支组织教学内容。GitLab 页面显示哪个阶段，取决于当前选择的分支。

| 分支 | 含义 | 验收方式 |
|---|---|---|
| `main` | 默认集成展示入口，包含可视化遥测和最新材料 | 查看完整项目、文档和展示材料 |
| `p0-minimal-qemu-baseline` | P0 工程运行基线，不计入正式教学实验 | `scripts/test-qemu.ps1` 输出 `[P0] PASS` |
| `labN-starter` | 第 N 个实验的学生起点 | 能构建和启动，使用 `-ExpectIncomplete` 验证未泄露答案 |
| `labN-solution` | 第 N 个实验的教师参考实现 | 对应 `scripts/test-labN.ps1` 输出 `[LabN] PASS` |
| `lab7-solution` | 当前完整成果分支 | Lab1-Lab7 全部通过 QEMU 验收 |

截至 2026-08-16，正式交付范围包含 21 个既有远端分支。`main`、`interactive-demo-learning-map`、P0 和 14 个 Lab starter/solution 组成 17 个教学上下文；`agent-mvp`、`lab-atlas-ai-tutor`、`teacher-grading-tools`、`tg-rcore-five-lab-report` 是 4 个辅助功能与报告分支。合并前的临时文档发布分支不计入这套产品分支统计。

`main` 是评委和教师的完整成果入口：汇总 P0-Lab7 的教学说明、参考实现说明、教师指南与评分工具。学生应切换到对应 `labN-starter` 分支完成练习；需要按分支历史查看某个实验的完整参考代码时，可切换到对应 `labN-solution` 分支。包含可视化遥测和最新展示材料的集成版本同样位于 `main`。

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

## OS实验可视化展示

可视化页面把 P0 和 Lab1-Lab7 放入同一张操作系统知识地图，将实验代码、当前 Git 分支以及 QEMU/OpenSBI 串口输出联系起来。学生既可以沿实验顺序理解知识的递进关系，也可以从执行流程、系统层次、资源状态和保护边界等维度观察同一知识点。

当前前端采用 Lab Atlas 实验图谱工作台，以横向 P0-Lab7 路径、实验台、证据和复盘三个任务视图组织学习过程，并保留学习/演示模式和可展开 AI 助教。旧版链接中的 `ui` 参数会被自动移除，不影响 `mode`、`lab` 等实验状态。

页面主要提供以下内容：

- 自动识别 `p0-minimal-qemu-baseline` 以及 Lab1-Lab7 的 starter/solution 分支，并定位当前实验与学习角色。
- 展示从启动、Trap、物理内存、Sv39 虚拟内存、任务调度、用户态与系统调用到设备和文件系统的完整知识链。
- 将真实构建结果和串口输出转换为时间线、知识节点状态及关键证据，而不是播放固定动画。
- 区分 starter 的 TODO、构建失败和 solution 的完成标志，未完成内容不会被误判为通过。
- 同时支持离线讲解和实时实验模式；实时模式下切换实验分支后，页面会自动跟踪新的分支上下文。

实验台右下角提供“小内核”桌宠入口。点击后先打开迷你提问框，只有明确点击“带着问题去问”才会把当前这一条问题一次性写入浏览器会话并跳转到独立助教页。也可以直接打开 <http://127.0.0.1:8888/agent.html> 使用专注聊天界面，或从该页面返回实验台。

独立助教页会在当前浏览器会话中显示问题与回答历史，便于回看和定位，但每次 `/api/agent` 请求仍只发送当前问题，不会把前几轮消息交给模型。启动本地 bridge 后可直接在页面输入测试 Key；Key 只保存在 bridge 的当前进程内。关闭浏览器会话后显示历史不会作为账号数据保留；未配置模型或网络不可用时，实验、诊断、回放与比较功能仍可继续使用。

运行前，学生需要先预测当前分支可能出现的结果并写下判断依据，再由页面启动真实构建与 QEMU。一次运行的结构化事件可以保存在当前浏览器中逐步回放；分别保存同一 Lab 的 starter 与 solution 运行后，还可以比较两者的共同事件和分支独有事件。Linux 运行链路、事件协议、分支映射和具体操作见 [docs/interactive-demo/README.md](docs/interactive-demo/README.md)。

已保存或刚完成的运行可以导出为稳定的 `os-demo.run/v1` JSON，也可以生成 Markdown 运行总结。JSON 可以在另一台电脑的本地页面中导入，导入后继续逐步回放并参与 starter/solution 比较。导入文件只在浏览器本地读取，不上传服务器、不执行文件中的代码，也不会自动切换 Git 分支。

时间线中的事件可以点击查看进一步解释。页面以 `lab + step` 作为稳定键，将运行证据关联到事件名称、OS 知识点、仓库内代码文件、函数或符号、发生原因、状态变化以及可能出现的下一事件；同时高亮知识地图中的对应节点。代码位置使用“仓库相对路径 + 函数/符号”，不依赖容易随修改变化的绝对行号。未登记或旧格式事件会保留原始信息并安全降级，不会中断页面，也不会自动推进知识节点。

运行时间线支持按事件状态、来源、Lab、步骤和关键词筛选，并提供播放/暂停、0.5/1/2/4 倍速、上一步/下一步、首个失败事件与首个 starter/solution 差异跳转。每条事件显示与前一条原始事件的耗时，页面同时显示运行总时长和事件数量，并支持空格、方向键、Home/End、F、D、`/` 与 Esc 快捷键。筛选只改变页面显示和导航，既不会改写已保存事件，也不会省略状态计算所需的隐藏事件；回放状态始终由当前位置之前的完整原始事件序列重建。

### 演示模式

课堂讲解或答辩时，在 Ubuntu/Linux 中运行 `sh scripts/run-interactive-demo.sh`（不要添加 `--run`），再打开 <http://127.0.0.1:8888/?mode=presentation>，也可以从普通页面点击按钮进入演示模式。该模式会放大知识地图、时间线、事件解释、系统状态和 starter/solution 差异，隐藏教学评价、开发调试信息与次要控制，并提供全屏、本地运行记录导入、一键重置和键盘回放。推荐入口为 [Lab1](http://127.0.0.1:8888/?mode=presentation&lab=lab1)、[Lab2](http://127.0.0.1:8888/?mode=presentation&lab=lab2)、[Lab4](http://127.0.0.1:8888/?mode=presentation&lab=lab4) 和 [Lab5](http://127.0.0.1:8888/?mode=presentation&lab=lab5)。

演示模式不会自动运行 QEMU、切换 Git 分支或上传运行记录；真实运行仍必须由使用者明确确认。本次浏览器会话只保存演示视图位置，重置演示状态不会删除本机已有的运行记录、预测或教学反馈。退出演示模式后恢复普通布局，普通模式原有功能不受影响。详细操作见[可视化使用说明](docs/interactive-demo/README.md)。

### 本地确定性规则诊断

可视化页面使用 `diagnostics.js` 在本机按固定规则分析当前 Lab、分支角色、构建结果、`os-demo.event/v1` 事件、经过净化和长度限制的稳定输出以及最终运行状态；该确定性诊断模块自身不调用模型或网络。可选的 AI 教学助教是独立链路，只在首次同意并手动提问后调用云端模型。

诊断中的“能确定”只表示触发现象具有直接证据，根因仍统一表述为“可能原因”；证据不足时不会猜测，starter 按设计停在 TODO 会显示为正常教学停点而不是错误。运行历史只保存净化后的限长证据，不保存诊断结论；加载历史记录时会根据同一组规则重新计算。

### 当前分支入口

- [可视化介绍与使用说明](docs/interactive-demo/README.md)
- [可视化页面源码](docs/interactive-demo/index.html)

以上链接均为相对路径。在 GitLab 中从哪个分支打开 README，就会进入该分支自己的可视化目录。仓库页面只能查看页面源码；实时分支识别、构建和 QEMU 事件需要在本机启动桥接服务。

### 教学评价与反馈

页面底部提供学生、教师、助教和其他学习者使用的教学评价表。评价可以如实选择“理解加深”“没有明显变化”“没有帮助”或“更加困惑”。页面还会根据 P0、Lab1–Lab7 以及 starter/solution 分支显示五道针对实验内容的教学评价题，用来评价讲解、任务、提示、可视化和运行反馈，而不是考查知识答案；随后再填写补充反馈。结果可以保存为本机草稿或导出 Markdown/JSON，也可以在填写项目负责人提供的 HTTPS 服务地址后主动提交。提交使用 `os-demo.feedback.submit/v1`，网络失败时保留同一条待提交记录和 `feedback.id`，恢复后重试不会重复保存。

异地收集链路为“8888 可视化页面 → HTTPS 临时隧道 → 127.0.0.1:8890 接收服务 → 本机 JSONL → 127.0.0.1:8891 查看页”。接收端重新校验并过滤评价，支持邀请码、32 KiB 上限、来源白名单、简单限流、重复提交幂等和冲突拒绝；本机查看页支持按 Lab、分支角色、使用者身份筛选，并导出 JSON、CSV 和 Markdown。它不会使用 GitLab Issue、邮箱、AI 或云数据库，也不会上传实验代码、访问令牌和终端日志。完整启动与 Cloudflare Quick Tunnel 步骤见[可视化使用说明](docs/interactive-demo/README.md)。

学生还可以在保存运行后，自愿选择其中一次 `os-demo.run/v1` 记录，查看脱敏预览并明确勾选同意，再以 `os-demo.run.submit/v1` 发送到同一 8890 服务。单次最多 512 个 `os-demo.event/v1` 事件、512 KiB；提交内容不含源代码、文件内容、命令行、环境变量或完整终端/串口日志。运行记录单独写入 `feedback-data/runs.jsonl`，相同 `runId` 重试保持幂等，不同内容冲突时不覆盖原记录。8891 可按 Lab、分支角色和最终结果筛选运行记录，查看脱敏事件知识时间线，并导出 JSON、CSV 摘要或 Markdown 总结。页面不会自动、后台或批量上传运行数据，也不把记录用于自动评分和排名。

### 启动实时模式

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1 -ServeOnly
```

Ubuntu：

```sh
sh scripts/check-env.sh
node docs/interactive-demo/server.js --port 8888
```

Windows PowerShell 脚本属于兼容入口，不影响 Ubuntu/Linux 下的实验构建和可视化运行。

启动后访问 `http://127.0.0.1:8888`。需要在启动页面时立即构建并运行当前分支时，Windows 可去掉 `-ServeOnly`，Ubuntu 可在 Node 命令末尾添加 `--run`。完整操作、分支切换方式和自动化测试命令见[可视化使用说明](docs/interactive-demo/README.md)。

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
├── crates/
│   └── os-demo-event/      # no_std 事件协议校验与编码 Crate
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

## 独立事件协议 Crate

`crates/os-demo-event/` 提供小型、独立且可复用的 `os-demo-event` Crate。它集中定义 `os-demo.event/v1` 协议版本、Lab 标识、事件状态，以及 `lab + step` 字段的校验和无堆编码接口。该 Crate 不实现任何 Lab 逻辑，不包含学生答案或教师评分内容。

`kernel/src/telemetry.rs` 已实际依赖这个 Crate，并通过 `core::fmt::Write` 将编码结果直接写入现有控制台。串口格式仍为 `[OS_DEMO] lab=<lab> step=<step>`，因此浏览器端 `protocol.js`、事件目录稳定键和已有 PASS/TODO 判定保持兼容。Crate 使用 `#![no_std]`，不依赖 `alloc`、文件系统、网络、进程或第三方库。

在装有 Rust 工具链的 Ubuntu/Linux 环境中可以独立验证：

```sh
HOST_TARGET=$(rustc -vV | sed -n 's/^host: //p')
cargo test -p os-demo-event --target "$HOST_TARGET"
cargo doc -p os-demo-event --no-deps
cargo package -p os-demo-event
```

`cargo package` 只检查打包条件；本项目不会在验收流程中自动执行 `cargo publish`。

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

每个 Lab 还支持分阶段验收。`-Stage 1/2/3` 分别检查当前实验从基础机制到端到端行为的阶段证据；`-Stage` 与 `-ExpectIncomplete` 不能同时使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

`main` 使用集成运行中的稳定事件作为阶段证据；各 `labN-solution` 使用任务书约定的 `[LabN-T1]`、`[LabN-T2]` 与最终 `[LabN] PASS`。教师评分工具只随 `main` 发布，教学分支可从可视化页面导出 `os-demo.run/v1`，再回到 `main` 导入评分页面。

主机单元测试：

```powershell
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

可视化、协议交换、本地桥接器与教师评分工具测试：

```powershell
node --test docs/interactive-demo/diagnostics.test.js docs/interactive-demo/event-catalog.test.js docs/interactive-demo/feedback.test.js docs/interactive-demo/prediction-model.test.js docs/interactive-demo/presentation-mode.integration.test.js docs/interactive-demo/presentation-mode.test.js docs/interactive-demo/protocol.test.js docs/interactive-demo/run-history.test.js docs/interactive-demo/run-transfer.test.js docs/interactive-demo/server.test.js docs/interactive-demo/state-model.test.js docs/interactive-demo/state-diff.test.js docs/interactive-demo/timeline-controller.test.js docs/teacher-grading/grading-core.test.js
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
node --check docs/teacher-grading/grading-core.js
node --check docs/teacher-grading/app.js
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
- 正式答辩 PPT 位于 `docs/slides/AI-OS-Teaching-Defense-Final.pptx`；现场路线以 `docs/demo-script.md` 为准，视频状态需由项目成员按真实录制结果确认。
