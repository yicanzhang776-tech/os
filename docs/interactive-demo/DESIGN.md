# Interactive Demo Frontend Design

Lab Atlas 是交互式教学 Demo 的正式界面。它把 P0-Lab7 的课程递进、真实运行证据和 AI 引导组织在同一张可操作的实验图谱中。

## Shared Contract

- Surface mode: Operate，演示状态兼具 Read。
- 第一屏直接展示当前实验、分支、运行状态、Lab 导航和主操作，不使用营销 Hero。
- 运行、证据、解释和 AI 上下文必须互相可定位。
- 控件使用短动词；错误同时说明问题和恢复方式。
- 卡片仅用于独立工具或重复记录，不把每个页面区块包装成浮动卡片。
- 正文使用本地系统中文字体，代码、分支与测量值使用 Cascadia Code 等宽字体。

## Lab Atlas

- Thesis: 把实验链路变成可操作的课程图谱，而不是把深色调试台简单改成浅色。
- Palette: Paper `#f4f7f9`, Ink `#17212b`, Cobalt `#2457d6`, Marker `#e05a42`, Verified `#15836e`.
- Layout: 顶部横向 P0-Lab7 路径带、中央讲解舞台、下方证据轨道；AI 是可固定或展开的教学工作区。
- Signature: Lab 路径同时表达课程位置、真实证据状态和当前讲解焦点。
- Motion: 路径焦点切换采用短距离推进，避免整页元素统一淡入。
- Desktop layout: 顶部控制带、横向 Lab 路径、中央工作区；AI 默认收拢，展开后占据 `380px` 右栏。
- Responsive layout: `1180px` 以下 AI 改为浮层，`880px` 以下 Lab 路径允许横向滚动。桌面端是主要验收目标。
- Risk control: 浅色教学画布容易接近普通文档站，因此以路径拓扑和证据标记维持独特性。

## State And Compatibility

- 顶部保留学习/演示和实验台/证据/复盘控制，不再提供界面版本选择。
- 旧 URL 中的 `ui` 参数会在页面初始化时移除，`mode`、`lab`、hash 和其他参数保持不变。
- 旧 `os-demo.ui-variant.v1` 本地偏好会被清理；工作区偏好继续使用 `os-demo.workspace-view.v1`。
- 学习模式一次只展示一个任务工作区；演示模式可按讲解顺序展示全部工作区，并保持现有全屏、导入和焦点跳转能力。
- 未配置模型或网络不可用时，本地实验、诊断、回放与比较仍然完整可用。

## Focus Console

- Job: 为学生提供不受实验台密度限制的独立提问空间，同时保留返回当前实验的明确路径。
- Route: `/agent.html`，桌面端使用 `248px` 固定导航栏和不超过 `920px` 的居中对话列；主验证视口为 `1920×1080`、`1440×900`、`1024×768`。
- Palette: Ink `#101b25`, Paper `#f7f9fb`, Surface `#ffffff`, Action `#2457d6`, Tutor `#15836e`, Warning `#b87318`。
- Type: 界面正文使用 `Segoe UI Variable` / `Microsoft YaHei UI`，上下文、状态和计数使用 `Cascadia Code`。
- Hierarchy: 当前 Lab 与“单次独立回答”在顶部形成持续可见的上下文条；消息流承担阅读，底部粘性输入区承担唯一主操作。
- State: 支持空白、发送中、完成、失败、重试、复制、清空和未配置模型。错误必须同时说明问题与恢复动作，回答只能作为纯文本渲染。
- Privacy: 本次会话列表仅保存在 `sessionStorage` 中用于视觉回看。每次模型请求只包含当前问题，不携带此前消息，不把连续气泡描述成真正多轮对话。

## Kernel Buddy

- Signature: 小内核机器人是实验台唯一的角色化视觉，使用终端光标眼、芯片耳朵、蓝色外壳和琥珀运行灯对应本项目的系统实验语义。
- Entry: 点击桌宠先展开 `360px` 以内的迷你提问框；明确发送后先确认问题已写入 `sessionStorage`，再跳转 `/agent.html`。迷你控制器不得直接调用模型。
- Runtime states: `idle`、`running`、`error` 来自现有连接与运行状态证据；`open` 仅表示提问框展开并停止装饰动画，不覆盖后台保存的运行状态。
- Access: 触发器维护 `aria-controls` 和 `aria-expanded`；展开后聚焦输入框，Escape 与关闭按钮回到触发器，点击面板外关闭但不抢夺当前焦点。
- Motion: 空闲状态只做低幅呼吸，运行状态只改变克制光效；`open` 和 `prefers-reduced-motion` 下完全静止。
- Placement: 桌面端固定在右下角并避开滚动条与已展开的助教栏；演示模式隐藏。移动端仅保证基本可达，不作为本阶段主要布局目标。
