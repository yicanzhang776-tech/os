# Lab4 文档入口

Lab4 已改造为目录化教学实验。学生应从 `lab4-starter` 分支开始，教师和助教可在 `lab4-solution` 分支查看参考实现和验收说明。

## Starter 文档

- [Lab4 总览](lab4/README.md)
- [Lab4 任务书](lab4/TASKS.md)
- [Lab4 分级提示](lab4/HINTS.md)
- [Lab4 测试说明](lab4/TESTING.md)

## Solution 专用文档

以下文件只应出现在 `lab4-solution` 分支：

- [Lab4 参考答案说明](lab4/SOLUTION.md)
- [Lab4 教师指南](lab4/TEACHER_GUIDE.md)

## 实验定位

Lab4 连接 Lab3 的物理页分配器和后续任务管理实验。它的教学目标是让学生理解 Sv39 地址结构、三级页表、页表项权限、恒等映射、`satp` 和 `sfence.vma`，而不是实现完整工业级虚拟内存子系统。
