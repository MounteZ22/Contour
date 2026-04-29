# Contour

Contour 是一个仍处于早期阶段的本地研究上下文整理工具，面向的是“在与外部 AI 协作之前，先把研究局面组织清楚”这件事。

它的目标不是替代研究者，也不是一开始就做成一个完整的 agent 平台。当前想解决的问题更基础，也更实际：

> 帮助研究者把项目背景、研究 cycle、阶段性 claim、相关证据和不确定性整理进一个结构化 vault，再按具体任务生成一个可以交给外部 AI 使用的 context pack。

简单说，Contour 关注的是 AI 协作里最容易先出问题的那一段：

- 人脑里有完整的课题背景
- AI 只看到了一个狭窄 prompt
- 之前做过的判断、失败路径和不确定性没有被带进去

Contour 想用一种轻量的 Markdown / YAML 工作流，尽量缩小这个落差。

## 这个项目现在在做什么

在当前阶段，Contour 聚焦的是一个小而完整的核心 loop：

1. 维护一个本地 research vault
2. 存放项目背景、cycle 记录、claims 和相关 assets
3. 校验 vault 的结构和引用是否合理
4. 为某个具体任务生成 context pack
5. 把这个 pack 交给外部 AI 做讨论、分析或起草


从长期看，Contour 仍然可能继续发展出更丰富的能力，例如本地 GUI、与现有 agent 系统的结合，或者更强的上下文编排与协作机制。但在当前阶段，重点仍然是先把小核心做好。

## 当前状态

Contour 目前仍然是一个很早期的原型。

当前里程碑是一个 CLI-first 的基础版本，已经实现了 3 个命令：

- `contour init`
- `contour validate`
- `contour build-context`

## 先这些路径

- [example_vault](example_vault)：样例 research vault
- [contour/cli.py](contour/cli.py)：CLI 入口
- [contour/validators.py](contour/validators.py)：vault 校验逻辑
- [contour/context_builder.py](contour/context_builder.py)：context pack 生成逻辑
- [README-en.md](README-en.md)：英文版简介

## 快速开始

使用 `uv`：

```bash
uv venv
uv pip install -e .[dev]
```

使用普通 `pip`：

```bash
python -m pip install -e .[dev]
```

校验样例 vault：

```bash
python -m contour validate .\example_vault
```

生成一个 context pack：

```bash
python -m contour build-context ^
  --vault .\example_vault ^
  --task "Discuss the interpretation of PA-PVDF flux decline in FGDW" ^
  --cycles C001 C002 ^
  --claims CLM_001 ^
  --assets DA_001 DA_002
```

## 当前设计方向

这个项目目前遵循几个比较朴素的原则：

- context 优先于 agent 能力炫技
- 文件优先于数据库
- 人工确认优先于自动记忆
- 小核心先于大平台

这些原则以后可能会调整，但在当前阶段，它们是帮助项目避免失控扩张的重要护栏。

## 说明

这个仓库还处在成形阶段。随着真实使用推进，里面的结构、模板和工作流大概率还会继续变化。
