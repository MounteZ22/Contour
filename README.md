# Contour

> 本地优先的认知工作台 —— 把思考、实验与讨论沉淀为结构化的研究脉络。

## 这是什么

Contour 帮助你将工作过程中的判断、证据、不确定性与失败路径，沉淀为可追溯、可协作的结构化知识。

大多数知识工作不是线性的：一次实验、一组数据、一场讨论、一个被排除的假说 —— 这些碎片化的认知需要被记录、被关联、被追溯。Contour 用 **Flow** 来组织你的工作单元，每个 Flow 包含自定义的 sections、判断与证据的记录、以及未解问题的追踪。AI 围绕你当前的工作上下文协助整理与讨论，但所有正式记录必须经过你的确认。

## 为谁而做

任何需要**结构化记录认知过程、追溯判断来源、协作沉淀知识**的工作场景：

- 实验研究与数据分析 — 记录每次实验的假设、观察、结论和未解问题
- 文献综述与理论建构 — 追踪观点来源、证据链和推理过程
- 团队知识管理 — 多人协作时维护共享的认知图谱，而非散落在聊天记录里的碎片信息
- 个人知识库 — 将零散笔记转化为可追溯、可复用的结构化知识

## 核心概念

### Flow（工作单元）

一个可独立产出判断或结论的认知单元。它可以是：
- 一次实验或数据分析
- 一段文献论证或理论推导
- 一次讨论或决策记录

每个 Flow 包含：
- **用户自定义的 sections** — 如方法、结果、讨论、下一步（不限定结构）
- **判断与证据的记录** — 形成什么结论、基于什么证据、置信度如何
- **不确定性追踪** — 未解问题、被排除的方案、无法解释的现象
- **`context_summary.md`** — 向 AI 提供当前最相关的工作上下文

### Document（背景文档）

沉淀的背景知识 —— 文献笔记、方法学总结、参考材料等。Document 为 Flow 提供"常识层"支撑，在 AI 协作时按需注入。

### 两者的关系

```
Project（一个项目）
├── Flows（工作单元网络，可形成父子/依赖关系）
│   ├── F001 初步探索
│   ├── F002 条件优化（基于 F001）
│   └── F003 验证实验（基于 F002）
└── Documents（背景文档库）
    ├── 技术综述
    └── 方法学参考
```

## 产品形态

Contour 是一个本地运行的 Web 应用，包含三个核心页面：

| 页面 | 功能 |
|------|------|
| **Dashboard** | 项目列表 + 工作推进轮廓（ContourMap 节点画布） |
| **Flow Workspace** | 三栏布局：Section 导航 + Markdown 阅读/编辑 + AI 协作面板 |
| **Background Library** | 背景文档的阅读与管理 |

所有数据以 Markdown + YAML frontmatter 的形式保存在本地文件系统中，你可以直接用 Obsidian、VS Code 或 Git 来管理。

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/MounteZ22/Contour.git
cd Contour

# 启动后端 (port 3001)
cd contour-web/backend
npm install
npm run dev

# 另起一个终端，启动前端 (port 3000，自动代理 API 到后端)
cd contour-web/frontend
npm install
npm run dev
```

打开 `http://localhost:3000`，Vault 数据默认读取 `D:\Contour`（Windows）或 `~/Contour`（macOS/Linux）。

首次启动会自动创建该目录。如需自定义路径，编辑 `~/.contour/settings.json`：

```json
{ "vaultsPath": "你的 vault 路径" }
```

## 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | Vite + React 19 + TypeScript + Tailwind v4 |
| 路由 | React Router v7 |
| 状态管理 | Jotai（仅主题状态） |
| 后端 | Node.js + Express + TypeScript |
| 数据 | Markdown + YAML frontmatter + 文件系统（无数据库） |
| Markdown | react-markdown + remark-gfm |

## 核心设计原则

- **以知识结构为中心**，不是以 AI 为中心
- **激活人，而不是替代人** — AI proposal → user review → formal record
- **失败路径是一等公民** — 保存被排除方案、异常数据、无法解释的现象
- **渐进式披露** — AI 协作默认注入 flow summary，细节按需读取
- **文件优先于数据库** — vault 可直接用 Obsidian、VS Code、Git 管理

## License

MIT
