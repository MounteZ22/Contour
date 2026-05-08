# Claim 文件规范

## 文件位置

`claims/{claim_id}.md`

## 用途

Claim 是从 cycle 中抽取出的**可复用判断资产**。它独立存在，不埋在 cycle 里，可以被多个 cycle 引用和更新。

## Frontmatter 字段

```yaml
---
claim_id: CLM_001                 # 必须，唯一标识符
status: active                     # 可选，默认 tentative。可选值：tentative, active, revised, weakened, superseded, rejected
confidence: medium                 # 可选，默认 low。可选值：low, medium, high
created_in: C002                   # 可选，首次创建该 claim 的 cycle ID
updated_in: []                     # 可选，后续更新该 claim 的 cycle ID 数组
supported_by: []                   # 可选，支持该 claim 的 cycle/asset ID 数组
opposed_by: []                     # 可选，反对该 claim 的 cycle/asset ID 数组
related_assets: []                 # 可选，关联 asset ID 数组
tags: []                           # 可选，标签数组
---
```

## Markdown 正文

```markdown
# {claim_id} {title}

## Claim

用一句话清晰陈述该判断。

## Supporting evidence

- 支持证据 1
- 支持证据 2

## Opposing evidence

- 反对证据或反面观察

## Uncertainty

明确标注该 claim 的不确定性边界。

## Recommended wording

在论文或报告中引用该 claim 时建议使用的措辞。

## Avoid wording

可能过度推断或不准确的措辞，应避免使用。
```
