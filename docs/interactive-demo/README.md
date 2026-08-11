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
- 回放时间线支持状态、来源、Lab、步骤和关键词筛选，以及播放、变速、单步、失败/差异跳转、耗时统计和键盘操作；
- 对同一 Lab 已保存的 starter/solution 运行同时进行事件序列与系统状态差异比较；
- 使用 `lab + step` 稳定键把运行事件关联到代码文件、函数或符号、OS 知识点、前因、状态变化和后续事件；
- 点击实时或回放时间线事件时显示完整解释，并同步高亮知识地图中的对应节点；
- 包含“有帮助、没有变化、没有帮助、更加困惑”的教学效果评价；
- 根据 P0、Lab1–Lab7 和 starter/solution 分支自动切换五道针对实验内容的教学评价题；
- 评价草稿保存在当前浏览器，并可导出 Markdown 或 JSON；
- 通过 `os-demo.feedback.submit/v1` 将评价主动发送到项目负责人提供的 HTTPS 地址，失败时继续保留本机草稿和离线导出。

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

## 演示模式（课堂与答辩）

演示模式用于在投影屏幕上集中讲解知识地图、运行时间线、事件解释、系统状态和 starter/solution 差异。它会放大这些核心区域，并隐藏教学评价表、开发调试信息和次要控制；退出后会恢复普通页面布局，普通模式的实验、回放和评价功能不受影响。

Ubuntu/Linux 中先启动本地服务，但不要让脚本自动运行 QEMU：

```sh
sh scripts/run-interactive-demo.sh
```

不要为演示启动命令添加 `--run`。服务启动后，可以通过普通页面的“进入演示模式”按钮切换，也可以直接打开：

- 通用入口：<http://127.0.0.1:8888/?mode=presentation>
- Lab1（控制台与 SBI）：<http://127.0.0.1:8888/?mode=presentation&lab=lab1>
- Lab2（Trap 与异常）：<http://127.0.0.1:8888/?mode=presentation&lab=lab2>
- Lab4（Sv39 页表）：<http://127.0.0.1:8888/?mode=presentation&lab=lab4>
- Lab5（任务调度）：<http://127.0.0.1:8888/?mode=presentation&lab=lab5>

工具栏支持全屏、退出演示和一键重置。需要讲解已有实验过程时，可以在演示模式中选择或导入本地 `os-demo.run/v1` 运行记录，再使用播放、暂停、四档速度、上一步、下一步、失败/差异跳转以及空格、方向键、Home/End、F、D、`/`、Esc 等原有键盘操作。导入仍只由浏览器本地读取，不会上传文件。

进入演示模式只调整当前页面的显示状态，不会自动启动 QEMU，也不会自动执行 `git switch`。若要进行真实实验，使用者必须先退出演示模式，再检查当前分支并明确点击运行按钮确认。演示专用 session 只保存本次浏览器会话中的 Lab、知识维度、运行记录编号和回放位置；“重置演示状态”只恢复演示视图，不删除本机保存的运行记录、预测或教学反馈，也不向外部服务发送代码、事件和终端日志。

## 教学评价使用方式

1. 完成或体验一个实验后，在页面底部先填写学习背景和使用前后理解程度。
2. 页面根据当前分支显示五道教学评价题。题目会涉及该实验的真实知识点，但评价的是讲解是否清晰、任务难度是否合适、提示和可视化是否有帮助、运行反馈是否有效，不要求填写知识答案。
3. 五道题必须全部选择 1–5 分，1 分表示负面评价，5 分表示正面评价。starter 的第 5 题关注 TODO、Stage 和提示，solution 的第 5 题关注参考实现及说明。
4. 五道教学评价题后可以继续填写最有帮助的内容、仍然困惑的内容和改进建议。
5. 页面自动显示当前分支、Lab、提交编号和运行状态；不愿附带时可以取消勾选。
6. 临时填写可点“保存本机草稿”，无需登录，也不需要网络。
7. 填写项目负责人提供的 HTTPS“反馈服务地址”，需要时再填写课堂邀请码。地址和邀请码只保存在当前浏览器，邀请码不会写入导出的评价记录。
8. 点击“提交教学评价”。成功后页面显示回执编号和接收时间；同一条评价重试会复用原 `feedback.id`，不会重复写入。
9. 如果网络不可用，保留本机草稿并导出 Markdown 或 JSON，等服务恢复后再提交。

