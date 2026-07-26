# Lab6 文档入口

Lab6 已改造为目录化教学实验。学生应从 `lab6-starter` 分支开始，教师和助教可在 `lab6-solution` 分支查看参考实现和验收说明。

## Starter 文档

- [Lab6 总览](lab6/README.md)
- [Lab6 任务书](lab6/TASKS.md)
- [Lab6 分级提示](lab6/HINTS.md)
- [Lab6 测试说明](lab6/TESTING.md)

## Solution 专用文档

以下文件只应出现在 `lab6-solution` 分支：

- [Lab6 参考答案说明](lab6/SOLUTION.md)
- [Lab6 教师指南](lab6/TEACHER_GUIDE.md)

## 实验定位

Lab6 第一版只运行一个内置用户程序，实现最小 U-mode 进入、`write` 和 `exit` 系统调用。不包含 ELF 加载、多进程、复杂用户指针校验或文件系统。
