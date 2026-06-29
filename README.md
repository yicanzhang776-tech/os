# Lab3：物理内存管理

当前分支：`lab3-solution`
当前实验：Lab3 物理内存管理
适合对象：已经完成 Lab2，第一次实现页帧分配器的本科生
预计时间：4 到 6 小时
分支定位：教师参考实现和验收材料，不建议直接发给学生作为起点。

学生起点位于 `lab3-starter`。本分支在保留 starter 教学文档的基础上，额外提供参考实现、解题说明和教师指南。

## 5 分钟快速开始

1. 检查环境：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
   ```

2. 构建内核：

   ```powershell
   cargo build -p ai-os-kernel
   ```

3. 启动 QEMU，观察当前 solution 输出：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-qemu.ps1
   ```

4. 阅读任务一，理解地址计算和参考实现边界：

   ```text
   docs/labs/lab3/TASKS.md
   ```

5. 运行 Stage 1 测试：

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

- [实验总览](docs/labs/lab3/README.md)
- [任务书](docs/labs/lab3/TASKS.md)
- [分级提示](docs/labs/lab3/HINTS.md)
- [测试说明](docs/labs/lab3/TESTING.md)
- [参考答案说明](docs/labs/lab3/SOLUTION.md)
- [教师指南](docs/labs/lab3/TEACHER_GUIDE.md)

旧版单页说明 [docs/labs/lab3.md](docs/labs/lab3.md) 只保留跳转说明。请优先阅读 `docs/labs/lab3/` 目录下的教学文档。

## 学生分支允许修改

- `kernel/src/memory/address.rs`
- `kernel/src/memory/frame_allocator.rs`

## 学生分支禁止修改

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

教师可在 `lab3-starter` 中使用 starter incomplete 验证确认起点分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -ExpectIncomplete
```

## 学生最终提交要求

学生完成 Lab3 后应提交：

- 修改后的 `kernel/src/memory/address.rs`
- 修改后的 `kernel/src/memory/frame_allocator.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及自己如何避免分配内核占用内存

建议提交信息：

```text
lab3: complete physical memory allocator exercise
```

## 答案说明

完整参考实现位于当前 `lab3-solution` 分支。教学使用时建议先让学生在 `lab3-starter` 独立完成，再由教师根据本分支讲解关键实现。`lab3-solution` 中额外包含：

- `docs/labs/lab3/SOLUTION.md`
- `docs/labs/lab3/TEACHER_GUIDE.md`
