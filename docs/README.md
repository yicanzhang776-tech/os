# 项目文档总览

本目录保存“AI 合作的操作系统教学实验环境”的需求、架构、计划、测试、AI 协作和实验设计文档。

## P0 与正式教学实验的区别

P0 是工程运行基线，不计入正式教学实验。P0 只负责 Rust 裸机工程、RISC-V 64 目标、QEMU/OpenSBI 启动和可重复测试。

Lab1 到 Lab7 是面向学生的正式教学实验，围绕操作系统核心概念逐步展开，并配套 starter code、学生任务、参考实现和自动测试。

## 按读者进入

### 学生

- [教学实验路线](labs/README.md)
- [OS 实验可视化、预测与回放](interactive-demo/README.md)
- 当前 `labN-starter` 根目录 `README.md` 及对应 `TASKS.md`、`HINTS.md`、`TESTING.md`

### 教师与助教

- [完整实验教学资料](labs/README.md)
- [教师验收与评分工具](teacher-grading/README.md)
- 各实验 `TEACHER_GUIDE.md` 与 `SOLUTION.md`

### 评委与项目维护者

- [设计方案](../DESIGN.md)
- [赛题要求映射](requirements.md)
- [系统架构](architecture.md)
- [最终验收记录](final-acceptance-report.md)
- [答辩与视频演示脚本](demo-script.md)

## 主题索引

- [赛题要求映射](requirements.md)
- [系统架构](architecture.md)
- [开发计划与当前进度](development-plan.md)
- [测试设计](testing.md)
- [AI 协作记录](ai-collaboration.md)
- [教学实验路线与完整材料](labs/README.md)
- [教师验收与评分工具](teacher-grading/README.md)
- [可视化学习地图与运行证据](interactive-demo/README.md)
- [官方资料整理](references/problem-statement.md)
- [最终设计方案与开发文档](final-report.md)
- [比赛提交检查清单](submission-checklist.md)
- [演示视频与答辩讲解脚本](demo-script.md)

## 当前分支组织

```text
p0-minimal-qemu-baseline
lab1-starter      lab1-solution
lab2-starter      lab2-solution
lab3-starter      lab3-solution
lab4-starter      lab4-solution
lab5-starter      lab5-solution
lab6-starter      lab6-solution
lab7-starter      lab7-solution
```

## 推荐 Rust Workspace 演进方向

当前仓库已用 `kernel` crate 承载所有基础教学实验。后续若继续扩展，可逐步拆出：

```text
.
├── Cargo.toml
├── kernel/                 # 主线教学内核 crate
├── crates/
│   ├── os-common/          # 可选：地址、错误码、共享常量
│   ├── os-test-support/    # 可选：测试日志、QEMU 断言辅助
│   └── os-user-lib/        # 可选：用户态系统调用封装
├── user/                   # 可选：独立用户程序 workspace 成员
├── scripts/
├── docs/
└── target/                 # 构建产物，不提交
```

本阶段没有为了形式创建大量空 crate；所有新增模块都服务于已完成的 Lab1-Lab7 教学目标。

## 实验组织方案

当前采用“starter/solution 独立分支”：

- `labN-starter`：学生起点，保留清晰 TODO，能构建和启动，但不输出本实验 PASS。
- `labN-solution`：教师参考实现，补全学生任务并输出对应 `[LabN] PASS`。
- `lab7-solution`：当前最终成果分支，包含 P0-Lab7 的完整本地实现。

这种组织方式便于教师展示 diff、学生从清晰起点开始，也便于比赛评审查看每个实验的边界。
