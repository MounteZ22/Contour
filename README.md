# Contour

> 本地优先的 AI 研究工作台 — 把思考、实验与讨论沉淀为结构化的研究脉络，让 AI 在受控的文件访问内协助整理与推进。

Contour 面向科研与深度知识工作者：以 **Markdown + YAML 文件**为唯一数据格式（无数据库、无锁定），以 **Flow 工作单元网络**组织研究过程，并内置一个由 **Pi SDK** 驱动的 Agent，围绕你当前的工作上下文协助阅读、整理与推进。正式记录永远由你确认。

## 现在能做什么

### 研究脉络可视化（ContourMap）
- DAG 自动布局（强连通分量缩点 + 拓扑分层），把 Flow 依赖网络渲染成可浏览的研究路径画布
- Flow 卡片 hover 预览标题 / 状态 / AI 摘要；Claims 与 Flow 可视化关联（徽标 + 置信度色标）
- 在画布上直接新建子 Flow，或选中多个节点加入 Agent 上下文

### Flow 工作区
- 三栏布局：Section 导航 + Markdown 阅读/编辑 + AI 协作入口
- 每个 Flow 拥有自定义 sections、状态（in_progress / done 等）、附件（`attachments/`）与外部链接
- 一键让 Agent 生成 `flow_summary.md`（旧版 `context_summary.md` 仍可读取）

### Agent 对话（Pi SDK 驱动）
- **受控文件访问**：Agent 的文件工具只允许访问当前项目 Vault、附加路径、精确文件与会话工作目录——Prompt 中出现路径不等于获得权限
- **权限三模式**：`readonly`（只读）/ `review`（写操作逐次确认）/ `yolo`（全开放）
- **Plan Mode**：Agent 先调研产出计划，经你审批后再执行
- **AskUser 结构化问答**：单选 / 多选 / 文本输入，嵌入对话流
- **工具调用可视化**：调了什么工具、传入什么、返回什么，按轮次分组，并汇总本轮改动的文件
- **@ 提及上下文**：输入框直接 `@` 引用 Flow / Document 注入 Agent 上下文
- **消息历史恢复**：会话 JSONL 流式解析为可滚动、按轮次分组的历史视图；支持停止生成、重试、自动命名、草稿保存
- **网络检索**：内置 Tavily Web Search（SSRF / DNS / 凭据脱敏防护）

### 扩展与集成
- **MCP 插件**：每个项目独立配置 stdio MCP 服务器，命令白名单 + 逐次确认
- **内置预览**：PDF、Excel 在应用内直接预览
- **多模型渠道**：配置多个 LLM 渠道，每个会话可选模型

## 核心概念

- **Project（项目）** — 一个研究主题对应一个项目，包含 Flows、Documents、Claims 与独立的 Agent 会话。
- **Flow（工作单元）** — 一次实验、一段论证或一个可独立得出结论的认知单元。Flow 之间通过 `parentFlows` 形成依赖网络（DAG），是一条不断分叉、推进的研究路径。
- **Document（背景文档）** — 文献笔记、方法学总结等背景知识，为 Flow 提供"常识层"，在 AI 协作时按需注入。
- **Claim（判断）** — 一个结论性陈述，可关联 Flow 与 Document，带置信度标注；多条 Claims 构成项目的研究主张网络。
- **Agent 会话** — 每个项目下的独立 AI 对话，拥有自己的本地工作目录与消息历史，可在会话中引用 Flow / Document 作为上下文。

所有数据均为普通文件，可直接用 Obsidian、VS Code 或 Git 管理。

## 产品形态

Contour 提供两种使用方式，共享同一套后端、数据目录与 Agent 内核：

| 形态 | 说明 |
|------|------|
| **Web 应用** | 本地运行的 React 前端 + Express 后端（`127.0.0.1:3000` / `:3001`） |
| **Electron 桌面端** | 同一前端 + 进程内嵌的 loopback API 服务器，可打包为 Windows / macOS 安装程序；支持系统托盘、单实例锁、窗口状态记忆 |

## 快速开始

项目使用 npm workspaces monorepo。在仓库根目录安装依赖：

```bash
git clone https://github.com/MounteZ22/Contour.git
cd Contour
npm install
```

### Web 开发

```bash
npm run web:dev   # 同时启动后端(127.0.0.1:3001) + 前端(127.0.0.1:3000)
```

打开 `http://127.0.0.1:3000`。

### 桌面开发 / 打包

```bash
npm run desktop:dev     # 构建并启动 Electron 开发环境
npm run desktop:build   # 生产打包 → apps/desktop/release/
```

### 其他命令

```bash
npm run typecheck       # 全仓类型检查
npm run test            # 全仓测试
npm run build           # 全仓构建
```

## 本地数据

