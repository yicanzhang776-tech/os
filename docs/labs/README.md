# 教学实验路线

P0 是工程运行基线，不计入正式教学实验。Lab1 到 Lab7 是面向学生的正式教学实验，每个实验继续使用 starter/solution 两个分支。

## 可视化与 AI 教学助教

每个正式分支可启动同一套学习页面：先预测，再真实运行 QEMU，使用本地规则诊断、时间线回放和 starter/solution 对比。学生可在首次数据同意后手动使用 AI 教学助教获得证据化提示；它只能调用六个白名单工具，不提供或读取 solution、教师指南和评分记录，也不作为成绩依据。P0 可读取上下文和已有运行证据，但智能体 `run_test` 不支持 P0。完整边界见 [AI 教学助教与数据边界](../teaching-agent.md)。

starter 分支只保留学生任务、提示、测试和可视化入口；solution 分支额外提供参考实现和教师验收材料。原始 starter 用 `-ExpectIncomplete` 检查答案隔离，学生完成任务后使用 `-Stage 1/2/3`，两参数互斥。

## 分支策略

- `labN-starter`: 学生起点，保留清晰 TODO，要求可编译、可启动，但不输出该实验成功标志。
- `labN-solution`: 教师参考答案，补全 starter 中的任务，并通过该实验自动测试。
- `p0-minimal-qemu-baseline`: P0 最小可运行基线。

## 实验状态

| 实验 | 名称 | 当前状态 | 分支 |
|---|---|---|---|
| P0 | 最小可运行内核 | 已建立工程基线 | `p0-minimal-qemu-baseline` |
| Lab1 | 启动与 SBI 控制台 | 已建立 starter/solution | `lab1-starter`, `lab1-solution` |
| Lab2 | Trap 与异常处理 | 已建立 starter/solution | `lab2-starter`, `lab2-solution` |
| Lab3 | 物理内存管理 | 已建立 starter/solution | `lab3-starter`, `lab3-solution` |
| Lab4 | Sv39 虚拟内存 | 已建立 starter/solution | `lab4-starter`, `lab4-solution` |
| Lab5 | 任务管理与协作式调度 | 已建立 starter/solution | `lab5-starter`, `lab5-solution` |
| Lab6 | 用户态与系统调用 | 已建立 starter/solution | `lab6-starter`, `lab6-solution` |
| Lab7 | 设备与简化文件系统 | 已建立 starter/solution | `lab7-starter`, `lab7-solution` |

## 依赖关系

```mermaid
flowchart LR
    P0["P0: 最小可运行内核"] --> L1S["Lab1 Starter"]
    L1S --> L1A["Lab1 Solution"]
    L1A --> L2S["Lab2 Starter"]
    L2S --> L2A["Lab2 Solution"]
    L2A --> L3S["Lab3 Starter"]
    L3S --> L3A["Lab3 Solution"]
    L3A --> L4S["Lab4 Starter"]
    L4S --> L4A["Lab4 Solution"]
    L4A --> L5S["Lab5 Starter"]
    L5S --> L5A["Lab5 Solution"]
    L5A --> L6S["Lab6 Starter"]
    L6S --> L6A["Lab6 Solution"]
    L6A --> L7S["Lab7 Starter"]
    L7S --> L7A["Lab7 Solution"]
```

## 常用验证命令

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

各实验 QEMU 验收:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

Starter 分支使用对应脚本的 `-ExpectIncomplete` 模式，例如:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

学生完成任务时应使用 `-Stage 1/2/3` 逐步验收；`-ExpectIncomplete` 只验证发布给学生的原始 starter 没有泄露最终答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

## 可视化学习与教师证据

1. 在当前教学分支启动 [OS 实验可视化](../interactive-demo/README.md)。
2. 先保存对构建、运行结果和关键事件的预测，再启动真实 QEMU。
3. 保存运行记录，回放事件并与同一 Lab 的 starter/solution 记录比较。
4. 学习者可填写教学反馈；反馈不计算成绩。
5. 教师可导出 `os-demo.run/v1`，在 `main` 的[教师评分工具](../teacher-grading/README.md)中导入客观证据，再结合代码审查、报告和口试评分。

## 评委与教师完整材料

`main` 汇总了每个实验 solution 分支中的说明材料，便于评委和教师在默认分支查看课程设计与验收方法。学生完成实验时仍应切换到对应 `labN-starter` 分支，避免提前接触参考实现。

| 实验 | 教学入口 | 参考解法说明 | 教师验收指南 |
|---|---|---|---|
| Lab1 | [README](lab1/README.md) | [SOLUTION](lab1/SOLUTION.md) | [TEACHER_GUIDE](lab1/TEACHER_GUIDE.md) |
| Lab2 | [README](lab2/README.md) | [SOLUTION](lab2/SOLUTION.md) | [TEACHER_GUIDE](lab2/TEACHER_GUIDE.md) |
| Lab3 | [README](lab3/README.md) | [SOLUTION](lab3/SOLUTION.md) | [TEACHER_GUIDE](lab3/TEACHER_GUIDE.md) |
| Lab4 | [README](lab4/README.md) | [SOLUTION](lab4/SOLUTION.md) | [TEACHER_GUIDE](lab4/TEACHER_GUIDE.md) |
| Lab5 | [README](lab5/README.md) | [SOLUTION](lab5/SOLUTION.md) | [TEACHER_GUIDE](lab5/TEACHER_GUIDE.md) |
| Lab6 | [README](lab6/README.md) | [SOLUTION](lab6/SOLUTION.md) | [TEACHER_GUIDE](lab6/TEACHER_GUIDE.md) |
| Lab7 | [README](lab7/README.md) | [SOLUTION](lab7/SOLUTION.md) | [TEACHER_GUIDE](lab7/TEACHER_GUIDE.md) |

每个实验目录还包含 `TASKS.md`、`HINTS.md` 与 `TESTING.md`，分别说明学生任务、分级提示和验收命令。

## 原始实验概览

- [Lab1: Boot and SBI Console](lab1.md)
- [Lab2: Trap and Exception Handling](lab2.md)
- [Lab3: 物理内存管理](lab3.md)
- [Lab4: Sv39 虚拟内存](lab4.md)
- [Lab5: 任务管理与协作式调度](lab5.md)
- [Lab6: 用户态与系统调用](lab6.md)
- [Lab7: 设备与简化文件系统](lab7.md)
