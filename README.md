# Contour

Contour 是一个本地优先的科研认知工作台，面向"生化环材"等实验科学领域的研究者。

它的核心定位不是替代研究者，也不是一个全能的 AI agent 平台，而是：

> 帮助研究者把每次实验、表征、数据分析、文献论证和讨论中形成的判断、证据、不确定性与失败路径，沉淀为结构化的 flow、claim 和 document。AI 围绕当前 flow 协助整理、改写和讨论，但所有正式记录必须经过用户确认。

## 产品形态

Flow-based research workspace for human-AI scientific collaboration.

```
一个 research project
→ 多个 research flows
→ 每个 flow 内有用户自定义的 sections
→ AI 围绕当前 project / flow / section / selected text 协作
```

## 当前状态

Contour 正处于从概念原型转向可交互产品的阶段。

- **已完成**：Markdown + YAML vault 结构、vault 文件系统扫描器、Project / Flow / Document CRUD API
- **已完成**：React 前端 — 项目仪表盘、Flow 工作区（阅读 / 编辑 / 增删 section）、Background 文档阅读
- **进行中**：AI Chat Panel、Context Builder、Draft Review
- **后续**：Electron 桌面打包

## 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | Vite + React 19 + TypeScript + react-router-dom |
| 后端 | Node.js + Express + TypeScript |
| 数据 | Markdown + YAML frontmatter + 文件系统（无数据库） |
| Markdown | gray-matter + react-markdown |

## 快速开始

```bash
# 后端 (port 3001)
cd contour-web/backend
npm install
npm run dev

# 前端 (port 3000，自动代理 API 到后端)
cd contour-web/frontend
npm install
npm run dev
```

打开 `http://localhost:3000`，Vault 数据默认读取 `D:\Contour`。

首次启动会自动创建该目录。如需自定义路径，编辑 `~/.contour/settings.json`：
```json
{ "vaultsPath": "你的 vault 路径" }
```

## 核心设计原则

- **以知识结构为中心**，不是以 AI 为中心
- **激活人，而不是替代人** — AI proposal → user review → formal record
- **失败路径是一等公民** — 保存被排除方案、异常数据、无法解释的现象
- **渐进式披露** — AI 协作默认注入 flow summary，细节按需读取
- **文件优先于数据库** — vault 可直接用 Obsidian、VS Code、Git 管理
