# 三方教学实验环境比较：MIT xv6、rCore/LearningOS 与本项目

## 1. 比较目的与范围

本文件用于回答三个问题：

1. 学校现有 MIT xv6 实验平台已经提供了什么；
2. 赛题参考资料中的 rCore Tutorial / LearningOS 教学环境提供了什么；
3. 本项目在两类成熟教学环境基础上增加了什么，仍有哪些边界。

三方不是用同一种语言实现的同一份内核，也不适合只用代码量或实验数量排名。本比较采用同一组教学指标：知识覆盖、实验组织、运行环境、测试反馈、过程可观察性、学生反思、教师验收、反馈闭环、智能辅助和工程边界。

比较基线日期为 2026 年 8 月 14 日。本项目基线为 GitLab `main @ cb891bb`，GitLab 与 GitHub 均有 19 个对应分支；`agent-mvp` 在两端均指向 `d46cbba`。

### 1.1 研究方法与当前条件限制

当前三方比较采用定性研究方法，主要证据来自 MIT xv6、rCore/LearningOS 的公开课程资料、实验说明和测试方式，以及本项目仓库中可以复核的代码、文档、分支、运行事件和测试记录。比较重点是三类环境在教学内容、实验组织、过程可观察性、反馈方式和工程边界上的差异，不对三方教学效果作分数排名。

受现阶段时间、设备、课程安排和参与者组织条件限制，项目组暂时无法让同一批学生在相同知识点、相同实验任务、相同时间限制和统一评价标准下分别完成三套环境，也无法取得足够规模且背景一致的三方样本。因此，目前不具备开展受控三方定量研究的条件。项目已经收集的教学评价可以用于改进本项目，但不能直接替代三套环境的同条件对照数据。

在条件允许后，可选择 Trap、虚拟内存和调度等共同知识点，统一记录环境准备时间、实验完成时间、测试尝试次数、求助次数、前后测变化和主观学习负担，再补充三方定量比较。现阶段报告只呈现能够由公开资料和项目证据支持的定性结论，并明确区分已验证事实、项目特点与后续研究计划。

## 2. 三方对象

### 2.1 学校平台：MIT xv6-riscv

学校实验使用 MIT xv6 平台。xv6 是用 ANSI C 编写、面向 RISC-V 多处理器的 Unix V6 风格教学操作系统，MIT 6.1810 通过扩展 xv6 讲授虚拟内存、文件系统、线程、上下文切换、中断、系统调用、进程间通信和软硬件交互。

公开入口：

- MIT xv6-riscv：https://github.com/mit-pdos/xv6-riscv
- MIT 6.1810 课程说明：https://pdos.csail.mit.edu/6.1810/2025/overview.html
- MIT Lab Guidance：https://pdos.csail.mit.edu/6.1810/2025/labs/guidance.html

### 2.2 赛题参考环境：rCore Tutorial / LearningOS

项目仓库的参考资料指向 rCore Tutorial Book、rCore Tutorial Code、rCore Tutorial Guide 和 LearningOS 课程资源。2025S 教学代码使用 Rust、RISC-V 和 QEMU，按 `ch1` 到 `ch9` 组织；公开评分流程为章节 3、4、5、6、8 配置 checker 与测试仓库，正好形成五个可复核的重点练习。

本项目已在固定上游 `d6330a6` 的隔离参考仓库中逐章完成这五个练习，最终参考提交为 `412a27e`。每章均保留未实现基线、实现差异、最终 QEMU 测试、补丁和本地提交；完整证据见 [tg-rCore 五个基础实验练习总结报告](reference-labs/tg-rcore-five-basic-experiments.md)。参考实现没有混入本项目内核，两部分不能按测例数量直接比较。

五个重点练习为：

- Chapter 3：多道程序与分时多任务；
- Chapter 4：地址空间与 Sv39；
- Chapter 5：进程及进程管理；
- Chapter 6：文件系统与 I/O 重定向；
- Chapter 8：并发、锁、信号量和条件变量。

公开入口：

- rCore Tutorial Code 2025S：https://github.com/LearningOS/rCore-Tutorial-Code-2025S
- rCore Tutorial Guide 2025S：https://learningos.cn/rCore-Tutorial-Guide-2025S/
- rCore Tutorial Book v3：https://rcore-os.cn/rCore-Tutorial-Book-v3/

