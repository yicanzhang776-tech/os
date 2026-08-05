# OS 实验可视化展示

这个 HTML 页面把 P0–Lab7 放进同一张学习地图，并同时提供三类视角：

- 纵向实验链：启动、控制台、Trap、物理内存、虚拟内存、调度、用户态、文件系统怎样逐层组合；
- 横向知识维度：执行链、系统层次、资源管理、保护边界和实验事实；
- 当前实验现场：Git 分支、任务进度、动态结构、结构化事件和原始串口证据。

页面可以直接打开用于离线讲解；通过本地桥接器启动后，会跟踪工作区分支并由真实构建/QEMU 输出驱动。页面下方还提供教学评价表，让学生、教师或其他学习者把真实感受交给项目负责人。

## 目前已经实现

- P0–Lab7 的纵向实验路线与五种横向知识观察维度；
- 当前 Git 分支、starter/solution 角色、实验任务和提交编号的实时识别；
- `os-demo.event/v1` 版本化事件协议，以及 GitHub/GitLab 前缀下 17 个现有分支的统一映射；
- 构建、QEMU 串口与结构化实验事件的本地展示；
- 学生保存结构化预测后才能从页面启动当前分支，并在运行结束后按真实构建和 QEMU 证据自动对照；
- 一次运行最多保存 512 个有序结构化事件，可在当前浏览器中保存并逐步回放；
- 对同一 Lab 已保存的 starter/solution 运行同时进行事件序列与系统状态差异比较；
- 使用 `lab + step` 稳定键把运行事件关联到代码文件、函数或符号、OS 知识点、前因、状态变化和后续事件；
- 点击实时或回放时间线事件时显示完整解释，并同步高亮知识地图中的对应节点；
- 包含“有帮助、没有变化、没有帮助、更加困惑”的教学效果评价；
- 根据 P0、Lab1–Lab7 和 starter/solution 分支自动切换五道针对实验内容的教学评价题；
- 评价草稿保存在当前浏览器，并可导出 Markdown 或 JSON；
- 生成 GitLab Issue 预填页面，由反馈者使用自己的 GitLab 账号检查后提交。

## 推荐课堂工作流

准备 Node.js、Rust 的 `riscv64gc-unknown-none-elf` target 和 `qemu-system-riscv64`，在包含新版 Demo 的分支启动一次桥接器。项目主要面向 Ubuntu/VMware 环境，推荐先运行：

```sh
sh scripts/check-env.sh
sh scripts/run-interactive-demo.sh --check-only
sh scripts/run-interactive-demo.sh
```

`--check-only` 会检查 Node.js、Git、Cargo、`riscv64gc-unknown-none-elf` 和 QEMU 的完整 Linux 运行链路。脚本会启动本地页面并尝试打开 `http://127.0.0.1:8888`。只想启动服务而不打开浏览器时使用：

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

页面会在约 1.2 秒内识别 `main`、`interactive-demo-learning-map`、`p0-minimal-qemu-baseline`、`lab1-starter` 至 `lab7-solution` 共 17 个现有分支，自动定位实验和分支角色。学生需要先选择预期结果并写下关键事件或原因，保存预测后才能点击“构建并运行当前分支”。页面会清空上一轮证据并跟随本次实验；starter 停在 TODO 时会显示“停在 TODO”，不会伪装成已完成。若 QEMU 在 TODO 后保持运行，可先点“停止当前运行”，再切换或重跑。

### 结构化预测与自动对照

运行前需要填写预计构建结果、预计运行结果、预计最终是否出现 PASS、预测依据文字，并从当前 Lab 的 `event-catalog.js` 中选择预计出现的关键事件。原有预测依据输入继续保留。旧版 localStorage 预测会在读取时迁移到新结构；旧版“构建或运行失败”无法区分失败阶段，因此只保留原意，不猜测具体是构建失败还是运行失败。

运行结束后，`prediction-model.js` 根据桥接器提供的真实构建生命周期和 `os-demo.event/v1` QEMU 事件生成“预测与实际对照”。页面分别列出预测正确、预测遗漏、实际未出现、结果相反、额外关键事件和无法判断项，并只使用“预测一致、部分一致、需要重新理解、无法判断”等教学性表述，不计算成绩或排名。starter 停在 TODO 只要与真实 TODO 事件一致，就是正确预测。

构建成功只有在 QEMU 确实开始运行或桥接器报告成功后才能确认；构建失败和运行失败由真实子进程结果确认。QEMU 超时必须有明确的 `runResult=timeout` 生命周期证据，手动停止不会被当作超时。没有对应证据时页面显示“无法判断”。

