# Context Pack 格式规范

## 生成位置

`context_packs/{YYYY-MM-DD}_{task_short_name}.md`

## 用途

Context Pack 是一次具体 AI 协作前生成的**上下文包**。它不是万能 prompt，而是一个可追踪、可审阅的研究上下文摘要。

## 生成方式

由 Context Builder 界面（Step 4 实现）根据用户选择自动生成。后端根据以下输入组装：

- 当前任务描述（用户输入）
- 选择的 background docs
- 选择的 cycle summaries
- 选择的 claims
- 选择的 assets
- 已知的不确定性列表

## 输出格式

```markdown
# Current Task

{task_description}

## Project Background

{project_brief 摘要}

## Selected Cycle Summaries

### {cycle_id} {cycle_title}

{cycle_summary}

## Selected Claims

### {claim_id} (status: {status}, confidence: {confidence})

{claim_content}

## Selected Data Assets

- `{asset_id}` | type: `{type}` | format: `{format}` | path: `{path}`
  {description}
  AI access: readable={readable}, analyzable={analyzable}, editable={editable}

## Known Uncertainties

### {source}

{uncertainty_text}

## Instructions for the Agent

{user-provided instructions}

## Expected Output Format

{user-provided output format}

## What details can be read on demand

- {cycle_id} full sections: 如需完整 cycle 细节，可读取 `cycles/{cycle_id}/`
- {asset_path}: 如需原始数据，可读此文件
```

## 关键原则

1. **渐进式披露**：默认注入 cycle summary，而非完整 cycle detail
2. **不确定性前置**：明确标注已知的不确定性，防止 AI 过度推断
3. **可追踪**：context pack 文件名包含日期，便于追溯
4. **用户可控**：用户明确选择哪些内容进入 context pack，不做自动推荐
