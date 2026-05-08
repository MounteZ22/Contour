import type { ContourAppData } from '../types';

export const mockAppData: ContourAppData = {
  projects: [
    {
      projectId: 'PRJ_001',
      title: '膜通量衰减研究',
      researchGoal:
        '理解膜表面改性如何改变FGDW中的通量衰减行为，同时保留不确定性和措辞约束。',
      currentStage: '已完成初步框架构建和一次数据分析研究流。',
      docs: [
        {
          id: 'project_brief',
          title: '项目概要',
          type: 'project_overview',
          summary: '当前项目阶段、证据立场和AI协作目标的共同认知基准。',
          content: `# 项目概要

本仓库追踪一项膜蒸馏研究项目，聚焦于复杂废水条件下的通量衰减行为。

## 研究目标

理解膜表面改性如何改变通量衰减行为，以及如何谨慎地讨论这种解释。

## 当前阶段

项目已完成早期框架构建和一次数据分析研究流。当前需求是让未来的AI协作者了解现有证据、不确定性和措辞约束。`,
        },
        {
          id: 'research_questions',
          title: '研究问题',
          type: 'question_set',
          summary: '阅读和讨论结果时应始终关注的两个核心问题。',
          content: `# 研究问题

- 如何在不过度推断机理的情况下框架化通量衰减差异？
- 哪些观察结果足够强，可以提升为可复用的论断？`,
        },
        {
          id: 'terminology',
          title: '术语表',
          type: 'glossary',
          summary: '帮助界面使用项目自身语言的小型词汇表。',
          content: `# 术语表

- FGDW：烟气脱硫废水（flue gas desulfurization wastewater）
- 研究流（Flow）：一次有意义的研究循环或事件
- 论断（Claim）：带有明确不确定性的可复用研究判断`,
        },
        {
          id: 'system_definition',
          title: '系统定义',
          type: 'background',
          summary: '定义实验系统和最重要的解释风险。',
          content: `# 系统定义

实验系统比较改性PVDF膜变体在复杂废水进料条件下的表现，关注污染、结垢和解释风险。`,
        },
      ],
      flows: [
        {
          flowId: 'F001',
          title: 'FGDW膜行为框架构建',
          status: 'completed',
          type: 'literature_review',
          created: '2026-04-20',
          updated: '2026-04-21',
          parentFlows: [],
          linkedClaims: ['CLM_001'],
          tags: ['框架构建', '背景'],
          openUncertainties: ['框架工作尚未解决机理问题。'],
          summary:
            '为后续分析设定了措辞护栏：将观察、解释和不确定性清晰分离。',
          sections: [
            {
              id: 'flow',
              title: '研究流概览',
              filename: 'flow.md',
              content: `# F001 FGDW膜行为框架构建

## 1. 本研究流的目的

在更深入的数据解释工作开始之前，明确如何在FGDW中框架化膜性能差异。

## 2. 输入

- 前期项目笔记
- 文献比较表

## 3. 所做工作

总结了已知的行为模式和后续分析研究流的措辞约束。

## 4. 关键观察

FGDW运行条件容易在证据不足时模糊污染和结垢的解释。

## 5. 解释

任何关于机理的后续论断都应明确保留未解决的不确定性。

## 6. 决策

后续研究流应将观察、解释和措辞指导分离。

## 7. 不确定性

框架工作尚未解决机理问题。

## 8. 下一步

审阅通量衰减数据时应用此框架。

## 9. 链接

- 参见 \`context_summary.md\`
- 参见 \`assets.yaml\``,
            },
            {
              id: 'background_notes',
              title: '背景笔记',
              filename: 'background_notes.md',
              content: `# 背景笔记

本节收集为非正式背景阅读和初步观察，为框架构建工作提供了信息。

## 关键文献主题

- FGDW中的膜污染经常被报道，但很少系统比较不同改性策略。
- 极性界面改性（如胺基）倾向于提高有机物截留率，但可能增加无机结垢敏感性。
- 许多研究中"污染"和"结垢"的区别是操作性的而非机理性的。

## 前期数据的初步观察

早期的未处理通量数据暗示了一个模式：PA改性膜在高盐度进料下比未改性对照组表现出更陡峭的衰减斜率。当时未进行统计分析。

## 进入下一研究流的开放问题

1. 表观通量衰减是否真正由表面改性引起，还是混淆的进料化学效应？
2. 区分有机与无机贡献需要哪些表征数据？`,
            },
          ],
        },
        {
          flowId: 'F002',
          title: 'FGDW中PA-PVDF通量衰减分析',
          status: 'completed',
          type: 'data_analysis',
          created: '2026-04-24',
          updated: '2026-04-26',
          parentFlows: ['F001'],
          linkedClaims: ['CLM_001'],
          tags: ['通量衰减', 'FGDW'],
          openUncertainties: [
            '当前数据集无法区分有机污染、无机结垢和混合污染。',
          ],
          summary:
            '比较了处理后的通量曲线，仅推进了一个谨慎的论断：改性界面在复杂进料条件下可能增加敏感性。',
          sections: [
            {
              id: 'flow',
              title: '研究流概览',
              filename: 'flow.md',
              content: `# F002 FGDW中PA-PVDF通量衰减分析

## 1. 本研究流的目的

解释PA-PVDF在FGDW中观察到的更强通量衰减模式。

## 2. 输入

- 比较处理后的通量数据
- F001的框架指导

## 3. 所做工作

比较了处理后的通量曲线，总结了最可辩护的解释。

## 4. 关键观察

PA-PVDF在处理后的数据集中表现出比比较膜更强的衰减。

## 5. 解释

当前解释是：改性界面在复杂进料条件下可能增加对沉积的敏感性。

## 6. 决策

推进一个谨慎的可复用论断，保留机理未解决。

## 7. 不确定性

当前数据集无法区分有机污染、无机结垢和混合污染。

## 8. 下一步

在AI讨论中使用当前解释，但推动模型保留不确定性。

## 9. 链接

- 参见 \`context_summary.md\`
- 参见 \`assets.yaml\``,
            },
            {
              id: 'data_summary',
              title: '数据摘要',
              filename: 'data_summary.md',
              content: `# 数据摘要

本节总结了用于通量衰减比较的处理数据集。

## 数据集概览

- **比较的膜**：C-PVDF、PA-PVDF、PVA-PVDF
- **进料水**：FGDW（模拟烟气脱硫废水）
- **运行条件**：错流、25°C、0.5 MPa TMP
- **持续时间**：12小时连续过滤
- **关键指标**：归一化通量衰减速率（%/h）

## 处理结果

| 膜 | 初始通量 (LMH) | 衰减速率 (%/h) | 最终通量 (LMH) |
|----------|-------------------|-------------------|-----------------|
| C-PVDF | 45.2 | 0.8 | 40.9 |
| PA-PVDF | 44.8 | 1.6 | 36.2 |
| PVA-PVDF | 46.1 | 1.1 | 40.0 |

## 显著模式

PA-PVDF在相同运行条件下表现出约**2倍更高的衰减速率**。PVA-PVDF居中。

## 原始数据位置

- \`data/processed/fgdw_flux_summary.csv\`（链接在assets.yaml中）

## 初步统计说明

衰减速率差异视觉上明显，但尚未进行正式统计检验。在将任何论断提升为"活跃"状态之前应解决此问题。`,
            },
          ],
        },
      ],
      claims: [
        {
          claimId: 'CLM_001',
          title: 'PA-PVDF在FGDW中可能更容易发生沉积或混合污染',
          content:
            '在FGDW中，改性界面可能更容易发生沉积或混合污染，导致比比较膜更强的通量衰减。',
          confidence: 'medium',
          status: 'active',
          uncertainty:
            '当前证据无法分离单一机理，不应被视为确定性的结垢证明。',
          recommendedWording:
            '"PA-PVDF在FGDW中可能更容易发生沉积或混合污染。"',
        },
      ],
    },
    {
      projectId: 'PRJ_002',
      title: '纳米塑料对水生生态系统的影响评估',
      researchGoal:
        '系统评估不同粒径纳米塑料对淡水藻类光合作用和细胞完整性的影响，建立剂量-效应关系。',
      currentStage: '文献综述阶段，正在设计预实验方案。',
      docs: [
        {
          id: 'project_brief',
          title: '项目概要',
          type: 'project_overview',
          summary: '纳米塑料生态毒理学研究项目的总体目标和范围定义。',
          content: `# 项目概要

本项目研究纳米塑料（NPs）对淡水生态系统中初级生产者（藻类）的潜在影响。

## 研究目标

建立纳米塑料粒径、浓度与藻类光合抑制之间的剂量-效应关系，并探索可能的毒性机理。`,
        },
        {
          id: 'terminology',
          title: '术语表',
          type: 'glossary',
          summary: '项目特有的术语和缩写定义。',
          content: `# 术语表

- NPs：纳米塑料（nanoplastics），粒径 < 1 μm
- PS-NPs：聚苯乙烯纳米塑料
- Fv/Fm：最大光化学量子产量，光合作用效率指标
- ROS：活性氧（reactive oxygen species）`,
        },
      ],
      flows: [
        {
          flowId: 'F001',
          title: '纳米塑料文献系统综述',
          status: 'in_progress',
          type: 'literature_review',
          created: '2026-05-01',
          updated: '2026-05-06',
          parentFlows: [],
          linkedClaims: [],
          tags: ['文献综述', '纳米塑料', '藻类毒性'],
          openUncertainties: [
            '不同研究使用的NPs表征方法差异很大，难以直接比较。',
          ],
          summary:
            '系统梳理了2018-2026年间纳米塑料对藻类影响的研究，发现粒径效应存在矛盾报道。',
          sections: [
            {
              id: 'flow',
              title: '研究流概览',
              filename: 'flow.md',
              content: `# F001 纳米塑料文献系统综述

## 1. 本研究流的目的

系统梳理现有文献中纳米塑料对淡水藻类影响的研究现状，识别关键知识空白。

## 2. 关键发现

- 多数研究显示PS-NPs对藻类有抑制作用，但EC50差异极大（1-1000 mg/L）
- 粒径越小毒性越强的趋势存在，但50 nm vs 100 nm的结果矛盾
- 光照条件显著影响NPs的聚集行为和生物可利用性`,
            },
          ],
        },
      ],
      claims: [],
    },
  ],
};
