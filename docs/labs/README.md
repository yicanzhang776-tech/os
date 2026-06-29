# 教学实验路线

P0 是工程运行基线，不计入正式教学实验。Lab1 到 Lab7 是面向学生的正式教学实验，每个实验继续使用 starter/solution 两个分支。

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

## 文档索引

- [Lab1: Boot and SBI Console](lab1.md)
- [Lab2: Trap and Exception Handling](lab2.md)
- [Lab3: 物理内存管理](lab3.md)
- [Lab4: Sv39 虚拟内存](lab4.md)
- [Lab5: 任务管理与协作式调度](lab5.md)
- [Lab6: 用户态与系统调用](lab6.md)
- [Lab7: 设备与简化文件系统](lab7.md)
