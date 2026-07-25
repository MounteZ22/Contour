# Contour Phase 2 工作规划

> 日期: 2026-07-25
> 前置: Phase 1 Foundation 已完成并合并到 main
> 状态: 待讨论和排期

---

## 一、Phase 1 回顾

Phase 1 完成了基础架构搭建：Agent 运行时封装、SSE 流式传输、会话持久化、安全文件工具、附加文件管理、前端聊天骨架。Agent 已经"能跑"，但从产品视角还只是 MVP 级的骨架。

### 已具备的能力

- 基本的发消息 / 流式回复 / 重试
- 会话持久化，按项目隔离
- 文件树浏览 + 附加文件管理
- 三模式权限骨架（readonly / review / yolo）
- 7 层分层 system prompt
- Flow/Doc/Claim 的上下文注入

### 明显的缺失

- 没有模型选择器
- 没有 Thinking 过程展示
- 没有工具调用的可视化
- 没有任务进度追踪
- Agent 没有 Web 搜索能力
- 用户消息发送才建 session（当前点 Agent 就建）

---

## 二、关于 .context/ 体系：我的判断是不要照搬 Proma

之前的 agent 参考 Proma 设计了 `.context/` 双层目录（会话级 todo.md/plan/ + 工作区级 note.md）。你提到体感上用得不多，我也有同感。

### 为什么 Contour 不应该照搬 Proma 的 .context/

| Proma | Contour |
|-------|---------|
| 通用 Agent 工作台，没有领域模型 | 有 **Flow / Doc / Claim** 三级结构化知识体系 |
| Agent 需要一个地方写 todo/note 来追踪进度 | Agent 的产出应该写进 **Flow Section**，而非游离的 markdown |
| 跨会话记忆靠 .context/note.md | 跨会话记忆应该靠 **Flow/Doc 本身**（它们就是持久化的） |
| 任务追踪靠 todo.md | 任务追踪可以靠 **Flow 状态机**（in_progress → completed） |

### Contour 独特的 Agent-知识交互模式

Contour 的设计哲学是：**Agent 不是独立的研究者，而是 Flow/Doc/Claim 的协作者**。用户通过 Contour Map 选中要讨论的 Flow 和 Doc → Agent 围绕这些结构化知识展开工作 → Agent 的产出写回 Flow Section。

这意味着：
- **不需要 .context/note.md**：Agent 的分析和产出直接写入对应 Flow 的 Section
- **不需要 .context/todo.md**：任务进度通过 Flow 状态和 Section 内容表达
- **可能需要的是**：Agent 对项目的"操作手册"（CLAUDE.md），记录项目约定、常用命令、架构边界

### 建议：保留 CLAUDE.md，去掉 .context/

| 保留 | 原因 |
|------|------|
| ✅ 工作区级 CLAUDE.md | 记录项目规则、架构边界、常用命令。Agent 跨会话维护。简洁（<200行）。 |
| ❌ .context/todo.md | Contour 的任务追踪通过 Flow 状态机实现 |
| ❌ .context/note.md | 分析笔记写入 Flow Section |
| ❌ .context/plan/ | 计划可以写成 Doc 或 Flow |

**CLAUDE.md 的值**：告诉 Agent"这个项目是什么、有哪些规则、怎么操作"。它不替代 Flow/Doc/Claim，而是 Agent 的行动手册。

---

## 三、Agent 界面功能补齐（参考 Proma）

Proma 有 52 项 Contour 没有的功能。但不是全部都要——很多是 Electron 专属的（文件拖拽、语音输入、工作区选择器），或是过度设计的。以下是我筛选出对 Contour **真正重要**的功能，按优先级排列：

### 第一优先（本轮必做）

