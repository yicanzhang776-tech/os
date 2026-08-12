# AI 教学助教与数据边界

本文是教学智能体、远程反馈和本地评分的数据口径基线。页面、实验文档、答辩材料与验收报告均应以这里的边界为准，不能再笼统描述为“完全本地”或“统一上传”。

## 教学定位

AI 教学助教位于可视化页面的“本地规则诊断”之后。它面向学生提供引导式、证据化解释：先观察当前分支和运行证据，再解释机制、定位教学代码、预测结果，最后建议验证。回答不是标准答案、确定的根因结论或评分依据，每次提问独立处理。

本地规则诊断与教学智能体是两套独立能力：前者由确定性规则在浏览器和本地桥接器中运行，不调用模型；后者只有在学生明确同意并手动提问后才访问云端模型。

## 架构与协议

```mermaid
sequenceDiagram
    participant S as 学生浏览器
    participant B as 本地桥接器 /api/agent
    participant L as 受限 Agent 循环
    participant A as 火山方舟 Agent Plan
    participant T as 六个白名单工具
    S->>B: POST {message} + 会话级同意
    B->>L: 固定教学引导 + 服务端上下文
    L->>A: 首轮消息 + 工具定义，store: true
    A-->>L: 回答或一个 function_call
    L->>T: 校验参数、分支、提交和权限后调用
    T-->>L: os-tutor.tool/v1 受限证据
    L->>A: previous_response_id + function_call_output
    A-->>L: 最终回答
    L-->>B: 纯文本回答
    B-->>S: os-tutor.agent/v1
```

公共接口保持稳定：

- `POST /api/agent` 只接受 `{ "message": string }`，最大 4000 字符。
- 响应协议为 `os-tutor.agent/v1`，工具结果协议为 `os-tutor.tool/v1`。
- `/api/context` 只返回模型是否已配置、提供方、模型名、协议版本和 `remoteStore`，绝不返回 API Key、请求头或密钥长度。
- 默认提供方为火山方舟 Agent Plan，模型为 `ark-code-latest`。
- 首轮发送服务端教学引导和六个工具定义；续轮只使用 `previous_response_id` 与匹配的 `function_call_output`。
- 循环最多 4 个模型轮次、3 次工具调用，总时限 90 秒；模型单次请求时限 45 秒。

## 六个白名单工具

| 工具 | 允许能力 | 主要限制 |
|---|---|---|
| `get_context` | 当前分支、提交、Lab、角色、工作区计数和任务状态 | 不返回文件名列表、环境变量或密钥 |
| `read_code` | 读取教学范围内的少量源码行 | 拒绝任意路径、答案文件、教师文件、二进制和超限内容 |
| `get_qemu_events` | 读取当前或最近一次运行的结构化事件 | 最多返回 100 条，不返回完整串口日志 |
| `get_run_result` | 读取构建、QEMU、PASS/TODO 和本地诊断摘要 | 不返回完整日志、路径或评分数据 |
| `get_code_diff` | 比较当前教学代码与固定 starter 基线 | 只读、限制路径/文件数/字节数，隐藏敏感路径和凭据 |
| `run_test` | 启动登记表中的 Lab1–Lab7 starter/solution 测试 | 不接受命令字符串；P0、自定义分支、教师工具和任意测试均不支持 |

交互运行和智能体 `run_test` 共用一个任务锁，同一时间只允许一个构建或 QEMU 任务。分支或提交在请求期间发生变化时，旧请求以 `context_changed` 结束，回答被丢弃。

## 首次同意与云端数据

首次提问前，页面明确告知以下事实并要求勾选同意：

- 学生问题及模型按需调用工具得到的受限源码片段、代码差异、QEMU 结构化事件或运行结果可能发送到火山方舟。
- `store: true` 用于以 `previous_response_id` 续接工具调用；云端保留行为由方舟服务和账号配置决定。
- API Key 只存在于本地桥接器进程的 `ARK_API_KEY` 环境变量中。
- 系统不会发送 API Key、完整终端日志、环境变量、任意文件、教师答案文件或评分记录。
- 同意只记录在当前浏览器会话的 `sessionStorage`，键名为 `os-teaching-agent-consent-v1`。

## 四层数据边界

| 功能 | 数据位置与行为 |
|---|---|
| 确定性诊断、预测、回放、分支比较 | 浏览器与本地桥接器处理，不调用模型 |
| 教学反馈与运行记录提交 | 使用者主动预览并同意后，发送到负责人配置的服务；接收端写入本机 JSONL |
| AI 教学助教 | 问题和模型主动调用工具取得的受限证据发送到火山方舟；密钥仅在服务端环境变量中 |
| 教师评分 | 本地页面管理，不自动上传成绩，不因智能体回答或运行证据自动加分 |

## 配置、启动与关闭

Windows PowerShell：

```powershell
$env:ARK_API_KEY = "在当前终端安全设置的方舟密钥"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-interactive-demo.ps1
```

Ubuntu/Linux：

```bash
export ARK_API_KEY='在当前 shell 安全设置的方舟密钥'
./scripts/start-interactive-demo.sh
```

不要把密钥写入仓库、命令历史、截图或日志。关闭桥接器进程即可停止教学智能体入口；不配置 `ARK_API_KEY` 时，页面仍可完整使用本地预测、运行、规则诊断、回放和分支比较，提问会返回固定的“模型未配置”说明。

## 验收边界

离线自动测试覆盖输入协议、工具策略、上下文变化、任务锁、错误净化、前端同意、长度边界和纯文本渲染。在线验收必须使用具有 Agent Plan 权限的真实密钥，分别验证直接回答、工具调用、受限源码读取、禁止路径、批准测试和上下文变化。未实际完成在线验收时，文档与 PPT 必须标记为“未运行”，不能写成已通过。
