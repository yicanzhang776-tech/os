# Lab7：设备与简化文件系统

## 实验背景

Lab7 把前面已经完成的用户态、系统调用和内核资源管理串起来。第一版不接入真实磁盘，也不实现复杂路径解析，而是使用一个固定容量的内存设备，让学生理解“设备抽象”和“文件描述符抽象”如何支撑最小文件 I/O。

## 学习目标

- 理解字节设备和文件系统之间的关系。
- 理解文件描述符、文件偏移、读写和关闭。
- 能通过用户态系统调用完成一个可重复验证的最小文件读写场景。

## 前置知识

- Lab3：物理内存管理。
- Lab4：Sv39 页表和用户页权限。
- Lab6：用户态进入、`ecall` 和系统调用分发。
- Rust 中的数组、错误枚举和 `Result`。

## 前置实验

Lab6：用户态与系统调用。

## 三个递进小任务

### 任务 1：内存设备抽象

- 学习目标：理解设备可以先抽象成“按 offset 读写字节”的接口。
- 代码边界：`drivers` 模块中的 `ByteDevice`、`RamDevice` 和设备错误类型。
- 运行现象：starter 能暴露设备容量，但读写返回明确的未完成错误。
- 验收标准：主机测试能确认设备接口存在，solution 中读写指定 offset 后能读回相同内容。

### 任务 2：简化文件系统和文件描述符

- 学习目标：理解 fd 表、文件偏移和 close 的基本规则。
- 代码边界：`fs` 模块中的 `SimpleFs`、`open`、`read`、`write` 和 `close`。
- 运行现象：starter 能输出 `[Lab7] TODO: implement memory file system`；solution 能打开文件并维护偏移。
- 验收标准：主机测试覆盖错误 fd、容量耗尽、重复 close 和读写返回值。

### 任务 3：用户态文件 I/O 验收

- 学习目标：理解用户程序如何通过系统调用访问文件抽象。
- 代码边界：`syscall`、`trap` 和内置用户程序中的最小文件 I/O 流程。
- 运行现象：solution 在 QEMU 中输出文件打开和读写校验日志。
- 验收标准：QEMU 输出 `[Lab7] file opened`、`[Lab7] write/read verified` 和 `[Lab7] PASS`。

## 涉及模块

- `drivers`：内存字节设备。
- `fs`：简化内存文件系统和 fd 表。
- `syscall`：扩展 `open`、`read`、`write`、`close` 的教学 ABI。
- `trap`：从用户态 `ecall` 进入系统调用分发。
- `user`：内置用户程序触发最小文件 I/O。

## Starter 和 Solution 分支

- `lab7-starter`：只提供骨架、TODO 和 incomplete 测试，不输出 `[Lab7] PASS`。
- `lab7-solution`：补全内存设备、文件系统、系统调用路径和 QEMU 验收输出。

## 学生需要完成的任务

- `RamDevice::read_at` 和 `RamDevice::write_at`。
- `SimpleFs::open`、`SimpleFs::read`、`SimpleFs::write`、`SimpleFs::close`。
- 系统调用分发中与文件 I/O 相关的处理逻辑。

## 禁止修改的基础设施

- QEMU 启动脚本和超时逻辑。
- Lab1 到 Lab6 的成功标志。
- trap 入口汇编的寄存器保存布局，除非实验说明明确要求。
- `main/master` 分支。

## 自动测试设计

主机测试覆盖：

- 内存设备 offset 读写。
- 写入超过设备容量时返回错误。
- 打开文件获得 fd。
- 写后偏移前进。
- 关闭后 fd 失效。
- 重复 close 返回错误。

QEMU 测试覆盖：

- Lab6 用户态路径仍然通过。
- 用户态程序触发 Lab7 文件系统调用。
- 文件写入和读取内容一致。
- 最终输出 `[Lab7] PASS`。

## QEMU 预期输出

Starter：

```text
[Lab7] start
[Lab7] TODO: implement memory file system
```

Solution：

```text
[Lab7] start
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

## 构建和测试命令

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

Solution 分支使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

## 常见错误

- 文件偏移没有随读写更新。
- fd 关闭后仍然允许读写。
- 写入超过容量时静默截断或覆盖。
- 把 console 的 `write` 和文件 `write` 混在一起，没有区分 fd。
- 用户缓冲区范围没有限制在教学允许的固定区域内。

## 调试建议

- 先用主机测试验证 `RamDevice` 和 `SimpleFs`，再进 QEMU。
- QEMU 中优先检查 `[Lab6] PASS` 是否仍然出现。
- 如果 Lab7 卡住，先确认用户程序是否真的触发了对应 syscall id。

## 扩展任务

- 支持多个文件名和目录。
- 引入更完整的用户指针检查。
- 把内存设备替换为 virtio-block。
- 为文件 I/O 增加权限位或只读文件。

## 思考题

- 为什么操作系统常把设备抽象成文件或类文件接口？
- 内存文件系统和块设备文件系统的教学取舍是什么？
- 为什么 fd 表要和文件对象分开？

## 教师验收说明

教师可以先在 `lab7-starter` 运行 incomplete 测试确认没有泄露答案，再在 `lab7-solution` 运行正式测试确认文件 I/O 路径闭环。

## 预计完成时间

8 到 12 小时。
