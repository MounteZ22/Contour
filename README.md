# Contour

Contour 是一个本地优先的科研认知工作台，面向"生化环材"等实验科学领域的研究者。

它的核心定位不是替代研究者，也不是一个全能的 AI agent 平台，而是：

> 帮助研究者把每次实验、表征、数据分析、文献论证和讨论中形成的判断、证据、不确定性与失败路径，沉淀为结构化的 flow、claim、uncertainty 和 data asset。AI 围绕当前 flow 协助整理、改写和讨论，但所有正式记录必须经过用户确认。

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

- **已验证**：Markdown/YAML vault 结构、flow/claim/asset 对象模型、context_summary 注入策略
- **进行中**：Step 1 — 构建基于 TypeScript + React 的本地 Web 应用，实现 vault 的只读浏览
- **后续**：AI Chat Panel、Context Builder、Draft Review、Electron 打包

## 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | Vite + React 19 + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express + TypeScript |
| 数据 | Markdown + YAML + 文件系统（无数据库） |
| Markdown | gray-matter + react-markdown |

旧版 Python CLI 代码保留在 `contour/` 目录下作为参考实现，但不再维护。

## 快速开始

> 待 Step 1 完成后补充

## 核心设计原则

- **以知识结构为中心**，不是以 AI 为中心
- **激活人，而不是替代人** — AI proposal → user review → formal record
- **失败路径是一等公民** — 保存被排除方案、异常数据、无法解释的现象
- **渐进式披露** — AI 协作默认注入 flow summary，细节按需读取
- **文件优先于数据库** — vault 可直接用 Obsidian、VS Code、Git 管理

## 文档

- [docs/contour_development_direction.md](docs/contour_development_direction.md) — 产品方向与架构原则
- [docs/dev_journal/design-decisions.md](docs/dev_journal/design-decisions.md) — 关键设计决策记录
- [example_vault/](example_vault/) — 样例 vault 结构（设计验证基准）

## 说明

这个仓库仍处于成形阶段。随着真实使用推进，结构、模板和工作流大概率会继续变化。
