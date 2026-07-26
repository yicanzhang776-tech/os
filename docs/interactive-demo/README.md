# OS 实验可视化展示

这个 HTML 页面把 P0–Lab7 放进同一张学习地图，并同时提供三类视角：

- 纵向实验链：启动、控制台、Trap、物理内存、虚拟内存、调度、用户态、文件系统怎样逐层组合；
- 横向知识维度：执行链、系统层次、资源管理、保护边界和实验事实；
- 当前实验现场：Git 分支、任务进度、动态结构、结构化事件和原始串口证据。

页面可以直接打开用于离线讲解；通过本地桥接器启动后，会跟踪工作区分支并由真实构建/QEMU 输出驱动。

## 推荐课堂工作流

准备 Node.js、Rust 的 `riscv64gc-unknown-none-elf` target 和 `qemu-system-riscv64`，在包含新版 Demo 的分支启动一次桥接器：

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1 -ServeOnly
```

Ubuntu：

```sh
sh scripts/check-env.sh
node docs/interactive-demo/server.js --port 4173
```

Ubuntu 中再打开 `http://127.0.0.1:4173`。若希望启动页面时立即构建并运行当前分支，在 Node 命令末尾添加 `--run`。

保持这个终端运行，然后让学生正常切换分支：

```sh
git switch lab3-starter
```

页面会在约 1.2 秒内识别 `p0-minimal-qemu-baseline`、`lab1-starter` 至 `lab7-solution` 等 15 个教学分支，自动定位实验和分支角色。点击“构建并运行当前分支”后，页面清空上一轮证据并跟随本次实验；starter 停在 TODO 时会显示“停在 TODO”，不会伪装成已完成。若 QEMU 在 TODO 后保持运行，可先点“停止当前运行”，再切换或重跑。

桥接器在启动时把新版 HTML/CSS/JS 保存在内存中。因此，即使切到尚未同步新版页面的自定义或历史分支，正在运行的页面也不会退回旧版；源码链接则始终读取当前分支，便于对照实验代码。P0 和 Lab1–Lab7 的 starter/solution 均包含同一版桥接器，也可以先切换到目标教学分支，再从该分支独立启动页面。

不加 `-ServeOnly` 时，脚本会在启动桥接器后立即构建并运行当前分支：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1
```

可选参数包括 `-Port 4173` 与 `-NoBrowser`。关闭终端或按 `Ctrl+C` 会停止本地服务和它启动的子进程。服务只监听 `127.0.0.1`，不会向网络发送代码或实验输出。

## 事件兼容策略

桥接器优先识别显式标记：

```text
[OS_DEMO] lab=lab4 step=satp-activated
```

`main` 中已有的结构化标记能提供最细粒度的动态步骤。15 个教学分支没有一致、可达的 `[OS_DEMO]` 埋点，因此桥接器还会识别各分支原有且稳定的实验输出，例如 `[Lab5] scheduler initialized`、`[Lab6] syscall write`、任务级 `TODO/PASS` 和最终 `PASS/FAIL`。这样无需改写学生实验逻辑，也能在 starter/solution 间实时展示可信进度。

事件只在对应动作已经输出证据后更新。例如 `stvec` 安装、breakpoint 处理、页帧分配、`satp` 激活、任务切换、用户态 `ecall` 和文件读写。未完成的 TODO、构建失败和运行失败均不会被当作通过。

## 接入已有 QEMU 命令

如果需要保留自己的 QEMU 参数，可将串口输出交给桥接器标准输入：

```powershell
qemu-system-riscv64 ... | node docs/interactive-demo/server.js --stdin
```

此时页面仍使用相同的分支识别、事件归一化和知识地图。

## 自动化检查

分支与串口协议使用 Node 内置测试，无第三方依赖：

```powershell
node --test docs/interactive-demo/protocol.test.js docs/interactive-demo/server.test.js
node --check docs/interactive-demo/protocol.js
node --check docs/interactive-demo/server.js
node --check docs/interactive-demo/app.js
```