### 2.3 本项目：AI 合作的操作系统教学实验环境

本项目使用 Rust 编写 `no_std`/`no_main` 教学内核，运行于 RISC-V 64、QEMU `virt` 和 OpenSBI。P0 负责最小工程基线，Lab1-Lab7 依次覆盖启动与 SBI 控制台、Trap、物理内存、Sv39、协作式调度、用户态与系统调用、设备抽象与简化文件系统。

项目在内核实验之外增加了统一事件协议、知识地图、结构化预测、时间线回放、starter/solution 状态差异、确定性诊断、课堂演示、教学评价、运行记录提交、教师本地评分和受限教学智能体。

## 3. 知识点映射

| OS 知识方向 | MIT xv6 | rCore/LearningOS | 本项目 |
|---|---|---|---|
| 启动与特权级 | RISC-V 启动、内核初始化、用户/内核转换 | Ch1-Ch2 裸机环境、批处理、特权级切换 | P0、Lab1、Lab2；OpenSBI、SBI console、Trap |
| 物理内存 | `kalloc`/`kfree`、页表相关实验 | Ch4 地址空间中的页帧与页表管理 | Lab3 独立讲页帧分配与回收 |
| 虚拟内存 | page table、COW、mmap 等扩展实验 | Ch4 Sv39、内核与应用地址空间 | Lab4 页表映射、PTE、satp |
| 调度与进程 | 多进程、上下文切换、sleep/wakeup、线程 | Ch3 分时多任务，Ch5 进程管理 | Lab5 单核内核态协作式调度 |
| 用户态与系统调用 | 完整用户程序、系统调用、trap/trampoline | Ch2-Ch5 逐步形成用户态与进程接口 | Lab6 最小用户态、ecall、系统调用与返回 |
| 文件系统 | inode、日志、buffer cache、设备与文件系统实验 | Ch6 easy-fs、文件描述符和 I/O 重定向 | Lab7 内存设备和教学版内存文件系统 |
| 并发与同步 | 多核、锁、并发与 lock lab | Ch8 线程、锁、信号量、条件变量 | 当前正式 Lab 未覆盖抢占、多核和同步原语 |
| 设备与网络 | UART、virtio disk、E1000/network lab | 后续章节覆盖设备与相关扩展 | Lab7 只做内存设备抽象，不含 virtio-block 和网络 |

结论：三方核心知识链高度重合，但深度侧重点不同。xv6 更接近完整 Unix 教学内核，rCore 更强调用 Rust 从零构建内核，本项目把核心机制压缩为七个中等难度 Lab，并重点补上“运行证据如何转化为学习过程”。

## 4. 同维度比较

