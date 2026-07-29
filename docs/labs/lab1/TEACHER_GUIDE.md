# Lab1 教师指南

## 课程定位

Lab1 是学生进入本项目的第一个正式实验，重点不是让学生写大量代码，而是建立对裸机启动、SBI 输出和自动测试 marker 的直观认识。

建议把本实验安排在课程前 1 到 2 次实验课。学生完成后，应能说清楚：

- QEMU/OpenSBI 如何进入内核；
- `_start`、启动栈和 `kernel_main` 的关系；
- 为什么裸机内核不能直接使用标准输出；
- 自动化测试为什么需要稳定成功标志。

## 建议课时

- 课前阅读：30 分钟。
- 课堂讲解：30 到 45 分钟。
- 学生编码：60 到 90 分钟。
- 讨论和验收：30 分钟。

## 课堂讲授重点

1. 从 `kernel/linker.ld` 的 `ENTRY(_start)` 讲到 `kernel/src/boot.rs`。
2. 解释启动栈为什么必须在进入 Rust 前设置好。
3. 展示 `sbi::console_putchar` 的调用边界，但不要求学生深入 SBI 规范。
4. 强调 Stage 测试的意义：每一步都能看到可验证结果。

## 学生容易卡住的位置

- 分不清 OpenSBI 日志和内核日志。
- 以为可以使用标准库 `println!`。
- 把字符串输出写成固定测试字符串。
- 忘记 `sbi::shutdown()`，导致 QEMU 超时。
- 为了通过测试修改 `scripts/test-lab1.ps1`。

## 每个任务的验收方法

任务一：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 1
```

检查学生是否能解释 `_start -> kernel_main`。

任务二：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1 -Stage 2
```

检查 `console_write` 是否真正输出传入字符串，而不是写死 marker。

任务三：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
```

检查最终输出顺序、`[Lab1] PASS` 和 QEMU 正常退出。

## 演示建议

1. 先在 `lab1-starter` 运行 `-ExpectIncomplete`，说明 starter 是故意未完成的。
2. 让学生完成 Stage 1，再运行 Stage 1 测试。
3. 展示 Stage 2 失败原因，引导学生阅读 `console.rs`。
4. 最后切到 `lab1-solution` 演示完整输出。

## 如何判断学生是否直接复制答案

- 要求学生口头说明 `_start`、启动栈和 `kernel_main` 的关系。
- 临时更换一个非测试字符串，观察 `console_write` 是否能正常输出。
- 检查学生是否修改了禁止修改的基础设施文件。
- 查看提交历史是否一次性完成全部任务，且没有阶段性记录。

## 可选扩展任务

这些内容不属于基础必做：

- 阅读 SBI legacy console 与新版 debug console 的区别。
- 实现一个最小 `print!` 风格宏。
- 思考非 ASCII 字符在逐字节输出时的表现。

## 评分建议

| 项目 | 建议权重 |
|---|---:|
| Stage 1 启动路径理解与输出 | 25% |
| Stage 2 console 接口实现 | 35% |
| Stage 3 完整日志与正常关机 | 25% |
| 代码清晰度和实验说明 | 15% |

不建议把高级扩展计入基础分，可以作为加分或课堂讨论。
