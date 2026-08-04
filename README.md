# Lab4：RISC-V Sv39 虚拟内存

当前分支：`lab4-starter`
当前实验：Lab4 RISC-V Sv39 虚拟内存
适合对象：已经完成 Lab3，第一次实现页表映射的本科生
预计时间：5 到 7 小时
参考答案：`lab4-solution` 分支，本 starter 分支不包含完整答案。

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

4. 阅读任务一，找到 Sv39 地址和 PTE TODO：

   ```text
   docs/labs/lab4/TASKS.md
   ```

5. 完成任务一后运行 Stage 1 测试：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 1
   ```

## 你要完成的三个任务

| 阶段 | 任务 | 完成后关键输出 |
|---|---|---|
| Stage 1 | 完成 Sv39 地址、VPN 索引和 PTE 解析 | `[Lab4-T1] address and PTE ready` 和 `[Lab4-T1] PASS` |
| Stage 2 | 完成页表 map/unmap/translate | `[Lab4-T2] page table maps` 和 `[Lab4-T2] PASS` |
| Stage 3 | 建立内核恒等映射并激活分页 | `[Lab4] satp activated`、`[Lab4] paging is active`、`[Lab4] PASS` |

## 文档入口

- 最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- [实验总览](docs/labs/lab4/README.md)
- [任务书](docs/labs/lab4/TASKS.md)
- [分级提示](docs/labs/lab4/HINTS.md)
- [测试说明](docs/labs/lab4/TESTING.md)

旧版单页说明 [docs/labs/lab4.md](docs/labs/lab4.md) 只保留跳转说明。请优先阅读 `docs/labs/lab4/` 目录下的教学文档。

## 教学评价

运行 `sh scripts/run-interactive-demo.sh` 后，页面会识别当前 Lab4 starter 分支，并显示五道针对 Sv39、三级页表、映射查询和分页激活实验的教学评价题，用来评价图示、任务顺序、提示和运行反馈，不要求填写知识答案；第 5 题关注三个 Stage 是否帮助按安全顺序完成实验。详细用法见 [可视化使用说明](docs/interactive-demo/README.md)。

## 允许修改

- `kernel/src/memory/virtual_address.rs`
- `kernel/src/memory/page_table.rs`
- 必要时修改 `kernel/src/memory/mod.rs` 中标记为 Lab4 的测试入口

## 禁止修改

- `kernel/src/boot.rs`
- `kernel/src/sbi.rs`
- `kernel/src/trap.rs`
- `kernel/linker.ld`
- `scripts/test-lab4.ps1`
- Lab5 及后续实验模块

## 分阶段测试命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -Stage 3
```

默认测试等价于 Stage 3：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
```

教师可用 starter incomplete 验证确认本分支没有提前泄露答案：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -ExpectIncomplete
```

## 最终提交要求

学生完成 Lab4 后应提交：

- 修改后的 `kernel/src/memory/virtual_address.rs`
- 修改后的 `kernel/src/memory/page_table.rs`
- 一段简短说明：三个 Stage 测试是否通过，以及为什么第一版采用恒等映射

建议提交信息：

```text
lab4: complete Sv39 virtual memory exercise
```

## 答案说明

完整参考实现位于 `lab4-solution` 分支。请先独立完成 starter，再查看 solution。`lab4-solution` 中会额外包含：

- `docs/labs/lab4/SOLUTION.md`
- `docs/labs/lab4/TEACHER_GUIDE.md`
