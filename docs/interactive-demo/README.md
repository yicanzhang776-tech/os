# 实时教学 Demo

该页面既可以作为离线、手动操作的知识讲解工具，也可以跟随一次真实的 QEMU 内核运行自动跳转。

## 启动实时模式

先准备 Node.js、Rust 的 `riscv64gc-unknown-none-elf` target 和 `qemu-system-riscv64`。然后在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-interactive-demo.ps1
```

脚本会在本机 `127.0.0.1:4173` 启动页面、打开浏览器、构建内核并启动 QEMU。运行时，内核经 SBI 控制台输出的 `[OS_DEMO] lab=… step=…` 标记会被本地桥接器解析并通过 WebSocket 推给页面；页面自动高亮当前 Lab、步骤和相应的动态结构。

关闭终端或按 `Ctrl+C` 会停止本地服务器。桥接器仅监听本机回环地址，不会向网络发送实验输出。

若学生已用自己的命令启动 QEMU，也可以让 QEMU 串口输出经标准输入交给桥接器：

```powershell
qemu-system-riscv64 ... | node docs/interactive-demo/server.js --stdin
```

此模式适合保留学生已有的 QEMU 启动参数；页面仍会解析相同的 `[OS_DEMO]` 标记。

## 事件边界

遥测标记放在真正完成教学动作之后或紧邻该动作的位置：例如 `stvec` 写入、breakpoint Trap 处理、页表建立、`satp` 启用、任务切换、用户态 `ecall` 与内存文件系统读写。学生若停在某个断点、页错误或未完成的 TODO 前，页面会停留在最后一个实际收到的事件，而不会伪造“已完成”。