页面只有在使用者主动点击提交后，才会将 `schemaVersion: 2` 教学评价装入 `os-demo.feedback.submit/v1` 请求发送到所填地址。它不会打开 GitLab Issue，也不会上传实验代码、源文件、完整终端日志、QEMU 输出、浏览器 Cookie、邀请码或访问令牌。前端与接收端都会过滤常见本机用户目录、令牌和危险 HTML。

### 学生自愿提交一次运行记录

保存一次实验运行后，可以在“完整时间线与分支差异”下方选择这条本机记录。页面会先预览 Lab、starter/solution 角色、分支、提交短编号、起止时间、时长、事件数量、最终结果、预测和预测对照，并分别列出“将发送”和“不会发送”的内容。取消选择时不发送任何数据；回放、导入、刷新或关闭页面也不会自动提交。

只有勾选“我已查看以上内容，并同意将这一次脱敏运行记录发送给项目负责人，用于教学改进。”后，“提交本次运行记录”按钮才可使用。运行记录复用教学评价中的反馈服务地址和邀请码，不要求第二套配置。已经提交过教学评价并取得回执时，可以只用 `feedbackId` 关联两类记录；两种提交仍互相独立，不需要先填写评价，也不会据此推断学生身份。

发送封装使用 `os-demo.run.submit/v1`，内部运行记录保持 `os-demo.run/v1`，事件保持 `os-demo.event/v1`。单次最多 512 个事件，脱敏后的请求最大 512 KiB。发送字段只包含运行标识、分支与提交、Lab 与角色、时间、预测、结构化事件、最终结果和预测对照；不发送源代码、文件内容、命令行、环境变量、完整终端/串口/stdout/stderr 日志、Cookie、访问令牌、密码和本地用户目录。预测依据、事件说明和错误文字会再次去除危险 HTML、令牌和绝对用户路径。

网络失败后可以重新选择并提交同一 `runId`。服务端对相同 `runId` 和相同内容返回原回执，不重复写入；相同 `runId` 但内容不同则返回冲突并保留原记录。当前功能没有后台队列、批量提交、自动监控或自动评分。

## 项目负责人启动异地反馈

在 Ubuntu/Linux 项目根目录启动只监听本机的接收服务：

```sh
node scripts/feedback-server.js \
  --host 127.0.0.1 \
  --port 8890 \
  --data ./feedback-data \
  --invite-code classroom-demo
curl http://127.0.0.1:8890/health
```

每条评价以一行 JSON 保存在 `feedback-data/feedback.jsonl`，学生自愿提交的脱敏运行记录则单独保存在 `feedback-data/runs.jsonl`。两类文件互不覆盖，该目录已被 Git 忽略，不应提交到仓库。课堂异地测试时，在另一个终端仅公开 8890：

```sh
cloudflared tunnel --url http://127.0.0.1:8890
```

把生成的 `https://随机地址.trycloudflare.com` 发给学生填写。不要通过隧道公开 8888、8891、SSH、Git 或虚拟机其他端口；Cloudflare Quick Tunnel 地址会变化，只适合课堂测试和项目演示，不适合作为长期服务。若隧道域名需要跨域访问，在接收服务启动命令末尾补充明确来源，例如 `--allow-origin https://课程页面.example`，不能使用通配来源。

项目负责人在本机另开终端启动查看页：

```sh
node scripts/feedback-admin-server.js --port 8891 --data ./feedback-data
```

然后只在项目负责人电脑打开 <http://127.0.0.1:8891>。教学评价区域可按 Lab、starter/solution 和使用者身份筛选，查看五道评价题的平均值与分布、阅读文字建议，并导出 JSON、CSV 或 Markdown。运行记录区域可按 Lab、starter/solution 和最终结果筛选，查看运行编号、提交短编号、时长、事件数量、最终结果、预测对照和可选关联评价，并用事件知识目录显示“事件名称—知识点—状态—时间—相邻耗时”的脱敏时间线；它也支持 JSON、CSV 摘要和 Markdown 运行总结导出。8891 强制监听 `127.0.0.1`，不得放入公网隧道。

三个端口用途互相独立：8888 是学生可视化页面，8890 是可通过 HTTPS 临时隧道访问的评价接收接口，8891 是项目负责人本机查看页。邀请码只提供课堂演示级保护，不是完整账号认证。