配置目录跟随系统 home：`~/.contour`（生产）/ `~/.contour-dev`（开发）。Vault 数据目录默认：

| 模式 | 默认路径 |
|------|----------|
| 开发 | `~/Contour-dev` |
| 生产 | `~/Contour` |

如需自定义 Vault 路径，编辑 `~/.contour/settings.json`（或 `~/.contour-dev/settings.json`）：

```json
{ "vaultsPath": "你的 vault 路径" }
```

Agent 会话采用双层身份：前端和 API 始终使用稳定的 Contour `sessionId`，Pi SDK 自己的 `sdkSessionId` 只保存在后端 registry 中用于恢复模型上下文。每个会话拥有独立的本地工作目录，不会直接把项目 Vault 作为 Agent cwd。

## 架构

```
npm workspaces monorepo
├── packages/shared   跨端共享类型与聊天契约（纯类型，无运行时依赖）
├── packages/core     业务核心：Agent 运行时(Pi SDK)、services、tools、vault
├── apps/web/backend  Express API 宿主（组合根 createWebHostContext，可多宿主共存）
├── apps/web/frontend React + Vite 前端
└── apps/desktop      Electron 桌面端（主进程内嵌 Express，托盘/IPC/preload）
```

### 技术栈

| 层 | 选型 |
|------|------|
| 前端 | React 19 + Vite + TypeScript + Tailwind v4 + ShadcnUI 风格组件 |
| 路由 / 状态 | React Router v7 + Jotai |
| 虚拟列表 | @tanstack/react-virtual |
| 后端 | Node.js + Express + TypeScript |
| Agent | Pi SDK（`@earendil-works/pi-coding-agent`） |
| MCP | @modelcontextprotocol/sdk（stdio 桥接） |
| 数据 | Markdown + YAML frontmatter + 文件系统（无数据库） |
| 桌面 | Electron 43 + electron-builder |

## 开发

开发环境依赖 Node.js 21+。

- 全仓命令见上方「快速开始」；单包命令使用 `npm run <script> -w <workspace>`（如 `npm run build -w @contour/core`）
- 测试：Vitest，全仓约 400+ 用例
- 类型检查：`npm run typecheck`

## 致谢

Contour 的成长离不开以下开源项目与工具，在此致谢：

- **[Proma](https://proma.cool)** — 本项目绝大部分开发工作（架构讨论、编码、测试与代码审查）都在 Proma 中完成；Proma 的桌面端与 Agent 架构也是 Contour 的重要参考。
- **[Pi SDK](https://github.com/earendil-works/pi)**（`@earendil-works/pi-coding-agent`）— Contour 的 Agent 运行时内核，会话、工具与权限体系均构建于其上。
- **[Cherry Studio](https://github.com/CherryHQ/cherry-studio)** 与 **[Chatbox](https://github.com/Bin-Huang/chatbox)** — 多供应商桌面 AI 产品的产品形态启发。
- **[ShadcnUI](https://ui.shadcn.com/)** — UI 组件风格与设计语言。
- **[TanStack Virtual](https://tanstack.com/virtual)** — 长会话虚拟滚动渲染。

## 贡献

欢迎修 Bug、补文档、加测试、完善体验，也欢迎围绕真实研究场景提交新的 Skills、MCP 配置或 Agent 工作流。

提交 PR 前建议先确认：

- 使用 npm / workspaces，不混用 pnpm / bun lockfile。
- 状态管理使用 Jotai。
- 保持本地优先，优先使用配置文件，不引入本地数据库。
- TypeScript 不使用 `any`，对象结构优先使用 `interface`。
- 新增 IPC 时同步修改 shared 类型、main handler、preload bridge 和 renderer 调用。
- 能用测试覆盖的行为尽量补上测试（Vitest）。

## License

Contour 采用 [GNU Affero General Public License v3.0（AGPL-3.0）](LICENSE) 开源，完整条款见根目录 `LICENSE` 文件。

**个人 / 非商业使用**：自由使用、修改、分发，仅需遵守 AGPL-3.0 条款。

**商业使用**：在完全遵守 AGPL-3.0 条款的前提下允许进行商业使用，包括但不限于：以源代码或修改后的形式分发软件、通过网络对外提供服务时必须公开完整修改源码（含网络交互层）、衍生作品须以 AGPL-3.0 继续授权。

**商业授权（豁免 AGPL-3.0 义务）**：如果你希望将 Contour 集成到闭源产品、对外提供 SaaS 服务但不想公开衍生代码，或其他无法满足 AGPL-3.0 条款的商业场景，请联系维护者（GitHub Issues 或 Discussions）。

向本项目提交 Pull Request 即视为同意将贡献以 AGPL-3.0 及未来商业许可形式授权给项目维护者。