| 功能 | 理由 | 难度 |
|------|------|------|
| **模型选择器** | 用户最基本的控制权。当前后端固定模型，用户没法选 | 中 |
| **Thinking 折叠展示** | 用户想知道 Agent "在想什么"，但不希望占满屏幕。折叠是最佳实践 | 中 |
| **工具调用可视化** | 当前工具调用只有一行文字。用户需要看到：调了什么工具、参数是什么、产出是什么 | 中 |
| **用户发消息才建 session** | 当前点 Agent 就建空 session。改成 ChatGPT 式：输入框居中 → 发第一条 → 建 session → 输入框移到底部 | 低 |
| **停止生成按钮** | 当前没有停止按钮（或不好找）。Agent 跑偏时用户需要一个明显的刹车 | 低 |
| **消息操作：复制** | 基本功能 | 低 |

### 第二优先（尽快做）

| 功能 | 理由 | 难度 |
|------|------|------|
| **任务进度展示** | 参照 Proma 的 TaskProgressOverlay：底部浮层显示当前 turn 的任务完成情况。Agent 用 TaskCreate/TaskUpdate 工具时，前端实时展示 | 高 |
| **Turn 分组 + 文件改动汇总** | 每次对话轮次（user → assistant 工具链 → 最终回复）分组展示，底部显示本轮改了什么文件 | 中 |
| **错误信息优化** | 当前错误只是红字。需要：可重试/不可重试的区分、错误原因的中文解释、重试按钮 | 低 |
| **会话重命名** | 当前会话标题是自动生成的，用户可能需要改名 | 低 |
| **输入框草稿保存** | 用户切走再回来，输入框内容不丢 | 低 |

### 第三优先（后续迭代）

| 功能 | 理由 | 难度 |
|------|------|------|
| 输入框 @ 提及文件 | 类似 Proma 的 MentionList，输入 @ 弹出文件建议，方便引用 Flow/Doc | 高 |
| Plan Mode（计划模式） | Agent 先调研再执行，产出计划给用户审批。对科研场景特别有价值 | 高 |
| 权限内联横幅 | 当前权限弹窗体验不好。改为嵌入对话流的横幅（允许/拒绝/记住） | 中 |
| AskUser 交互问答 | Agent 向用户提问时的结构化问答 UI（单选/多选/文本输入） | 中 |
| 富文本输入框 | 当前纯 textarea。支持基本格式和 @ 提及 | 高 |

---

## 四、Pi 生态集成（快速提升 Agent 能力）

Pi 生态有 4,975 个 package。以下几个对 Contour 有直接价值：

### 立即安装（Phase 2 必做）

#### ⭐ pi-web-access — Web 搜索 + 论文下载

- 128K 月下载量，MIT 许可
- 提供 `web_search`（多 provider：OpenAI/Exa/Brave/Tavily）+ `fetch_content`（URL 内容提取）
- **零代码改动**：通过 Pi SDK 的 customTools 注入即可
- 科研场景核心能力：论文检索、文献调研、代码仓库分析

#### ⭐ pi-mcp-adapter — MCP 协议适配

- 109K 月下载量，MIT 许可
- 让 Contour Agent 能连接外部 MCP 服务器（如 Zotero 文献管理、数据库查询）
- 200 token 的代理工具替代数百个 MCP 工具
- 配置格式标准（mcp.json），可与 Proma 共享

### 近期评估（Phase 2 后半段）

| Package | 用途 | 评估要点 |
|---------|------|---------|
| **pi-hermes-memory** | 长期记忆（跨会话学习） | 15K/mo。两层架构（Markdown + SQLite）。对科研场景：让 Agent 记住项目约定和用户偏好 |
| **@gotgenes/pi-permission-system** | 更强的权限系统 | 21K/mo。fail-closed 设计 + 通配符匹配。可作为 Contour 权限系统的升级参考 |

### 远期关注（Phase 3+）

| Package | 用途 |
|---------|------|
| **pi-subagents** | 多 Agent 协作（101K/mo）。科研场景：数据分析 Agent + 文献检索 Agent 并行 |
| **@quintinshaw/pi-dynamic-workflows** | 大规模并行 Agent + 确定性重放（可重复科研） |

---

## 五、分阶段计划

### Phase 2A：Agent 体验基础（约 1 周）

```
目标：让 Agent 界面像一个正常的产品

□ 模型选择器（输入框旁下拉）
□ Thinking 折叠展示
□ 工具调用可视化（语义短语 + 展开查看结果）
□ 用户发消息才建 session
□ 停止生成按钮
□ 消息复制按钮
□ 会话重命名
□ 输入框草稿保存
□ 错误信息优化（可重试/不可重试 + 中文解释）
```

