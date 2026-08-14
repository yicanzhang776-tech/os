# Lab3 教师指南

> 教师流程：让学生用本地现象和运行证据提问，可用智能体生成口试追问；再导入 `os-demo.run/v1`，结合代码审查、Stage、报告和口试人工确认。智能体回答不计分，须防止硬编码 marker。

教师可导入 Demo 运行证据，但仍要检查分配边界、释放错误处理、修改范围和学生解释，不能只凭 PASS 打分。

## 课程定位

Lab3 是学生第一次实现内存管理基础设施。重点是“页大小、页号、半开区间、分配和释放状态”，不是实现复杂物理内存管理算法。

## 建议课时

- 课前阅读：30 到 45 分钟。
- 课堂讲解：45 分钟。
- 学生编码：2 小时。
- 验收和讨论：30 分钟。

## 课堂讲授重点

1. `PhysAddr` 和 `PhysPageNum` 的区别。
2. `floor` 和 `ceil` 的边界条件。
3. `ekernel` 为什么必须来自链接脚本。
4. `[start, end)` 半开区间。
5. 重复释放为什么会破坏分配器。

## 学生容易卡住的位置

- `ceil` 的 off-by-one。
- 把 `end` 当作可分配页。
- 没有记录释放页，导致无法复用。
- 重复释放后同一页被分配多次。
- 试图修改链接脚本或 QEMU 参数绕过问题。

## 每个任务的验收方法

任务一：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 1
```

要求学生手算一个对齐地址和一个非对齐地址的 `floor/ceil`。

任务二：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1 -Stage 2
```

要求学生解释 `[start, end)` 中为什么不包含 `end`。

任务三：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
```

要求学生解释非法释放和重复释放的区别。

## 如何演示

1. 在 `lab3-starter` 运行 `-ExpectIncomplete`，展示三个 TODO marker。
2. 用白板画出 `[start, next, end)`。
3. 切到 `lab3-solution`，依次运行 Stage 1、Stage 2、Stage 3。
4. 展示主机单元测试如何覆盖边界情况。

## 如何判断学生是否直接复制答案

- 让学生现场解释 `ceil` 对已对齐地址的结果。
- 改一个小范围分配测试，观察 `alloc` 是否仍正确。
- 检查是否修改了 `scripts/test-lab3.ps1`。
- 检查是否硬编码 QEMU 输出 marker。

## 可选扩展任务

- 支持连续多页分配。
- 比较栈式回收和 bitmap 分配器。
- 思考如何从设备树获取真实物理内存范围。

## 评分建议

| 项目 | 建议权重 |
|---|---:|
| Stage 1：地址和页号转换 | 30% |
| Stage 2：基本分配 | 30% |
| Stage 3：释放、复用和错误检查 | 30% |
| 代码清晰度和解释 | 10% |
