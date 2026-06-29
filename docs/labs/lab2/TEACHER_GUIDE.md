# Lab2 教师指南

## 课程定位

Lab2 是学生第一次接触 RISC-V trap 的实验，重点是建立“异常进入内核、读取原因、处理后返回”的闭环，而不是实现完整异常子系统。

## 建议课时

- 课前阅读：30 分钟。
- 课堂讲解：45 分钟。
- 学生编码：90 到 120 分钟。
- 验收和讨论：30 分钟。

## 课堂讲授重点

1. `stvec` 的作用和 direct 模式。
2. `scause`、`sepc`、`stval` 三个 CSR 的含义。
3. breakpoint 是一种同步异常。
4. 为什么处理 32 位 `ebreak` 后要 `sepc += 4`。
5. trap 入口为什么要保存和恢复寄存器。

## 学生容易卡住的位置

- 把 OpenSBI 或 QEMU 输出误认为 trap handler 输出。
- 忘记先设置 `stvec` 就触发异常。
- 没有区分 `scause` 的 interrupt bit 和 cause code。
- `sepc` 没推进，导致同一条 `ebreak` 不断重复触发。
- 为了过测试直接打印 `[Lab2] PASS`。

## 每个任务的验收方法

任务一：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 1
```

要求学生说明 `stvec` 指向哪里。

任务二：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1 -Stage 2
```

要求学生解释 `scause/sepc/stval` 的值分别表示什么。

任务三：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
```

要求学生说明为什么当前实验推进 4 字节。

## 如何演示

1. 在 `lab2-starter` 运行 `-ExpectIncomplete`，展示 TODO 输出。
2. 切到 `lab2-solution`，运行 Stage 1/2/3。
3. 临时讨论如果不推进 `sepc` 会发生什么。

## 如何判断学生是否直接复制答案

- 让学生画出 trap 处理流程。
- 要求学生解释 `scause` 的 interrupt bit。
- 检查是否修改了 `scripts/test-lab2.ps1`。
- 检查是否只硬编码输出 marker，而没有触发 breakpoint。

## 可选扩展任务

- 处理非法指令异常。
- 比较 direct 和 vectored trap 模式。
- 思考压缩指令下 `sepc` 推进长度的问题。

## 评分建议

| 项目 | 建议权重 |
|---|---:|
| Stage 1：trap 入口与 `stvec` | 30% |
| Stage 2：异常原因读取和识别 | 30% |
| Stage 3：`sepc` 推进和返回 | 30% |
| 说明文档和代码清晰度 | 10% |
