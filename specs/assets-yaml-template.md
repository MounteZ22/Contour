# Assets YAML 规范

## 文件位置

`flows/{flow_id}_{short_title}/assets.yaml`

## 用途

定义与当前 flow 关联的数据资产（文件）。每个 flow 可以有自己的 assets.yaml，也可以有全局的 `indexes/asset_index.yaml`（Step 1 暂不实现全局索引）。

## 格式

```yaml
assets:
  - id: DA_001                      # 必须，唯一标识符
    type: processed_data            # 必须。示例：processed_data, raw_data, plot, script, model_output
    format: csv                     # 必须。示例：csv, xlsx, png, pdf, py, ipynb
    path: data/processed/data.csv   # 必须，相对路径（相对于 flow 目录或 vault 根目录）
    description: "描述该文件的内容和用途"
    role: primary_evidence          # 可选。示例：primary_evidence, supplementary, method_reference
    generated_in: F001              # 可选，生成该资产的 flow ID
    used_for:                       # 可选，该资产被哪些 claim/figure 使用
      - CLM_001
      - FIG_001
    source_data:                    # 可选，该资产基于哪些原始数据
      - DA_000
    generated_by: scripts/process.py # 可选，生成该资产的脚本路径
    ai_access:                      # 可选，AI 权限控制
      readable: true
      analyzable: true
      editable: false
```

## 路径规则

- 使用**相对路径**，相对于 flow 目录或 vault 根目录
- 禁止绝对路径（如 `C:\Users\...`）
- 资产文件应真实存在于 vault 目录下
