# Lab6 教师指南

教师可导入 Demo 运行证据，但仍要检查特权级切换、syscall ABI、用户边界、修改范围和学生解释，不能只凭 PASS 打分。

## 课程定位

Lab6 是学生第一次看到真实 U-mode 和系统调用边界的实验。它的目标是理解机制，不是实现完整用户进程系统。

建议课时：2 次课或 1 次课加 1 次实验课。

## 课堂讲授重点

- `sepc`、`sstatus.SPP`、`sstatus.SPIE` 的含义。
- `sret` 和普通函数返回的区别。
- `ecall` 如何从 U-mode 进入 S-mode。
- syscall id 和参数寄存器约定。
- 为什么处理 `ecall` 后要推进 `sepc`。

## 三个任务的验收方法

| 任务 | 验收命令 | 重点观察 |
|---|---|---|
| 任务一 | `scripts/test-lab6.ps1 -Stage 1` | 是否输出 `[Lab6-T1] PASS` |
| 任务二 | `scripts/test-lab6.ps1 -Stage 2` | 是否输出 `[Lab6-T2] PASS` |
| 任务三 | `scripts/test-lab6.ps1 -Stage 3` | 是否输出用户程序 hello、syscall 处理日志和 `[Lab6] PASS` |

## 学生容易卡住的位置

- SPP 位理解反了，导致没有进入 U-mode。
- `ecall` 后没有推进 `sepc`，造成重复 trap。
- 用户 text 或 stack 缺少 U 权限。
- 把 Lab7 的文件系统 syscall 提前混入 Lab6。

## 如何演示

1. 在 `lab6-starter` 运行 `scripts/test-lab6.ps1 -ExpectIncomplete`，说明 starter 可构建但未完成。
2. 切到 `lab6-solution`，依次运行 Stage 1、Stage 2、Stage 3。
3. 对照 `SOLUTION.md` 讲清楚 U-mode 进入、`ecall` 分发和 `sepc += 4`。

## 判断是否直接复制答案

可以要求学生解释：

- 为什么 `sstatus.SPP=0` 表示返回 U-mode。
- 为什么 syscall id 放在 `a7`。
- 为什么 `write` 的返回值应表示处理字节数。
- 为什么 `exit` 不应返回用户程序继续执行。

## 可选扩展任务

- 增加一个简单 `getpid` syscall。
- 尝试给用户指针增加范围检查。
- 讨论 ELF 加载需要哪些元数据。
- 讨论多用户程序会如何改变地址空间管理。

## 评分建议

- 任务一：25%
- 任务二：30%
- 任务三：35%
- 代码可读性和实验报告：10%

不要把 ELF 加载、多进程或完整用户指针校验作为基础必做内容；这些适合作为扩展任务。