## 目前不足

- 草稿只保存在当前浏览器，清理浏览器数据或更换电脑后不会自动同步；
- 项目负责人的 Ubuntu 虚拟机、8890 接收服务和临时隧道必须保持在线，否则学生只能保存草稿或离线导出；
- Quick Tunnel 地址会变化，目前没有长期稳定域名；
- 邀请码不是完整账号认证，JSONL 也只适合小规模课堂测试，不适合大量并发；
- 运行记录必须由学生逐条选择和同意，目前没有后台队列、断点续传或批量收集；超过 512 个事件或 512 KiB 的记录不会提交；
- `feedbackId` 只用于可选关联，系统没有统一账号，不能据此确认或推断提交者身份；
- 本机查看页只提供基础筛选、平均值、分布和导出，没有复杂班级管理、账号权限与统计分析；
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
- 在有稳定服务器和维护人员后，使用固定域名和正式 Cloudflare Tunnel，并将 JSONL 迁移到 SQLite；
- 逐步增加数据备份与恢复、匿名标识、正式权限管理以及更完善的教师筛选和统计；
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

`state-diff.js` 计算同一 Lab 的 starter 与 solution 最终状态，并把结果分为相同、发生变化、只在 starter 有证据、只在 solution 有证据和双方证据不足五类；原有事件序列比较继续保留。双方都没有证据的字段不会被误列为“相同”。TODO 会明确保持未完成，单独出现的 PASS 也不会被直接判断为完成，必须同时存在对应 Lab 的真实过程事件。

现有事件没有携带精确数值时，页面统一显示“没有足够运行证据”或说明仅能确定变化方向。例如目前不能可靠给出页帧精确数量、satp 数值、系统调用号与参数、fd 编号、文件偏移和文件大小。后续若要显示这些值，应由内核新增兼容 `os-demo.event/v1` 的结构化证据，而不能根据动画猜测。

保存运行时只接受带有明确 `os-demo.event/v1` 协议、合法 Lab、步骤和状态的事件，不会替缺少协议的历史数据补写版本号。读取 localStorage 时会重新校验事件和预测上下文，并根据有效证据重新计算预测对照；损坏的运行记录会被忽略，损坏的旧对照结果不会直接进入页面。

### 运行记录导入与导出

逐步回放区域支持把已保存或刚完成的运行导出为 JSON，也可以生成便于提交和阅读的 Markdown 运行总结。JSON 使用稳定格式 `os-demo.run/v1`，包含格式版本、`os-demo.event/v1` 协议、运行 ID、分支、提交、Lab、starter/solution 角色、起止时间、学生预测、结构化事件、最终结果和预测对照结果。导入后的记录进入原有本机运行历史，因此可以直接回放，也能参与同一 Lab 的 starter/solution 事件与系统状态比较。

导入只调用浏览器的本地文件读取接口，不会把文件发送给桥接器或外部服务器，也不会执行文件中的脚本、命令或 HTML。页面在读取前检查 1 MiB 文件大小上限，解析后检查 `schemaVersion`、事件协议、Lab、角色、状态、时间和最多 512 个事件。用户名路径、常见访问令牌、控制字符和 HTML 标签会被清洗；文件提供的最终结论不会被直接信任，页面会根据有效事件重新建立运行记录并重新计算预测对照。

如果本机已经存在相同 `runId`，页面会询问是覆盖本机记录，还是为导入记录生成一个新 ID。两种处理都只影响当前浏览器的 localStorage，不会切换工作区 Git 分支。未知 `os-demo.run` 版本、未知事件协议、损坏 JSON 或超出限制的文件会显示明确错误，并且不会加入运行历史。

### 时间线筛选与回放控制

载入已保存或导入的运行后，可以按事件状态、事件来源、Lab、步骤和关键词筛选时间线。筛选结果保留每条事件在完整运行中的原始序号，只改变列表显示与上一步/下一步的导航目标，不会删除、排序、修改 `run.events`，也不会写回 localStorage。即使当前位置被筛选隐藏，页面仍保留当前位置，并明确提示系统状态继续按完整事件序列计算。

