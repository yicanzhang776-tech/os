# Lab7 Solution：设备与简化文件系统

当前分支：`lab7-solution`

当前实验：Lab7 设备与简化文件系统参考实现。

用途：供教师验收、讲解和对照学生提交。不要直接把本分支作为学生起点发布给学生；学生应使用 `lab7-starter`。

## 本分支包含什么

- Lab7 starter 的完整任务书、提示和测试说明。
- RAM 字节设备参考实现。
- 简化内存文件系统与 fd 表参考实现。
- 用户态 open/write/read/close 验收路径。
- Lab7 参考答案说明和教师指南。

## 三个递进任务

| 阶段 | 内容 | 验收标志 |
|---|---|---|
| 任务一 | `RamDevice::read_at/write_at` 与越界检查 | `[Lab7-T1] PASS` |
| 任务二 | `SimpleFs::open/read/write/close` 与 fd 偏移 | `[Lab7-T2] PASS` |
| 任务三 | 用户态文件 I/O 系统调用闭环 | `[Lab7] PASS` |

## 文档入口

- 比赛最终设计方案与开发文档：[docs/final-report.md](docs/final-report.md)
- OS实验可视化展示：[使用说明](docs/interactive-demo/README.md)（[页面源码](docs/interactive-demo/index.html)，自动进入当前 GitLab 分支）
- 学生任务：[docs/labs/lab7/TASKS.md](docs/labs/lab7/TASKS.md)
- 分级提示：[docs/labs/lab7/HINTS.md](docs/labs/lab7/HINTS.md)
- 测试说明：[docs/labs/lab7/TESTING.md](docs/labs/lab7/TESTING.md)
- 参考实现说明：[docs/labs/lab7/SOLUTION.md](docs/labs/lab7/SOLUTION.md)
- 教师指南：[docs/labs/lab7/TEACHER_GUIDE.md](docs/labs/lab7/TEACHER_GUIDE.md)

## 验收命令

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

## 预期关键输出

```text
[Lab7] start
[Lab7-T1] ram device ready
[Lab7-T1] PASS
[Lab7-T2] simple fs ready
[Lab7-T2] PASS
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

## 教学版边界

本实验不实现 virtio-block、真实磁盘、多目录、复杂路径解析、多进程文件表、完整用户指针校验或权限模型。这些内容适合作为扩展任务或后续课程项目。
