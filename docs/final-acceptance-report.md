# P0-Lab7 推送前验收报告

日期：2026-06-29

## 当前状态

- 当前分支：`lab7-solution`。
- 当前最新提交：`755f9ff lab7: complete memory file system exercise solution`。
- 本轮未执行 `git push`。
- 本轮未修改 `main/master`。

## 分支清单

| 分支 | 最新提交 | upstream | 推送建议 |
|---|---|---|---|
| `p0-minimal-qemu-baseline` | `b3b1fe8` | `origin/p0-minimal-qemu-baseline` | 已有远端，可按需更新 |
| `lab1-starter` | `c8cf917` | `origin/lab1-starter` | 已有远端，可按需更新 |
| `lab1-solution` | `77e2a94` | `origin/lab1-solution` | 已有远端，可按需更新 |
| `lab2-starter` | `56437b5` | `origin/lab2-starter` | 已有远端，可按需更新 |
| `lab2-solution` | `51c3111` | `origin/lab2-solution` | 已有远端，可按需更新 |
| `lab3-starter` | `d3ea383` | 无 | 建议推送 |
| `lab3-solution` | `f2eae40` | 无 | 建议推送 |
| `lab4-starter` | `47236bd` | 无 | 建议推送 |
| `lab4-solution` | `323c146` | 无 | 建议推送 |
| `lab5-starter` | `8e0d0cc` | 无 | 建议推送 |
| `lab5-solution` | `2d1afbc` | 无 | 建议推送 |
| `lab6-starter` | `785507f` | 无 | 建议推送 |
| `lab6-solution` | `30b4703` | 无 | 建议推送 |
| `lab7-starter` | `d27bc23` | 无 | 建议推送 |
| `lab7-solution` | `755f9ff` | 无 | 建议推送 |

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

注意：GitLab CI 只有在对应分支包含 `.gitlab-ci.yml` 时才会生效。如果希望旧分支也使用最新 CI，需要将本轮 CI 收尾修改同步到对应分支，或以最终成果分支作为主要评审入口。

## 当前限制

- Lab5 不包含抢占式调度、多核调度或复杂优先级。
- Lab6 不包含 ELF 加载、多进程或完整用户指针校验。
- Lab7 不包含 virtio-block、真实磁盘、复杂路径解析或工业级文件系统。
- 最终设计报告、演示视频和答辩 PPT 仍需项目成员整理。

## 建议推送顺序

未经人工授权不得执行推送。获得授权后建议按以下顺序推送：

```powershell
git push -u origin p0-minimal-qemu-baseline
git push -u origin lab1-starter lab1-solution
git push -u origin lab2-starter lab2-solution
git push -u origin lab3-starter lab3-solution
git push -u origin lab4-starter lab4-solution
git push -u origin lab5-starter lab5-solution
git push -u origin lab6-starter lab6-solution
git push -u origin lab7-starter lab7-solution
```
