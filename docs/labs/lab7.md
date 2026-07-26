# Lab7：设备与简化文件系统

这是 Lab7 的总入口。学生在 `lab7-starter` 分支完成任务；教师在 `lab7-solution` 分支查看参考实现和验收说明。

## 实验目标

Lab7 把 Lab6 的用户态系统调用路径扩展到最小文件 I/O。第一版只使用内存设备和单文件文件系统，不引入 virtio-block、真实磁盘、复杂路径解析或多进程文件表。

## 三个基础任务

1. RAM 字节设备：实现 `RamDevice::read_at` 和 `RamDevice::write_at`。
2. 简化文件系统：实现 `SimpleFs::open/read/write/close`。
3. 用户态文件 I/O 验收：通过系统调用触发 open/write/read/close，并输出 `[Lab7] PASS`。

## 教学文档

- [README.md](lab7/README.md)：实验总览。
- [TASKS.md](lab7/TASKS.md)：学生任务书。
- [HINTS.md](lab7/HINTS.md)：分级提示。
- [TESTING.md](lab7/TESTING.md)：构建和测试说明。

solution 分支还会包含：

- `SOLUTION.md`：参考实现说明。
- `TEACHER_GUIDE.md`：教师指南。

## 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -Stage 3
```

starter 分支只应通过 `-ExpectIncomplete`。solution 分支应通过全部 Stage 测试和默认测试。
