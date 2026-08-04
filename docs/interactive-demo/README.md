# OS 实验可视化展示

这个 HTML 页面把 P0–Lab7 放进同一张学习地图，并同时提供三类视角：

- 纵向实验链：启动、控制台、Trap、物理内存、虚拟内存、调度、用户态、文件系统怎样逐层组合；
- 横向知识维度：执行链、系统层次、资源管理、保护边界和实验事实；
- 当前实验现场：Git 分支、任务进度、动态结构、结构化事件和原始串口证据。

页面可以直接打开用于离线讲解；通过本地桥接器启动后，会跟踪工作区分支并由真实构建/QEMU 输出驱动。页面下方还提供教学评价表，让学生、教师或其他学习者把真实感受交给项目负责人。

## 目前已经实现

- P0–Lab7 的纵向实验路线与五种横向知识观察维度；
- 当前 Git 分支、starter/solution 角色、实验任务和提交编号的实时识别；
- 构建、QEMU 串口与结构化实验事件的本地展示；
- 包含“有帮助、没有变化、没有帮助、更加困惑”的教学效果评价；
- 评价草稿保存在当前浏览器，并可导出 Markdown 或 JSON；
- 生成 GitLab Issue 预填页面，由反馈者使用自己的 GitLab 账号检查后提交。

## 推荐课堂工作流

准备 Node.js、Rust 的 `riscv64gc-unknown-none-elf` target 和 `qemu-system-riscv64`，在包含新版 Demo 的分支启动一次桥接器。项目主要面向 Ubuntu/VMware 环境，推荐先运行：

```sh
sh scripts/check-env.sh
sh scripts/run-interactive-demo.sh
```

脚本会启动本地页面并尝试打开 `http://127.0.0.1:8888`。只想启动服务而不打开浏览器时使用：

```sh
sh scripts/run-interactive-demo.sh --no-browser
```

希望页面启动后立即构建并运行当前分支时使用：

```sh
sh scripts/run-interactive-demo.sh --run
```

也可以使用原始 Node 命令：

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1 -ServeOnly
```

Ubuntu：

```sh
sh scripts/check-env.sh
node docs/interactive-demo/server.js --port 8888
```

Ubuntu 中再打开 `http://127.0.0.1:8888`。若希望启动页面时立即构建并运行当前分支，在 Node 命令末尾添加 `--run`。

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

可选参数包括 `-Port 8888` 与 `-NoBrowser`。关闭终端或按 `Ctrl+C` 会停止本地服务和它启动的子进程。服务只监听 `127.0.0.1`，不会向网络发送代码或实验输出。

## 教学评价使用方式

1. 完成或体验一个实验后，在页面底部填写学习背景、使用前后理解程度和具体建议。
2. 页面自动显示当前分支、Lab、提交编号和运行状态；不愿附带时可以取消勾选。
3. 临时填写可点“保存本机草稿”，无需登录，也不需要网络。
4. 没有 GitLab 提交权限时导出 Markdown，交给教师或项目负责人统一整理。
5. 有项目权限时点“前往 GitLab 确认提交”，登录自己的账号，检查预填内容后再发布。

可视化服务不会自动上传评价、代码、源文件或终端日志。只有使用者主动打开 GitLab 并确认提交时，评价文字和勾选的简要实验上下文才会离开本机。文本中的常见本机用户目录和访问令牌形式还会在生成反馈时被隐藏。

## 目前不足

- 草稿只保存在当前浏览器，清理浏览器数据或更换电脑后不会自动同步；
- 目前没有独立数据库、匿名在线问卷和项目负责人后台，反馈主要通过 GitLab Issue 或导出文件整理；
- 页面不会自动汇总班级数据，也不能直接生成教学效果统计图；
- GitLab Issue 需要反馈者拥有该项目的可见和提交权限，没有权限时只能使用离线导出；
- 分支与运行状态可以实时跟踪，但不同实验原有输出不完全一致，细粒度动态效果仍取决于已有事件标记；
- 当前评价是自愿反馈，样本数量较少时不能代表所有学生的学习效果。

这些限制符合当前学生团队的设备和维护能力：只依赖浏览器、Node.js、Git、Rust 与 QEMU，不要求额外服务器、数据库或校园统一身份认证。

## 未来期望

- 先邀请同学、助教和教师实际试用，比较使用前后理解程度并整理典型问题；
- 根据真实反馈改进知识地图、实验提示和失败示例，而不是一次加入大量复杂功能；
- 在有稳定服务器和维护人员后，再评估匿名反馈接口、统一数据存储与简单统计页面；
- 为 GitLab Issue 增加“已收到、处理中、已解决”等整理规则，让反馈者能看到改进进度；
- 逐步补充各 Lab 的一致事件标记，提高不同分支下动态过程的精度。

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
node --test docs/interactive-demo/feedback.test.js docs/interactive-demo/protocol.test.js docs/interactive-demo/server.test.js
node --check docs/interactive-demo/feedback.js
node --check docs/interactive-demo/protocol.js
node --check docs/interactive-demo/server.js
node --check docs/interactive-demo/app.js
```