桥接器固定使用 `riscv64gc-unknown-none-elf` 构建目标，不依赖用户目录中的 Cargo 默认 target。页面启动的每次运行都有独立 `runId`，事件同时记录协议版本、分支、提交、顺序和时间。运行结束后可以保存时间线；切换到同一 Lab 的另一个分支再运行并保存，即可比较 starter 与 solution 的共同事件和分支独有事件。回放只重建可视化状态，不会重新执行内核或修改 Git 分支。

桥接器在启动时把新版 HTML/CSS/JS 保存在内存中。因此，即使切到尚未同步新版页面的自定义或历史分支，正在运行的页面也不会退回旧版；源码链接则始终读取当前分支，便于对照实验代码。P0 和 Lab1–Lab7 的 starter/solution 均包含同一版桥接器，也可以先切换到目标教学分支，再从该分支独立启动页面。

不加 `-ServeOnly` 时，脚本会在启动桥接器后立即构建并运行当前分支：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1
```

可选参数包括 `-Port 8888` 与 `-NoBrowser`。关闭终端或按 `Ctrl+C` 会停止本地服务和它启动的子进程。服务只监听 `127.0.0.1`，不会向网络发送代码或实验输出。

## 教学评价使用方式

1. 完成或体验一个实验后，在页面底部先填写学习背景和使用前后理解程度。
2. 页面根据当前分支显示五道教学评价题。题目会涉及该实验的真实知识点，但评价的是讲解是否清晰、任务难度是否合适、提示和可视化是否有帮助、运行反馈是否有效，不要求填写知识答案。
3. 五道题必须全部选择 1–5 分，1 分表示负面评价，5 分表示正面评价。starter 的第 5 题关注 TODO、Stage 和提示，solution 的第 5 题关注参考实现及说明。
4. 五道教学评价题后可以继续填写最有帮助的内容、仍然困惑的内容和改进建议。
5. 页面自动显示当前分支、Lab、提交编号和运行状态；不愿附带时可以取消勾选。
6. 临时填写可点“保存本机草稿”，无需登录，也不需要网络。
7. 没有 GitLab 提交权限时导出 Markdown；有权限时前往 GitLab，用自己的账号检查后发布。

可视化服务不会自动上传评价、代码、源文件或终端日志。只有使用者主动打开 GitLab 并确认提交时，评价文字和勾选的简要实验上下文才会离开本机。文本中的常见本机用户目录和访问令牌形式还会在生成反馈时被隐藏。

## 目前不足

- 草稿只保存在当前浏览器，清理浏览器数据或更换电脑后不会自动同步；
- 目前没有独立数据库、匿名在线问卷和项目负责人后台，反馈主要通过 GitLab Issue 或导出文件整理；
- 页面不会自动汇总班级数据，也不能直接生成教学效果统计图；
- GitLab Issue 需要反馈者拥有该项目的可见和提交权限，没有权限时只能使用离线导出；
- 分支与运行状态可以实时跟踪，但不同实验原有输出不完全一致，细粒度动态效果仍取决于已有事件标记；
- 当前评价是自愿反馈，样本数量较少时不能代表所有学生的学习效果。
- 五道教学评价题目前由项目组根据实验任务书设计，仍需通过同学和教师试用来检查措辞是否容易理解、评价维度是否合理。
- 运行时间线和预测目前只保存在当前浏览器，最多保留最近 12 次；清理浏览器数据后无法恢复；
- starter/solution 对比需要使用者分别切换分支、真实运行并保存，页面不会自动执行 `git switch`；
- 时间线保存的是经过协议校验的教学事件，不保存完整原始终端日志，也不自动上传到服务器。

这些限制符合当前学生团队的设备和维护能力：只依赖浏览器、Node.js、Git、Rust 与 QEMU，不要求额外服务器、数据库或校园统一身份认证。

## 未来期望

- 先邀请同学、助教和教师实际试用，比较使用前后理解程度并整理典型问题；
- 根据真实反馈改进知识地图、实验提示和失败示例，而不是一次加入大量复杂功能；
- 在有稳定服务器和维护人员后，再评估匿名反馈接口、统一数据存储与简单统计页面；
- 为 GitLab Issue 增加“已收到、处理中、已解决”等整理规则，让反馈者能看到改进进度；
- 逐步补充各 Lab 的一致事件标记，提高不同分支下动态过程的精度。

## 事件兼容策略

桥接器使用稳定协议 `os-demo.event/v1`。推荐的显式标记为：

```text
[OS_DEMO] v=1 lab=lab4 step=satp-activated status=running
```

为兼容已有内核，旧格式 `[OS_DEMO] lab=lab4 step=satp-activated` 仍按 v1 处理。未知协议版本、未知 Lab、非法状态和非法步骤会被忽略。`main` 中已有的结构化标记能提供最细粒度的动态步骤。15 个教学分支没有一致、可达的 `[OS_DEMO]` 埋点，因此桥接器还会识别各分支原有且稳定的实验输出，例如 `[Lab5] scheduler initialized`、`[Lab6] syscall write`、任务级 `TODO/PASS` 和最终 `PASS/FAIL`。这样无需改写学生实验逻辑，也能在 starter/solution 间实时展示可信进度。

归一化事件至少包含 `protocol`、`lab`、`step`、`status`、`source`。本地桥接器再补充 `runId`、`branch`、`commit`、`sequence` 和 `timestamp`，从而使保存、比较和回放不依赖页面动画的当前状态。

事件只在对应动作已经输出证据后更新。例如 `stvec` 安装、breakpoint 处理、页帧分配、`satp` 激活、任务切换、用户态 `ecall` 和文件读写。未完成的 TODO、构建失败和运行失败均不会被当作通过。

### 事件知识目录与安全降级

`event-catalog.js` 是事件解释的统一目录。目录不改变 `os-demo.event/v1` 的字段含义，只使用归一化事件中的 `lab` 和 `step` 查找教学信息。每个已登记事件包含事件名称、OS 知识点、仓库相对文件路径、函数或符号、发生原因、状态影响和可能的下一事件。源码定位不保存绝对行号，因此添加注释或调整代码布局后仍能保持稳定。

当前目录覆盖 Lab1 的 `print_line → SBI ecall → OpenSBI → UART`，Lab2 的 `stvec → Trap → scause/sepc → breakpoint`，以及 Lab3–Lab7 的页帧、页表、调度、用户态系统调用和文件 I/O 关键过程。部分细分事件只有在内核显式输出对应 `[OS_DEMO]` 标记时才会出现在实时页面；目录不会为了展示效果伪造没有发生的运行步骤。

收到未登记步骤或缺少字段的旧事件时，页面显示经过长度限制的原始事件、原始状态和安全降级提示，不生成源码链接，也不推进知识节点。目录中的源码路径必须是仓库内相对路径，包含 `..`、绝对路径、盘符、查询参数或网络共享形式的路径会被拒绝。实时运行和保存回放共用同一解释函数，因此同一事件在两种场景下显示相同含义。

整个联动过程只在当前浏览器和监听 `127.0.0.1` 的本地桥接器中完成，不连接外部服务，也不上传代码、事件或终端日志。

### 系统状态重建与差异比较

`state-model.js` 只读取经过校验的 `os-demo.event/v1` 结构化事件，并按事件顺序重建 Lab1–Lab7 的简化教学状态。实时运行与逐步回放使用相同计算方法，因此回放到任意事件时，页面会显示该事件发生后的输出链、Trap、内存、页表、任务、系统调用或文件状态。状态不从动画元素或页面文字反推。

`state-diff.js` 计算同一 Lab 的 starter 与 solution 最终状态，并把结果分为相同、发生变化、只在 starter 有证据和只在 solution 有证据四类；原有事件序列比较继续保留。TODO 会明确保持未完成，单独出现的 PASS 也不会被直接判断为完成，必须同时存在对应 Lab 的真实过程事件。

现有事件没有携带精确数值时，页面统一显示“没有足够运行证据”或说明仅能确定变化方向。例如目前不能可靠给出页帧精确数量、satp 数值、系统调用号与参数、fd 编号、文件偏移和文件大小。后续若要显示这些值，应由内核新增兼容 `os-demo.event/v1` 的结构化证据，而不能根据动画猜测。

## 接入已有 QEMU 命令

如果需要保留自己的 QEMU 参数，可将串口输出交给桥接器标准输入：

```powershell
qemu-system-riscv64 ... | node docs/interactive-demo/server.js --stdin
```

此时页面仍使用相同的分支识别、事件归一化和知识地图。

## 自动化检查

分支与串口协议使用 Node 内置测试，无第三方依赖：

```powershell
node --test docs/interactive-demo/event-catalog.test.js docs/interactive-demo/feedback.test.js docs/interactive-demo/prediction-model.test.js docs/interactive-demo/protocol.test.js docs/interactive-demo/run-history.test.js docs/interactive-demo/server.test.js docs/interactive-demo/state-model.test.js docs/interactive-demo/state-diff.test.js
node --check docs/interactive-demo/feedback-questions.js
node --check docs/interactive-demo/feedback.js
node --check docs/interactive-demo/event-catalog.js
node --check docs/interactive-demo/prediction-model.js
node --check docs/interactive-demo/protocol.js
node --check docs/interactive-demo/run-history.js
node --check docs/interactive-demo/state-model.js
node --check docs/interactive-demo/state-diff.js
node --check docs/interactive-demo/server.js
node --check docs/interactive-demo/app.js
```
