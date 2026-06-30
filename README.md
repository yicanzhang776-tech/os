# Lab3：物理内存管理

当前分支：`lab3-starter`
当前实验：Lab3 物理内存管理
适合对象：已经完成 Lab2，第一次实现页帧分配器的本科生
预计时间：4 到 6 小时
参考答案：`lab3-solution` 分支，本 starter 分支不包含完整答案。

## 5 分钟快速开始

1. 检查环境：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
   ```

2. 构建内核：

   ```powershell
   cargo build -p ai-os-kernel
   ```

3. 启动 QEMU，观察当前 starter 输出：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
   ```

4. 阅读任务一，找到地址与页号 TODO：

   ```text
   docs/labs/lab3/TASKS.md
   ```

5. 完成任务一后运行 Stage 1 测试：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 1
   ```

## 你要完成的三个任务

| 阶段 | 任务 | 完成后关键输出 |
|---|---|---|
| Stage 1 | 完成物理地址和页号转换 | `[Lab3-T1] address types ready` 和 `[Lab3-T1] PASS` |
| Stage 2 | 初始化分配器并完成基本分配 | `[Lab3-T2] allocator can allocate` 和 `[Lab3-T2] PASS` |
| Stage 3 | 完成释放、复用和错误检查 | `[Lab3] frame allocator ready` 和 `[Lab3] PASS` |

三个任务由易到难。任务一只处理纯地址计算；任务二实现最小分配；任务三补齐释放、复用和非法释放检查。

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- [实验总览](docs/labs/lab3/README.md)
- [任务书](docs/labs/lab3/TASKS.md)
- [分级提示](docs/labs/lab3/HINTS.md)
- [测试说明](docs/labs/lab3/TESTING.md)

旧版单页说明 [docs/labs/lab3.md](docs/labs/lab3.md) 只保留跳转说明。请优先阅读 `docs/labs/lab3/` 目录下的教学文档。

## 允许修改

- `kernel/src/memory/address.rs`
- `kernel/src/memory/frame_allocator.rs`

## 禁止修改

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `kernel/src/trap.rs`
- `kernel/linker.ld`
- `scripts/test-lab3.ps1`
- Lab4 及后续实验模块

禁止修改的文件是本实验基础设施。修改这些文件可能让测试失去教学意义。

## 分阶段测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
```

教师可用 starter incomplete 验证确认本分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -ExpectIncomplete
```

## 最终提交要求

学生完成 Lab3 后应提交：

- 修改后的 `kernel/src/memory/address.rs`
- 修改后的 `kernel/src/memory/frame_allocator.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及自己如何避免分配内核占用内存

建议提交信息：

```text
lab3: complete physical memory allocator exercise
```

## 答案说明

完整参考实现位于 `lab3-solution` 分支。请先独立完成 starter，再查看 solution。`lab3-solution` 中会额外包含：

- `docs/labs/lab3/SOLUTION.md`
- `docs/labs/lab3/TEACHER_GUIDE.md`