### Phase 2B：Agent 能力升级（约 1 周）

```
目标：Agent 真正"有用"

□ 安装 pi-web-access（Web 搜索 + 论文下载）
□ 安装 pi-mcp-adapter（MCP 协议支持）
□ 调研 pi-hermes-memory（长期记忆方案评估）
□ CLAUDE.md 机制建立（Agent 维护项目知识）
□ Task 追踪体系（TaskCreate/TaskUpdate 工具 + 前端 TaskProgressOverlay）
```

### Phase 2C：交互深度（约 1-2 周）

```
目标：Agent 成为真正的协作者

□ Turn 分组 + 文件改动汇总
□ 权限内联横幅（替代弹窗）
□ AskUser 交互问答
□ 输入框 @ 提及 Flow/Doc
□ Plan Mode MVP（Agent 先调研再执行）
□ 全站 loading/skeleton 状态
```

---

## 五、与现有 TODO 的对照

| 原 TODO 项 | 本规划 | 说明 |
|-----------|--------|------|
| agent running 状态显示 | Phase 2A 工具调用可视化 + 2B TaskProgressOverlay | 扩展到完整的任务进度体系 |
| 用户发消息才建 session | Phase 2A | 直接采纳 |
| 输入框加模型选择 | Phase 2A | 直接采纳 |
| Flow 附件文件夹 | ✅ Phase 1 已做 | flowAssets.ts |
| Flow 链接文件 | ✅ Phase 1 已做 | flowAssets.ts links |
| 会话隔离 + 删除 | ✅ Phase 1 已做 | session-storage + LeftSidebar |
| 附加文件管理 | ✅ Phase 1 已做 | RightSidePanel + project-config.ts |
| .context/ 体系 | ❌ 放弃 | 判断不适合 Contour，Flow/Doc 本身即是知识载体 |
| Electron 打包 | Phase 3+ | 重大里程碑，等 Agent 和 Map 成熟后 |
| ContourMap DAG 增强 | Phase 2C | 自动布局、缩略图、关联 |
| PDF/Excel 预览 | Phase 2B | 替代系统程序打开 |
| flow_summary 自动生成 | Phase 2B | AI 辅助生成摘要 |

---

## 六、来自 Phase 1 遗留清单的补充

### 6.1 前端遗留问题（来自 `frontend-follow-ups-after-phase-1.md`）

| # | 事项 | 纳入 | 说明 |
|---|------|------|------|
| 1 | Flow 窄屏细节打磨 | Phase 2A | 390px 宽度下更新时间、资料区按钮压缩排版 |
| 2 | 右侧文件面板移动端交互 | Phase 2A | 补遮罩点击关闭、Escape 关闭、焦点管理 |
| 3 | 前端测试噪声清理 | Phase 2A | `useChat.test.ts` 的 act() 警告 + 预期网络错误日志 |
| 4 | 前端包体优化（666KB） | Phase 2B | 按页面 code splitting，降低首次加载体积 |
| 5 | 文件选择器人工回归 | - | 非代码任务，择机手动验证 |

### 6.2 下一步清单（来自今日 worklog）

| # | 事项 | 判断 | 说明 |
|---|------|------|------|
| 1 | **Electron 打包** | 纳入 Phase 3+ | 双击启动的桌面应用。重大里程碑，但不是 Phase 2 重点。做好后文件选择器自然解决 |
| 2 | **ContourMap 交互增强** | 纳入 Phase 2C | DAG 自动布局、缩略图、Claims 与 Flow 可视化关联。与 Agent 的 Plan Mode 互补——Agent 出计划，Map 展示结构 |
| 3 | **PDF/Excel 内置预览** | 纳入 Phase 2B | 替代当前系统程序打开方案。配合文件树预览升级 |
| 4 | **flow_summary 自动生成** | 纳入 Phase 2B | AI 辅助生成 Flow 摘要。Agent 能力升级的自然延伸 |
| 5 | 前端小问题清理 | 纳入 Phase 2A | 同 6.1 表 |

