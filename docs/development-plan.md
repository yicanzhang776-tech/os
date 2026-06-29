# 开发计划与当前进度

本文档记录 P0-Lab7 的阶段目标、完成状态和推送前剩余工作。

## 阶段完成情况

| 阶段 | 目标 | 当前状态 | 主要验收命令 |
|---|---|---|---|
| P0 | 最小 Rust/RISC-V/QEMU 运行基线 | 已完成 | `scripts/test-qemu.ps1` |
| Lab1 | 启动与 SBI 控制台 | 已完成 starter/solution | `scripts/test-lab1.ps1` |
| Lab2 | Trap 与异常处理 | 已完成 starter/solution | `scripts/test-lab2.ps1` |
| Lab3 | 物理内存管理 | 已完成 starter/solution | `scripts/test-lab3.ps1`；主机单测 |
| Lab4 | Sv39 虚拟内存 | 已完成 starter/solution | `scripts/test-lab4.ps1`；主机单测 |
| Lab5 | 任务管理与协作式调度 | 已完成 starter/solution | `scripts/test-lab5.ps1`；主机单测 |
| Lab6 | 用户态与系统调用 | 已完成 starter/solution | `scripts/test-lab6.ps1`；主机单测 |
| Lab7 | 设备与简化文件系统 | 已完成 starter/solution | `scripts/test-lab7.ps1`；主机单测 |

## 当前分支组织

- `p0-minimal-qemu-baseline`：P0 稳定基线。
- `labN-starter`：第 N 个实验的学生起点，保留清晰 TODO，不输出本实验 PASS。
- `labN-solution`：第 N 个实验的教师参考实现，输出对应 `[LabN] PASS`。

Lab3-Lab7 的 starter/solution 分支均已在本地建立。远端推送需要人工确认后再执行。

## 推送前剩余任务

1. 同步根 README、需求、架构、测试和 AI 协作记录。
2. 补齐 GitLab CI 到 Lab7。
3. 审计所有本地分支的提交、upstream 和推送适配情况。
4. 在 `lab7-solution` 执行全量本地验收。
5. 获得人工授权后再执行 `git push`。

## 最终验收建议

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

## 风险与后续材料

- GitLab runner 可能缺少 QEMU 或 Rust target，需要根据 CI 日志补安装命令。
- 由于 `.gitlab-ci.yml` 只在包含该文件的分支生效，若希望旧 starter/solution 分支也自动跑最新 CI，需要后续将 CI 收尾提交同步到对应分支或先合并到最终提交分支。
- 比赛最终材料仍需要设计报告、演示视频、答辩 PPT 和 AI 使用说明。
