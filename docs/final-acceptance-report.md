# P0-Lab7 最终验收与推送状态报告

日期：2026-06-29

## 当前状态

- 最终成果分支：`lab7-solution`。
- 默认展示分支：`main`，通过 fast-forward 展示最终成果。
- P0 与 Lab1-Lab7 的 starter/solution 分支均已推送到官方 GitLab。
- 本报告记录最终验收结果、远端分支状态和仍属于教学版边界的内容。

## 分支清单

| 分支 | 远端状态 | 用途 |
|---|---|---|
| `p0-minimal-qemu-baseline` | 已推送到 `origin/p0-minimal-qemu-baseline` | P0 最小可运行基线 |
| `lab1-starter` / `lab1-solution` | 已推送到远端同名分支 | Lab1 启动与 SBI 控制台 |
| `lab2-starter` / `lab2-solution` | 已推送到远端同名分支 | Lab2 Trap 与异常处理 |
| `lab3-starter` / `lab3-solution` | 已推送到远端同名分支 | Lab3 物理内存管理 |
| `lab4-starter` / `lab4-solution` | 已推送到远端同名分支 | Lab4 Sv39 虚拟内存 |
| `lab5-starter` / `lab5-solution` | 已推送到远端同名分支 | Lab5 协作式调度 |
| `lab6-starter` / `lab6-solution` | 已推送到远端同名分支 | Lab6 用户态与系统调用 |
| `lab7-starter` / `lab7-solution` | 已推送到远端同名分支 | Lab7 设备与简化文件系统 |
| `main` | 已快进到最终成果 | GitLab 默认页面展示入口 |

## 本轮验证命令与结果

| 命令 | 结果 |
|---|---|
| `cargo fmt --all -- --check` | 通过 |
| `cargo build -p ai-os-kernel` | 通过 |
| `cargo clippy -p ai-os-kernel -- -D warnings` | 通过 |
| `cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc` | 46 passed, 0 failed |
| `scripts/test-lab1.ps1` | 通过 |
| `scripts/test-lab2.ps1` | 通过 |
| `scripts/test-lab3.ps1` | 通过 |
| `scripts/test-lab4.ps1` | 通过 |
| `scripts/test-lab5.ps1` | 通过 |
| `scripts/test-lab6.ps1` | 通过 |
| `scripts/test-lab7.ps1` | 通过 |
| `lab7-starter` 临时副本运行 `scripts/test-lab7.ps1 -ExpectIncomplete` | 通过 |

## QEMU 关键输出

`lab7-solution` 输出包含：

```text
[Lab1] PASS
[Lab2] PASS
[Lab3] PASS
[Lab4] PASS
[Lab5] PASS
[Lab6] PASS
[Lab7] PASS
```

Lab7 solution 关键输出：

```text
[Lab7] start
[Lab7] file opened
[Lab7] file opened
[Lab7] write/read verified
[Lab7] PASS
```

Lab7 starter incomplete 关键输出：

```text
[Lab7] start
[Lab7] TODO: implement memory file system
Lab7 QEMU starter incomplete test passed.
```

## CI 状态

`.gitlab-ci.yml` 已扩展到 P0 和 Lab1-Lab7：

- P0 分支运行 `[P0] PASS` 正向验收。
- `labN-starter` 分支运行 incomplete 验收，防止 starter 泄露答案。
- `labN-solution` 分支运行 `[LabN] PASS` 正向验收。

注意：GitLab CI 只有在对应分支包含 `.gitlab-ci.yml` 时才会生效。当前最终展示入口为 `main`/`lab7-solution`；如需旧 starter/solution 分支也单独使用最新 CI，可后续同步 CI 配置。

## 当前限制

- Lab5 不包含抢占式调度、多核调度或复杂优先级。
- Lab6 不包含 ELF 加载、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘、复杂路径解析或工业级文件系统。
- 仓库已包含最终设计方案与开发文档、提交检查清单和演示讲解脚本；演示视频和答辩 PPT 仍需按比赛实际提交要求制作。