### 6.3 新增并行轨道：ContourMap 侧

Contour 有两块核心界面：**Agent 聊天** 和 **Contour Map**。Phase 2 规划主体是 Agent 侧，但 ContourMap 也有独立的工作要做：

| 事项 | 阶段 | 说明 |
|------|------|------|
| DAG 自动布局 | 2C | 当前手动拖拽，改成力导向等自动布局 |
| DAG 缩略图 / 小地图 | 2C | 项目大时方便导航 |
| Claims 与 Flow 可视化关联 | 2C | 在 Map 上显示 Claim 和 Flow 的引用关系 |
| Flow 卡片 hover 预览 | 2C | hover 时显示标题/状态/摘要 |

---

## 七、修正后的分阶段计划

### Phase 2A：Agent 体验基础（约 1 周）

```
目标：让 Agent 界面像一个正常的产品

□ 模型选择器（输入框旁下拉）
□ Thinking 折叠展示
□ 工具调用可视化（语义短语 + 展开查看结果）
□ 用户发消息才建 session
□ 停止生成按钮
□ 消息复制按钮
□ 会话重命名
□ 输入框草稿保存
□ 错误信息优化（可重试/不可重试 + 中文解释）
□ Flow 窄屏细节打磨（来自遗留清单）
□ 右侧面板遮罩/Escape/焦点管理（来自遗留清单）
□ 前端测试噪声清理（来自遗留清单）
```

### Phase 2B：Agent 能力升级（约 1 周）

```
目标：Agent 真正"有用"

□ 安装 pi-web-access（Web 搜索 + 论文下载）
□ 安装 pi-mcp-adapter（MCP 协议支持）
□ 调研 pi-hermes-memory（长期记忆方案评估）
□ CLAUDE.md 机制建立（Agent 维护项目知识）
□ Task 追踪体系（TaskCreate/TaskUpdate 工具 + 前端 TaskProgressOverlay）
□ PDF/Excel 内置预览（来自遗留清单）
□ flow_summary AI 自动生成（来自遗留清单）
□ 前端包体 code splitting（来自遗留清单）
```

### Phase 2C：交互深度 + ContourMap（约 1-2 周）

```
目标：Agent 成为协作者 + ContourMap 更可用

Agent 侧:
□ Turn 分组 + 文件改动汇总
□ 权限内联横幅（替代弹窗）
□ AskUser 交互问答
□ 输入框 @ 提及 Flow/Doc
□ Plan Mode MVP（Agent 先调研再执行）
□ 全站 loading/skeleton 状态

ContourMap 侧:
□ DAG 自动布局
□ DAG 缩略图 / 小地图
□ Claims 与 Flow 可视化关联
□ Flow 卡片 hover 预览
```

---

## 八、不做的事（明确排除）

- ❌ .context/ 双层目录 — Contour 的 Flow/Doc/Claim 已经提供结构化知识管理
- ❌ 工作区选择器 — Contour 是单工作区设计，项目 = workspace
- ❌ 语音输入 — 过度设计
- ❌ Diff 变更列表 — Contour 不是代码编辑器
- ❌ @ 提及语法（/skill、#mcp、&session） — 等 Plan Mode 做完再考虑
- ❌ 富文本编辑器 — 保持简单 textarea，够用

---

## 九、给下一个 Agent 的上下文

1. **Phase 1 代码在 main 分支**，刚做了全面审查和修复（12 P0 + 15 P1）
2. **技术栈**：后端 Express + Pi SDK + TypeBox customTools；前端 React + Zustand + Vite
3. **关键文件索引**见 `skills/pr-review/SKILL.md` 末尾
4. **Pi SDK 坑点**见同一 skill 的"已知 Pi SDK 坑点"章节
5. **Proma 参考代码**在 `D:\Github_repository\reference codebase\Proma-main`
6. **当前后端**用 `npx tsx src/server.ts` 启动（端口 3001），前端用 `npm run dev`（端口 3000）
7. **本规划的优先级判断**是建议性的，可根据实际情况调整