| 维度 | MIT xv6 | rCore/LearningOS | 本项目 |
|---|---|---|---|
| 主要语言 | ANSI C + RISC-V 汇编 | Rust + RISC-V 汇编 | Rust + RISC-V 汇编 |
| 目标平台 | RISC-V，多处理器，QEMU | RISC-V，QEMU；教程还介绍其他运行环境 | RISC-V 64，QEMU `virt` + OpenSBI，当前为单核教学边界 |
| 教学方式 | 在成熟 xv6 基线上增量实现系统功能 | 按章节从裸机逐步构建类 Unix 内核 | P0 基线 + Lab1-Lab7；starter/solution 成对发布 |
| 任务难度组织 | Easy、Moderate、Hard；通常为几十到数百行但概念复杂 | 章节正文、练习、测试仓库和 checker | 每个 Lab 约 3 个 Stage，配 TASKS/HINTS/TESTING/SOLUTION/TEACHER_GUIDE |
| 测试反馈 | `make grade`、课程自动评测、Gradescope | `make run`；`make test CHAPTER=$ID` | 主机单测、QEMU marker、Stage 1/2/3、starter `-ExpectIncomplete`、Node 测试 |
| 源码阅读支持 | xv6 Book、课程讲义、GDB、asm、addr2line | 中文 Guide、详细 Book、分章 API 文档 | Markdown 实验包、知识地图、事件对应代码路径与函数符号 |
| 运行过程可视化 | 主要依靠 console、GDB、QEMU monitor 和测试输出 | 主要依靠章节文档、日志、调试和 API 文档 | 真实 QEMU 事件驱动的知识地图、时间线、状态模型和因果解释 |
| 预测与反思 | 由课程问题、实验答案和调试过程承担 | 由章节练习、报告和测试承担 | 运行前结构化预测；运行后自动对照，不评分不排名 |
| 分支差异学习 | 每个 lab 使用对应 Git 分支，学生自行查看代码差异 | `ch1`-`ch9` 章节分支 | 同一 Lab 的 starter/solution 运行记录做事件和系统状态差异比较 |
| 运行记录迁移 | 课程提交包、Git 和 Gradescope | Git、测试日志和 checker | `os-demo.run/v1` JSON/Markdown，本地导入、回放和比较 |
| 错误诊断 | print、GDB、测试失败和课程指导 | 编译/运行日志、章节指导和 checker | 确定性规则诊断；证据不足时不猜测；starter TODO 不报错 |
| 教师验收 | 成熟课程题目、自动评测和人工答疑 | checker、测试仓库和教学文档 | 七套本地 100 分量表；运行证据只建议客观状态，最终人工确认 |
| 教学反馈 | 依赖课程平台、教师、助教和问卷 | 依赖课程组织、Issue 或其他教学渠道 | 页面内分支针对性评价、异地自愿提交、本机管理与导出 |
| 智能辅助 | 平台本身不内置模型 | 参考环境本身不内置模型 | 本地规则诊断 + 可选 Agent Plan；六个白名单工具和首次数据同意 |
| 数据边界 | 取决于学校课程平台 | 取决于教学部署和测试平台 | 本地、主动提交、云端智能体、本地评分四条链路明确分离 |

## 5. 可核验的项目数据

以下数字只描述本项目当前仓库快照，不用来简单证明教学质量：

| 项目事实 | 当前值 | 证据 |
|---|---:|---|
| 远端对应分支 | 19 | `main`、`agent-mvp`、P0、可视化、教师工具、Lab1-Lab7 starter/solution |
| 正式教学实验 | 7 | `docs/labs/README.md` |
| rCore 参考基础实验 | 5 | Chapter 3、4、5、6、8 的独立总结、日志、截图与补丁 |
| 教学分支上下文映射 | 17 | `main`、可视化、P0、14 个 Lab 分支 |
| Rust/汇编/链接脚本文件 | 19 | `kernel/` |
| 内核相关代码行 | 3289 | 当前快照文本行统计 |
| JavaScript 文件 | 67 | `docs/` 与 `scripts/` |
| Markdown 文档 | 72 | 仓库当前快照 |
| Lab 教学 Markdown | 50 | `docs/labs/` |
| Node 测试文件 | 31 | 仓库全部 `*.test.js` |
| 本轮 Node 测试 | 585 项；579 通过、0 失败、6 跳过 | 本轮独立执行结果 |

仓库验收报告还记录了 fmt、RISC-V 构建、Clippy、46 项主机测试、P0 QEMU、Lab1-Lab7 solution Stage 以及 starter 预期不完整测试。上述 Rust/QEMU 记录属于仓库验收证据；在答辩前仍应在最终 Ubuntu 环境重新保存一次命令输出。

## 6. 三方优势与不足

### 6.1 MIT xv6

优势：

- 课程历史长，教材、实验、测试和调试方法成熟；
- 内核规模适中但包含多进程、多核、锁、文件系统和设备等完整机制；
- 与经典 Unix 设计联系直接，适合深入理解真实内核结构。

不足或使用门槛：

- C 指针、内存安全和跨文件调用链对初学者调试要求较高；
- 学习过程主要通过源码、console、GDB 和测试反馈观察；
- 平台本身没有把事件、代码、知识点和状态变化统一成可回放页面。

### 6.2 rCore/LearningOS

优势：

- 使用 Rust 和 RISC-V，符合现代系统编程与赛题技术方向；
- 从裸机到类 Unix 内核的章节路径完整，中文 Guide、详细 Book 和 API 文档丰富；
- 2025S 提供代码、测试与 checker，五个重点章节可以重复验收。

不足或使用门槛：

- 学生需要同时掌握 Rust、Cargo、RISC-V、Linux 工具和内核机制；
- 完整章节体系较长，面向短周期本科实验时需要重新裁剪；
- 运行结果仍主要通过日志、调试和 checker 理解，没有本项目这种统一事件回放与教学评价链路。

