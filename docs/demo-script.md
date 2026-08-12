# 演示视频与答辩讲解脚本

本文档用于 5–8 分钟作品视频和现场答辩。演示必须使用真实分支、真实构建和真实 QEMU 证据，不使用固定动画代替运行结果。

## 最新现场路线

1. 识别当前 starter/solution 分支与 Lab，先保存结构化预测。
2. 真实构建并运行 QEMU，观察 `os-demo.event/v1` 时间线。
3. 使用本地确定性规则诊断解释“证据表明什么、尚不能判断什么”。
4. 演示者手动阅读首次数据告知、确认同意，并向 AI 教学助教发送准备好的问题；演示模式不自动提问。
5. 展示模型如何按需调用白名单工具取得上下文、事件、结果、受限源码或差异，并用真实证据验证回答。
6. 回放完整时间线并比较同一 Lab 的 starter/solution 状态差异。
7. 预览并自愿提交教学反馈或脱敏运行记录到负责人服务。
8. 教师将运行记录导入本地评分页，结合代码审查、口试、实验报告和人工确认完成验收。

现场不展示 API Key、Authorization、完整源码、个人目录、学生身份或真实成绩。智能体回答不作为标准答案、根因结论或自动评分依据。

## 1. 项目定位（约 40 秒）

- 2026 全国大学生计算机系统能力大赛，OS 功能挑战赛道第 20 题。
- Rust、RISC-V 64、QEMU `virt` 与 OpenSBI 组成真实教学内核。
- P0 是工程基线；Lab1-Lab7 是七个递进式正式实验。
- 项目价值是“真实机制 + 教学分支 + 分阶段验证 + 可视化学习 + 教师验收”。

展示：根 `README.md`、实验路线 Mermaid 图和正式 PPT。

## 2. 学生、教师和评委入口（约 40 秒）

- 学生使用 `labN-starter`，阅读 `TASKS/HINTS/TESTING`，不接触答案。
- 教师使用 `labN-solution` 的 `SOLUTION/TEACHER_GUIDE`。
- 评委从 `main` 查看完整文档、可视化、评分工具和答辩材料。
- `-Stage 1/2/3` 用于逐步验收；`-ExpectIncomplete` 只验证原始 starter 健康且未泄露答案。

## 3. 可视化真实学习闭环（约 2 分钟）

Ubuntu/Linux 推荐启动：

```sh
sh scripts/run-interactive-demo.sh
```

Windows 兼容入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1 -ServeOnly
```

演示顺序：

1. 选择当前 Lab，说明页面已识别 Git 分支、starter/solution 角色和提交号。
2. 在运行前保存对构建结果、QEMU 结果、PASS 与关键事件的预测。
3. 明确点击“构建并运行当前分支”，展示真实 QEMU/OpenSBI 串口证据。
4. 点击时间线事件，说明事件知识点、代码文件、符号、原因和状态变化。
5. 使用筛选、倍速和首个失败跳转回放；说明隐藏事件仍参与状态重建。
6. 保存同一 Lab 的 starter 与 solution 运行并比较事件和最终系统状态。
7. 展示本地规则诊断；强调它不调用 AI 模型，只依据明确证据给出可能原因。

答辩投影可进入 `http://127.0.0.1:8888/?mode=presentation`。演示模式不会自动运行 QEMU、切换分支或上传记录。

## 4. 双层评价（约 1 分钟）

### 学习者教学反馈

- 可视化页面按分支显示五道教学评价题。
- 评价讲解、任务、提示、可视化和运行反馈，不考知识答案、不计算成绩。
- 草稿仅保存在当前浏览器；使用者可主动导出 Markdown/JSON 或前往 GitLab 确认提交。

### 教师评分

1. 从 Demo 导出 `os-demo.run/v1`。
2. 在 `main` 打开 `docs/teacher-grading/index.html`。
3. 选择 Lab 和学生记录并导入运行证据。
4. 说明工具只建议 build/QEMU 状态，不自动增加分数。
5. 教师结合代码审查、实验报告和口试完成七套 100 分量表之一，再导出 `os-teacher-grading/v1` 或 Markdown。

提醒：评分导出可能包含姓名、成绩和评语，公开分享前必须人工匿名化。

## 5. QEMU 与测试证据（约 1 分钟）

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel --target riscv64gc-unknown-none-elf
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

只展示同一提交上实际运行得到的测试数字。最终输出应包含 `[Lab1] PASS` 至 `[Lab7] PASS`，并解释 Lab7 的用户态文件 I/O 如何经过 syscall、SimpleFs 和 RAM device。

## 6. AI 协作与边界（约 40 秒）

- AI 参与需求拆解、草稿、测试定位、审计和材料整理。
- 人类决定实验难度、分支策略、功能取舍、评分边界和最终验收。
- 基础实验不实现抢占、多核、ELF、多进程、virtio-block 和工业级文件系统；这些是明确的教学取舍。

## 7. 结束语

本项目交付的不只是能运行的内核，而是本科生可学习、教师可教学、评委可复现的操作系统实验环境。现场应回到真实运行证据和教学价值，不夸大尚未实现的工业级能力。
