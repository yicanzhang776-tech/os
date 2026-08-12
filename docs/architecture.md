# 系统架构

本文档描述当前 P0-Lab7 的实际架构和教学边界。实现目标不是工业级通用内核，而是适合本科生循序渐进理解操作系统核心机制的实验环境。

## 教学智能体链路

```mermaid
flowchart LR
    S["学生：明确同意并手动提问"] --> API["本地 /api/agent"]
    API --> LOOP["受限 Agent 循环"]
    LOOP --> ARK["火山方舟 Agent Plan\nark-code-latest"]
    ARK --> LOOP
    LOOP --> T["六个白名单工具"]
    T --> C["上下文 / 受限源码 / 差异\nQEMU 事件 / 运行结果 / 批准测试"]
    C --> T
    LOOP --> API --> S
```

首轮请求包含服务端固定教学引导和工具定义；工具续轮只发送 `previous_response_id` 与匹配的 `function_call_output`。分支或提交变化会使旧请求失败，交互运行和智能体测试共用任务锁。

## 四条数据链路

```mermaid
flowchart TB
    K["内核遥测 → QEMU 串口 → 本地桥接 → WebSocket"] --> L["浏览器预测 / 回放 / 规则诊断 / 分支比较"]
    L -->|"主动预览并同意"| F["HTTPS / 8890 → 本机 JSONL → 8891 管理"]
    L -->|"首次模型数据同意"| A["/api/agent → 方舟；仅受限证据"]
    L -->|"导出 os-demo.run/v1"| G["本地教师评分；人工确认"]
    A -. "回答不自动计分" .-> G
    F -. "反馈不等同成绩" .-> G
```

API Key 只存在服务端环境变量；浏览器上下文只获得是否配置、提供方、模型和协议版本。评分页面不联网，姓名、成绩和评语公开分享前必须人工脱敏。

## 当前总体状态

当前仓库已经具备：

- Rust workspace 和 `kernel` crate。
- RISC-V 64 裸机目标配置。
- QEMU `virt` + OpenSBI 启动链路。
- P0 最小启动基线。
- Lab1-Lab7 的 starter/solution 本地分支。
- 主机单元测试、PowerShell QEMU 测试脚本和 Linux CI QEMU 脚本。

## 模块关系

```mermaid
flowchart TD
    boot["boot / entry"] --> sbi["sbi"]
    boot --> console["console"]
    console --> sbi
    boot --> trap["trap"]
    boot --> memory["memory"]
    trap --> syscall["syscall"]
    memory --> task["task"]
    memory --> user["user mapping"]
    task --> user["user"]
    syscall --> user
    syscall --> fs["fs"]
    fs --> drivers["drivers"]
    testing["testing"] --> boot
    testing --> trap
    testing --> memory
    testing --> task
    testing --> syscall
    testing --> fs
```

## 阶段模块边界

| 阶段 | 模块 | 当前状态 |
|---|---|---|
| P0 | `boot`、`sbi`、`console`、`testing` | 已建立最小可运行基线 |
| Lab1 | `boot`、`sbi`、`console` | 已建立 starter/solution，聚焦启动与控制台 |
| Lab2 | `trap` | 已建立 starter/solution，处理 breakpoint 异常 |
| Lab3 | `memory` 物理页分配 | 已建立 starter/solution，包含地址类型和 frame allocator |
| Lab4 | `memory` Sv39 页表 | 已建立 starter/solution，采用恒等映射并启用 `satp` |
| Lab5 | `task` | 已建立 starter/solution，单核内核态协作式调度 |
| Lab6 | `syscall`、`user` | 已建立 starter/solution，最小 U-mode 程序与系统调用 |
| Lab7 | `drivers`、`fs` | 已建立 starter/solution，教学版内存文件系统 |

## 关键设计选择

- 内核加载地址沿用 QEMU/OpenSBI 进入地址和链接脚本配置，避免提前引入高地址内核映射。
- Lab4 第一版采用恒等映射，但按 `.text`、`.rodata`、`.data/.bss`、用户页设置不同权限。
- Lab5 使用固定任务数和静态任务栈，只保存 `ra`、`sp`、`s0..s11`，适用于单 hart 协作式切换。
- Lab6 使用内置用户程序，不做 ELF 加载，系统调用覆盖教学所需的最小路径。
- Lab7 使用固定容量内存设备和简化 fd 表，重点解释设备抽象、文件描述符和系统调用路径。

## 教学边界

以下内容不属于当前基础实验必做范围：

- 抢占式调度、多核调度和复杂优先级策略。
- 高地址内核映射、完整地址空间隔离和进程模型。
- ELF 加载、动态用户程序、多进程和复杂用户指针校验。
- virtio-block、真实磁盘文件系统、目录树和路径解析。

这些内容可作为答辩扩展、思考题或后续课程项目。

## 可视化与运行证据架构

可视化不是预先录制的动画。内核把少量结构化教学事件写入与普通日志相同的 SBI 串口，本地桥接器只在使用者明确启动运行后构建内核并启动 QEMU，再把事件发送到浏览器：

```mermaid
flowchart LR
    K["Rust 教学内核 / telemetry.rs"] --> S["SBI 串口与稳定 marker"]
    S --> Q["QEMU/OpenSBI"]
    Q --> B["本地 Node 桥接器"]
    B -->|"os-demo.event/v1 / WebSocket"| W["浏览器学习地图"]
    W --> P["预测对照与本地规则诊断"]
    W --> R["时间线、回放与分支差异"]
    R --> E["导出 os-demo.run/v1"]
```

浏览器状态由当前位置之前的完整原始事件序列重建。筛选只改变显示，不改变运行记录和状态计算。诊断使用固定、本地、可测试的规则，只指出有证据支持的现象和可能原因，不调用 AI 模型或网络服务。

## 双层评价与证据流

```mermaid
flowchart LR
    L["学生完成实验"] --> F["教学反馈：主观学习体验"]
    L --> D["Demo 真实运行记录"]
    D --> J["os-demo.run/v1"]
    J --> G["教师评分工具"]
    G --> A["构建/QEMU 客观建议"]
    G --> H["代码审查、口试与人工评分"]
    H --> O["os-teacher-grading/v1 / Markdown / 打印"]
```

教学反馈不计算成绩。评分工具不会执行学生代码，也不会因导入 PASS 自动增加分数；最终结论始终由教师结合代码、实验说明和口试确认。
