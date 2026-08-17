# 测试设计

本文档记录当前 P0-Lab7 的测试分层、脚本入口和 CI 策略。测试目标是保证每个实验既能作为学生 starter 验证，也能作为教师 solution 验收。

## 教学智能体与远程反馈测试

Node 总套件应覆盖交互演示、智能体 API/循环/模型客户端/六个工具、学生端面板、反馈接收、8891 管理页和教师评分。学生端必须验证：未同意不发送；同意只写 `sessionStorage` 固定键；4000 字符通过、4001 拒绝；回答使用 `textContent`；未配置、认证、限流、超时、任务繁忙和上下文变化使用固定中文说明；演示模式不自动提问；“清空当前显示”不声称删除持久化数据。

在线测试只有在安全注入具有 Agent Plan 权限的 `ARK_API_KEY` 后才执行，且不得打印密钥。必须分别验证直接回答、`get_context`、运行证据、允许源码、拒绝答案/教师路径、批准测试、上下文变化和完整页面流程。未运行时必须如实记录。

```powershell
$node = "node"
$tests = Get-ChildItem docs/interactive-demo,docs/teacher-grading,scripts -Recurse -Filter *.test.js
& $node --test ($tests.FullName)
```

分阶段验收保持 `-Stage 1/2/3` 和原始 starter 的 `-ExpectIncomplete`；两参数同时使用必须明确拒绝。P0 不在智能体 `run_test` 登记表中。

## 当前可用测试

### 环境检查

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

```sh
sh scripts/check-env.sh
```

### 格式、构建和静态检查

```powershell
cargo fmt --all -- --check
cargo build -p ai-os-kernel
cargo clippy -p ai-os-kernel -- -D warnings
```

### 主机单元测试

```powershell
cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc
```

主机单元测试覆盖与硬件无关的纯 Rust 逻辑，例如地址转换、物理页分配器、Sv39 页表算法、任务状态机、系统调用分发和内存文件系统。

### 独立事件协议 Crate

`os-demo-event` 使用当前主机目标执行单元测试，避免根目录的 RISC-V 默认目标影响 `std` 测试运行器：

```sh
HOST_TARGET=$(rustc -vV | sed -n 's/^host: //p')
cargo test -p os-demo-event --target "$HOST_TARGET"
cargo doc -p os-demo-event --no-deps
cargo package -p os-demo-event
```

单元测试覆盖协议版本、P0 与 Lab1-Lab7 标识、状态推导、确定性编码、字段长度和字符检查、特殊字符拒绝、固定栈缓冲区编码以及典型 Lab 事件。`cargo package` 仅验证包元数据和内容，不执行发布。浏览器兼容性由 `docs/interactive-demo/protocol.test.js` 中的字节兼容事件样例验证。

### QEMU 系统测试

P0：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1
```

Lab1 到 Lab7：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab6.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1
```

### 分阶段 QEMU 验收

