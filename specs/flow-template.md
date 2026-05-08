# Flow 文件规范

## 文件位置

`flows/{flow_id}_{short_title}/flow.md`

## 用途

flow.md 是 flow 的**主记录文件**，包含：
- YAML frontmatter：定义 flow 的元信息
- Markdown 正文：flow 的主内容（会被解析为一个 section，id 为 `"flow"`）

用户可以在 flow 目录下自由添加额外的 `.md` 文件作为独立 section，但 `flow.md` 始终是该 flow 的核心记录。

## Frontmatter 字段

```yaml
---
flow_id: F001                     # 必须，唯一标识符
title: "Short descriptive title"   # 必须
status: in_progress               # 可选，默认 in_progress。可选值：planned, in_progress, completed, archived, abandoned
type: "experiment"                # 可选，默认 general。用户自定义，如：experiment, analysis, literature_review, discussion, failed_route
stage: "data_analysis"            # 可选，用户自定义研究阶段标签
created: "2026-04-20"             # 可选，ISO 日期
updated: "2026-04-21"             # 可选，ISO 日期
parent_flows: []                  # 可选，父 flow ID 数组
related_claims: []                # 可选，关联 claim ID 数组
related_assets: []                # 可选，关联 asset ID 数组
tags: []                          # 可选，标签数组
open_uncertainties: []            # 可选，开放不确定性描述数组
---
```

## Markdown 正文

正文没有强制结构，用户自由撰写。以下是**参考结构**（不是强制）：

```markdown
# {flow_id} {title}

## Overview

简要说明本 flow 的目的和背景。

## Inputs

- 输入数据
- 前置条件
- 引用的前期 flow

## What was done

具体做了什么实验/分析/讨论。

## Key observations

观察到的关键现象或数据模式。

## Interpretation

对观察结果的解释和推断。

## Decision / Conclusion

基于本 flow 形成的判断或决策。

## Uncertainties

明确标注尚未解决的不确定性。

## Next steps

后续计划或待验证假设。
```

## 关于 section 的灵活性

**Flow 目录下的任何 `.md` 文件（除 `context_summary.md` 外）都会被解析为一个 section。**

用户可以根据研究需要自由创建 section 文件，不强制使用上述结构。例如：

- `methods.md` — 详细实验方法
- `results.md` — 结果数据
- `discussion.md` — 讨论
- `literature_notes.md` — 文献笔记
- `failed_attempts.md` — 失败尝试记录
- `mentor_feedback.md` — 导师反馈

文件名即为 section ID（去掉 `.md`），排序按文件名字母顺序。