播放器提供播放和暂停，以及 0.5、1、2、4 倍速度。上一步、下一步在当前可见事件之间移动；“第一个失败事件”只定位真实 `status=fail`、`fail` 或 `panic` 证据，没有证据时不会根据最终结果猜测事件；“第一个分支差异”使用右侧当前选择的 starter/solution 运行，并按当前回放侧的原始事件索引定位最早差异。每条事件显示它与前一条原始事件的时间间隔，因此隐藏中间事件不会改变耗时含义。摘要区显示运行总时长、原始事件数、当前显示数和运行中断状态。

回放到原始索引 `i` 时，页面始终使用完整的 `events[0..i]` 重建知识节点、动态结构和教学状态，而不是只重放筛选后的事件。这样在筛选、快速连续操作或播放过程中切换筛选条件时，隐藏的 Trap、页表、任务或系统调用事件仍会正确影响后续状态。运行中断时保留已收到的事件；刷新页面后可以从本机运行历史重新载入，播放器默认保持暂停。

键盘快捷键为：空格播放/暂停，左右方向键上一步/下一步，Home/End 跳到第一/最后一个可见事件，F 跳到首个失败事件，D 跳到首个分支差异，`/` 聚焦关键词搜索，Esc 暂停。除 Esc 可随时暂停外，焦点位于输入框、下拉框、按钮、链接或可编辑区域时，不抢占其原有按键行为。

### 本地确定性规则诊断

`diagnostics.js` 只在当前浏览器中执行固定规则，不使用 AI 模型、智能体、网络 API 或外部服务。输入限定为当前 Lab、starter/solution 角色、构建结果、经过校验的 `os-demo.event/v1` 事件、经过净化和长度限制的稳定输出以及最终运行状态。规则覆盖 Cargo 构建失败、缺少 RISC-V target、QEMU 不存在、starter TODO、QEMU 超时，以及 Lab2-Lab7 的 Trap 重复、`sepc` 未推进、`satp` 激活后异常、页帧不足、调度未切换、用户态 `ecall` 未进入系统调用和文件打开或读写失败。

每条结果列出触发证据、可能原因、建议检查的仓库文件或函数、对应实验文档以及是否能够确定。“能确定”只表示规则观察到的触发现象具有直接证据，不表示已经确定根因；根因始终作为可能原因展示。缺少证据时规则不生成结论，starter 正常停在 TODO 只作为教学提示，不作为错误。

运行历史最多保留 60 条与诊断有关且经过净化的稳定输出，不保存完整终端日志，也不保存可直接信任的诊断结论。实时运行、导入和历史回放均在加载时使用当前规则重新计算，因此规则更新后不会沿用旧结论，也不会上传串口、事件或代码。

## 接入已有 QEMU 命令

如果需要保留自己的 QEMU 参数，可将串口输出交给桥接器标准输入：

```powershell
qemu-system-riscv64 ... | node docs/interactive-demo/server.js --stdin
```

此时页面仍使用相同的分支识别、事件归一化和知识地图。

## 自动化检查

分支与串口协议使用 Node 内置测试，无第三方依赖：

```powershell
node --test docs/interactive-demo/diagnostics.test.js docs/interactive-demo/event-catalog.test.js docs/interactive-demo/feedback.test.js docs/interactive-demo/prediction-model.test.js docs/interactive-demo/presentation-mode.integration.test.js docs/interactive-demo/presentation-mode.test.js docs/interactive-demo/protocol.test.js docs/interactive-demo/run-history.test.js docs/interactive-demo/run-transfer.test.js docs/interactive-demo/server.test.js docs/interactive-demo/state-model.test.js docs/interactive-demo/state-diff.test.js docs/interactive-demo/timeline-controller.test.js
node --check docs/interactive-demo/feedback-questions.js
node --check docs/interactive-demo/feedback.js
node --check docs/interactive-demo/event-catalog.js
node --check docs/interactive-demo/prediction-model.js
node --check docs/interactive-demo/presentation-mode.js
node --check docs/interactive-demo/protocol.js
node --check docs/interactive-demo/run-history.js
node --check docs/interactive-demo/run-transfer.js
node --check docs/interactive-demo/state-model.js
node --check docs/interactive-demo/state-diff.js
node --check docs/interactive-demo/timeline-controller.js
node --check docs/interactive-demo/server.js
node --check docs/interactive-demo/app.js
node --check docs/interactive-demo/diagnostics.js
```