Lab1-Lab7 的 PowerShell 脚本支持 `-Stage 1/2/3`。Stage 1/2 检查当前任务阶段的稳定证据，Stage 3 检查端到端行为并作为默认值：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab5.ps1 -Stage 3
```

`-Stage` 与 `-ExpectIncomplete` 互斥。后者只用于未完成的 starter 起点，不能作为学生完成功能后的最终验收。

### 可视化与教师评分测试

使用 Node.js 18 或更新版本执行：

```powershell
node --test docs/interactive-demo/*.test.js docs/teacher-grading/grading-core.test.js
node --check docs/interactive-demo/server.js
node --check docs/interactive-demo/app.js
node --check docs/teacher-grading/grading-core.js
node --check docs/teacher-grading/app.js
```

这些测试覆盖 17 种仓库分支上下文、事件协议、预测、回放、导入导出、本地诊断、教学反馈、七套评分量表和运行证据导入。测试数量会随功能变化，正式材料只记录同一提交上实际执行得到的数字。

## Starter 与 Solution 验收策略

每个实验分支有两类验收：

- `labN-starter`：必须能构建、能启动 QEMU、不能输出 `[LabN] PASS`，并且必须输出清晰的 `[LabN] TODO` 或等价未完成提示。
- `labN-solution`：必须输出对应 `[LabN] PASS`，并保持之前实验的回归输出。

正式开课前还必须确认 starter 不包含 `SOLUTION.md`、`TEACHER_GUIDE.md`、完整答案函数体或可直接复制的补丁。

PowerShell starter 验收示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab7.ps1 -ExpectIncomplete
```

Linux CI 使用统一脚本 `scripts/test-qemu.sh`：

```sh
scripts/test-qemu.sh --name Lab7 --marker "[Lab7] PASS" --mode expect-incomplete --require "[Lab7] TODO: implement memory file system"
scripts/test-qemu.sh --name Lab7 --marker "[Lab7] PASS"
```

## 日志约定

稳定 token 使用大写实验名：

- `[P0] PASS`
- `[Lab1] PASS`
- `[Lab2] PASS`
- `[Lab3] PASS`
- `[Lab4] PASS`
- `[Lab5] PASS`
- `[Lab6] PASS`
- `[Lab7] PASS`

测试脚本只依赖这些稳定 marker 和少量实验关键 marker，不依赖完整 OpenSBI banner。

## CI 策略

`.gitlab-ci.yml` 按分支名称选择验收方式：

- `p0-minimal-qemu-baseline`：运行 P0 正向验收。
- `labN-starter`：运行 incomplete 验收，防止 starter 泄露答案。
- `labN-solution`：运行 solution 正向验收，必须看到 `[LabN] PASS`。

如果 GitLab runner 缺少 QEMU、Rust target、rustfmt 或 clippy，需要根据 CI 日志补充环境安装；本地验收结果仍应作为比赛提交说明的一部分。

## 最终本地验收建议

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
git diff --check
```

## Ubuntu/Linux 评委本地复现

以下命令用于在不依赖 GitLab Runner 的 Ubuntu/Linux 主机上复现当前 `main`。演示视频已单独提供，本节只说明代码、测试和运行命令，不要求保存截图或重新录制页面。

### 1. 获取项目并确认版本

```sh
git clone https://gitlab.eduxiji.net/T2026105749911072/project3136859-388774.git
cd project3136859-388774
git switch main
git status -sb
```

### 2. 检查依赖与 RISC-V 目标

```sh
rustc --version
cargo --version
rustup --version
node --version
qemu-system-riscv64 --version
rustup target add riscv64gc-unknown-none-elf
rustup target list --installed
```

项目以 Ubuntu/Linux 为主要验收环境。Node.js 应为 18 或更新版本；QEMU 需要提供 `qemu-system-riscv64`，内核目标固定为 `riscv64gc-unknown-none-elf`。

### 3. Shell 脚本检查

```sh
bash -n scripts/test-qemu.sh
bash -n scripts/test-qemu-script.test.sh
sh -n scripts/run-interactive-demo.sh
bash scripts/test-qemu-script.test.sh
```

QEMU 脚本行为测试使用本地模拟进程验证 marker、超时、异常退出、starter TODO、required 证据、`stdbuf` 回退和子进程清理，不运行或伪造真实内核结果。

### 4. Rust 格式、单元测试、构建、文档与打包

```sh
cargo fmt --all -- --check

HOST_TARGET=$(rustc -vV | sed -n 's/^host: //p')

CARGO_BUILD_TARGET="$HOST_TARGET" \
  cargo test -p os-demo-event \
  --target "$HOST_TARGET" \
  --locked

cargo test -p ai-os-kernel \
  --lib \
  --target "$HOST_TARGET" \
  --locked

cargo build --workspace \
  --target riscv64gc-unknown-none-elf \
  --locked

cargo doc -p os-demo-event --no-deps
cargo package -p os-demo-event
```

`cargo package` 只验证 `os-demo-event` 的包元数据和内容，不执行 `cargo publish`，也不使用 `--allow-dirty` 掩盖待提交修改。

### 5. Node 测试与 JavaScript 语法

```sh
find docs/interactive-demo docs/teacher-grading scripts \
  -name '*.test.js' -type f \
  -exec node --test {} +

find docs/interactive-demo docs/teacher-grading scripts \
  -name '*.js' -type f \
  -exec node --check {} \;
```

上述测试范围包含交互演示、17 种分支上下文、事件协议与知识目录、预测、运行历史与回放、状态模型与差异、运行记录导入导出、时间线控制、确定性诊断、教学评价、教师评分以及本机反馈接收与查看服务。

### 6. 可视化环境检查与启动

```sh
sh scripts/run-interactive-demo.sh --check-only
sh scripts/run-interactive-demo.sh
```

启动后在本机访问 <http://127.0.0.1:8888>。桥接器只监听本机地址；Windows PowerShell 脚本是兼容入口，不影响 Ubuntu/Linux 验收。

### 7. 真实 QEMU 验收

```sh
bash scripts/test-qemu.sh \
  --name Main \
  --marker "[Lab7] PASS" \
  --require "[OS_DEMO] lab=lab7 step=pass"
```

solution 验收必须同时看到真实 `[Lab7] PASS` marker 和指定的 `os-demo.event/v1` 串口证据；缺少 marker、缺少 required 证据、构建失败、QEMU 启动失败或异常退出均应返回失败。starter 按设计停在 TODO 时只能判定为未完成教学起点，不能作为 solution 完成。脚本产生的 QEMU 串口日志仅保存在本机 `target/`，不作为仓库文件或 CI artifact 上传。

### 8. GitLab CI 与本地复现关系

仓库保留 `.gitlab-ci.yml`，用于描述分支相关的自动验证步骤。本次审查时，比赛 GitLab 实例未提供可用的共享 Runner，创建项目 Runner 时服务端返回 HTTP 500，因此当前验收采用以上 Ubuntu/Linux 本地命令复现。该情况不改变项目源代码、测试内容和运行结果；GitLab Runner 服务恢复后，可继续执行同一组自动验证命令。除非远端流水线实际成功，否则不得把仓库中的 CI 配置表述为“GitLab CI 已通过”。
