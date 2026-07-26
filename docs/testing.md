# 测试设计

## 当前可用测试

P0 当前提供 QEMU 冒烟测试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
```

该测试负责构建后的内核运行验证，检查 QEMU 输出中是否包含 P0 启动日志。

## 后续测试分层

| 层级 | 用途 | 示例 |
|---|---|---|
| 主机单元测试 | 验证与硬件无关的纯 Rust 逻辑 | 地址计算、页号取整、分配器状态机 |
| 集成测试 | 验证 crate 或模块之间的接口 | 任务队列、系统调用分发、文件表 |
| QEMU 系统测试 | 验证真实 RISC-V 启动和运行行为 | 启动日志、trap、分页、用户程序、文件读写 |

## 统一测试入口规划

后续建议新增：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab.ps1 lab1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab.ps1 all
```

当前尚未创建该脚本，具体参数和目录待 P0 架构稳定后补充。

## 日志约定

每个正式实验建议输出：

- `[labN] start`
- `[labN] PASS`
- `[labN] FAIL: <reason>`

QEMU 测试只匹配稳定 token，不依赖 OpenSBI 完整 banner。

## CI 规划

后续 GitLab CI 可分为：

```text
fmt -> clippy -> build -> qemu-test
```

如果官方 runner 缺少 QEMU，则 CI 至少执行格式化、Clippy 和构建，QEMU 结果在本地验收文档中记录。