### 6.3 本项目

优势：

- 保留 Rust/RISC-V 路线，将学习内容压缩为 P0 + 七个递进 Lab；
- starter/solution、三阶段任务、分级提示、自动测试和教师指南形成完整课程包；
- 以 `os-demo.event/v1` 把真实运行事件、代码符号、知识点、状态变化和因果关系连接起来；
- 提供预测、回放、状态差异、规则诊断和演示模式；
- 教学评价、运行记录自愿提交、教师本地评分和受限教学智能体形成可选择的教学闭环；
- 未登记事件、损坏记录和证据不足均安全降级，不为了展示完整而编造内核状态。

当前边界：

- Lab5 只有单核协作式调度，不含抢占、多核和优先级；
- Lab6 不含 ELF、多进程地址空间和完整用户指针检查；
- Lab7 不含 virtio-block、真实磁盘、复杂路径和工业级文件系统；
- 正式 Lab 尚未覆盖 rCore Ch8 或 xv6 lock lab 的完整并发同步；
- AI 教学助教真实在线验收、GitLab CI 结果和全新 Ubuntu 全链路仍应在答辩前复核。

## 7. 三方比较结论

本项目不应表述为“替代 xv6 或 rCore”。更准确的定位是：

- xv6 提供成熟、完整、经典的 Unix 内核学习基线；
- rCore/LearningOS 提供 Rust + RISC-V 的现代从零构建路线；
- 本项目在 Rust/RISC-V 教学内核上增加面向本科生的证据化学习层，把一次实验变成可预测、可运行、可解释、可回放、可比较、可评价和可人工验收的过程。

因此，本项目的主要创新不在于比 xv6 或 rCore 实现更多内核功能，而在于降低“代码运行了但学生不知道为什么”的教学断层，并把学生、教师和项目负责人之间的反馈与证据连接起来。

## 8. 非本队来源、借鉴与增量工作说明

### 8.1 借鉴内容

- 借鉴 MIT xv6 的小型 Unix 教学内核思想、实验增量开发方式和“阅读源码—修改机制—自动测试”的课程组织；
- 借鉴 rCore/LearningOS 的 Rust/RISC-V 技术路线、章节知识顺序和从裸机逐步建立类 Unix 内核的教学思想；
- 使用公开的 Rust 工具链、RISC-V 目标、QEMU 和 OpenSBI 作为开发运行环境。

### 8.2 未直接复用的内容

- 当前 `kernel` crate 没有第三方 Rust crate 依赖；
- 仓库声明没有直接复制 xv6 的 C 源码或 rCore 的 Rust 实现；
- 本项目的 P0、Lab1-Lab7、事件协议、可视化、反馈、评分和智能体集成均在本项目仓库中组织和验证。

答辩时仍应保留 xv6、rCore/LearningOS、QEMU、OpenSBI 和 Rust 等来源链接，不把“没有复制源码”表述成“没有参考公开资料”。

### 8.3 本队增量工作

- 自主组织 P0 + Lab1-Lab7 的 Rust 教学内核和 19 分支发布体系；
- 为每个 Lab 提供 starter/solution、Stage、任务、提示、测试、解法说明和教师指南；
- 设计 `os-demo.event/v1`、`os-demo.run/v1` 及相关本地安全校验；
- 实现事件—代码—知识点—状态—因果关系联动；
- 实现结构化预测、完整时间线、回放、starter/solution 状态比较和规则诊断；
- 实现课堂演示、教学评价、异地自愿反馈、运行记录提交和本地教师评分；
- 实现受限教学智能体协议、白名单工具、同意机制和四层数据边界。

## 9. 证据来源

- 本项目 `README.md`、`DESIGN.md`、`docs/requirements.md`、`docs/final-acceptance-report.md`；
- 本项目 `docs/labs/`、`docs/interactive-demo/`、`docs/teacher-grading/`、`docs/feedback-admin/` 和 `docs/teaching-agent.md`；
- MIT xv6-riscv 与 MIT 6.1810 官方课程页面；
- rCore Tutorial Code 2025S、rCore Tutorial Guide 2025S 和 rCore Tutorial Book v3。
