# 关键设计决策

这份文档记录的不是“代码怎么写”，而是“为什么要这样做”。

这类内容很重要，因为项目后面会不断扩展。如果只记结果、不记理由，未来你自己和 agent 都很容易把项目带偏。

---

## ~~决策 1：第一阶段先做 CLI，不先做 GUI~~

### 状态：已推翻（2026-05-04）

### 原结论

先做 CLI 原型，再考虑界面。

### 推翻理由

CLI 虽然验证了核心对象结构，但存在两个问题：

1. **作为 PM 无法可视化验证产品** — 看不见界面就无从判断 flow/section/claim 的导航体验是否合理
2. **目标用户（生化环材研究生）使用门槛过高** — 安装 Python、敲命令行对于非技术背景用户是真实障碍

新方向改为：用 TypeScript + React 构建本地 web 应用，先实现只读浏览验证产品体验，再逐步加入编辑和 AI 协作功能。

### 保留的经验

CLI 阶段验证了一些核心假设依然有效：
- Markdown/YAML vault 结构是合理的
- flow/claim/asset 的边界是自然
- context_summary 作为 AI 注入源的定位正确

---

## 决策 2：第一阶段先用文件系统，不上数据库

### 结论

用 Markdown + YAML + 文件夹结构作为第一阶段基础，不引入数据库。

### 为什么这样做

这和项目的核心哲学一致：

- 让结构透明
- 让你自己能直接看懂
- 让 Obsidian、VS Code、Claude Code 等工具都能直接读取
- 保持迁移性和可移植性

数据库的优势是查询和复杂关系管理，但当前第一阶段最重要的不是这个，而是：

- 把对象结构想清楚
- 让人和 agent 都能自然使用
- 降低技术负担

### 风险是什么

文件系统方案后面会遇到一些上限，比如：

- 复杂关系管理不如数据库方便
- 自动索引和高级检索要自己补

但这些属于“以后可能遇到的问题”，不是当前最主要的阻碍。

---

## 决策 3：`ContextSummary` 是主要注入源，不直接整篇注入 `flow.md`

### 结论

第一阶段生成 context pack 时，主要读取 `context_summary.md`，而不是整篇 `flow.md`。

### 为什么这样做

因为 `flow.md` 的职责是记录过程，通常会更长、更杂、更像完整工作记录。

而外部 AI 协作真正需要的，是：

- 当前最 relevant 的背景
- 关键观察
- 当前解释
- 不确定性
- 不该过度宣称的地方

这正是 `context_summary.md` 的职责。

### 这样做的好处

- 注入内容更短，更聚焦
- 更容易控制 AI 讨论的粒度
- 更能保留“不确定性”这种关键边界

### 这对后续意味着什么

以后如果需要，仍然可以增加“把完整 flow 作为补充材料”这样的机制，但第一阶段先不混在一起。

---

## 决策 4：`build-context` 只支持显式选择，不做自动推荐

### 结论

当前必须由用户明确指定：

- 哪些 flows
- 哪些 claims
- 哪些 assets

### 为什么这样做

因为现在我们还在理解“什么样的 context 选择才自然”。

如果过早加入自动推荐，很容易产生两类问题：

- 推荐错了，用户以为系统懂了，其实已经带偏
- 推荐逻辑越来越复杂，但底层对象边界还没稳定

### 教学性理解

这有点像做实验时先手动控制变量，而不是一开始就交给自动系统。

手动选择虽然慢一点，但更容易看清楚系统到底在做什么。

---

## ~~决策 5：先不做 `new-flow`~~

### 状态：已推翻（2026-05-04）

### 原结论

当前阶段故意不实现 `new-flow` 命令，等结构稳定后再做。

### 推翻理由

`new-flow` 在 CLI 阶段的顾虑（模板固化）在 GUI 阶段不再是主要障碍。在 GUI 中，用户创建 flow 的过程本身就是”边创建边调整模板”的体验，不会一次性大量复制旧结构。反而是不让用户创建 flow，会阻碍产品验证。

新方向改为：在 GUI 中支持创建 flow 和自定义 section，让用户自由定义 flow 结构，而不是由 CLI 命令的模板决定。

---

## 决策 6：样例 vault 不是附属品，而是第一阶段核心资产

### 结论

`example_vault/` 在第一阶段不是普通 demo，而是非常重要的设计和验证基准。

### 为什么这样做

因为单看 schema 和抽象说明，很容易觉得结构合理；但一旦放进真实样例，就会暴露很多问题：

- 字段顺不顺手
- 文件关系是否自然
- 模板是否冗余
- 校验规则是否过松或过紧

### 对项目控制的意义

以后如果你对某个设计犹豫，可以优先问两个问题：

1. 这个改动会不会让 `example_vault/` 更自然？
2. 这个改动会不会让样例更难读、更难维护？

这比只讨论抽象架构更接地气。

---

---

## 决策 11：SSE 流式输出替代一次性 JSON 响应

### 结论

AI 聊天 API 从非流式 JSON 改为 SSE（Server-Sent Events）流式输出。

### 为什么这样做

非流式的问题是**等待感**：用户发送消息后，需要等待 LLM 生成完整回复才能看到任何内容，对于长回复（几百字以上）体验很差。

SSE 流式的优势：
- **即时反馈**：第一个 token 到达就显示，用户感知到的延迟从"整段生成时间"降到"首 token 时间"
- **自然体验**：文字逐段出现符合人对"打字"的直觉，不会觉得机器在"停顿思考"
- **技术成熟**：SSE 是浏览器原生支持的协议，不需要 WebSocket 的双向连接开销

### 放弃的替代方案

- **WebSocket**：双向通信对单向推送场景是过度设计，需要额外的心跳和重连逻辑
- **HTTP/2 Server Push**：浏览器支持度差，且 Express 生态支持不完善
- **保持非流式**：实现简单但产品体验明显差一个档次

### 这会带来什么后果

- 前端需要消费 SSE 流（`EventSource` 或手动 `fetch` + `ReadableStream`），代码复杂度增加
- 错误处理需要分两种情况：连接建立前的错误（返回 JSON）和流式过程中的错误（SSE `error` 事件）
- 需要保留非流式 fallback，某些网络环境（如某些代理）可能截断 SSE

---

## 决策 12：Tool Use 采用多轮循环架构

### 结论

LLM 调用工具采用"请求 → 执行 → 回传结果 → 再次请求"的多轮循环，而非单次调用。

### 为什么这样做

科研场景下，LLM 很少能一次性获得所有需要的信息。例如：
1. 用户问"膜蒸馏的通量衰减有哪些可能原因？"
2. LLM 需要先搜索相关 Flow
3. 然后读取最相关的 Flow 详情
4. 再读取关联的 Background Doc
5. 最后综合回答

单次 tool_use 只能完成第 2-3 步中的某一步。多轮循环让 LLM 自主决定"还需要什么信息"。

### 具体实现

- 每轮对话将 tool_result 作为 `user` 角色消息发回（Anthropic 协议）
- 最多 10 轮，防止无限循环或恶意消耗 token
- 只有 LLM 的 stop_reason 为 `tool_use` 时才继续循环，其他情况（如 `end_turn`）直接返回

### 放弃的替代方案

- **单次 tool_use**：LLM 只能调用一次工具，无法处理需要多步信息聚合的复杂查询
- **预取所有数据**：把所有可能相关的数据一次性塞进 prompt，但 token 消耗大且容易超出上下文窗口
- **手动编排工作流**：由前端或后端硬编码"先调 A 再调 B"，但失去 LLM 的自主判断能力

### 这会带来什么后果

- 后端需要维护跨轮次的消息历史（`messages` 数组累积）
- 单条用户请求可能触发多次 LLM API 调用，成本增加
- 需要给工具写清晰的 description，否则 LLM 会选错工具或参数
- 工具执行失败时的错误信息需要精心设计，让 LLM 知道如何修正

---

## 决策 13：用原生 fetch 替代 Anthropic SDK

### 结论

AI 服务层使用原生 `fetch` 直接调用 LLM API，不依赖官方 SDK。

### 为什么这样做

1. **多 provider 统一**：Anthropic SDK 只支持 Anthropic 协议，而我们需要同时支持 Anthropic、DeepSeek、Kimi 等多个 provider。每个 provider 的 SDK 接口不同，无法统一
2. **SSE 灵活性**：SDK 的流式接口封装了自己的抽象层，手动解析 SSE 事件可以让我们统一处理不同 provider 的 `content_block_delta` 格式差异
3. **依赖减少**：不引入额外的 npm 包，减少依赖树体积和潜在的安全漏洞
4. **透明性**：直接操作 HTTP 请求/响应，调试时可以看到完整的原始数据

### 放弃的替代方案

- **Anthropic SDK + DeepSeek SDK + Kimi SDK**：每个 provider 一个 SDK，接口不一致，代码里到处是 `if (provider === 'anthropic')` 分支
- **OpenAI 兼容层**：DeepSeek 和 Kimi 支持 OpenAI 格式，但 Anthropic 的 Claude 协议与 OpenAI 不同，仍需特殊处理
- **LangChain / Vercel AI SDK**：引入大型抽象库，增加学习成本和 bundle 体积，对于我们的需求过度设计

### 这会带来什么后果

- 需要自己实现 SSE 解析逻辑（约 50 行），需要理解 Anthropic 的流式事件格式
- API 变更时需要手动更新请求体格式（但 LLM API 格式相对稳定）
- 没有 SDK 提供的类型定义，需要自建 TypeScript 类型

---

## 决策 7：从 Python CLI 转向 TypeScript Web 应用

### 结论

Contour 核心产品从 Python CLI 工具转向 TypeScript + React 本地 Web 应用。

### 为什么这样做

1. **产品形态不匹配** — Python CLI 解决的是"context pack generator"，但 Contour 的目标是"research flow workspace"。CLI 无法承载三栏布局、Project Map、AI Chat Panel 等产品体验。

2. **用户门槛** — 目标用户（生化环材研究生）不会安装 Python 环境、不会敲命令行。一个能双击启动的 web app 更友好。

3. **PM 验证需求** — 作为非专业 coder 的产品经理，需要可视化界面来验证产品假设。看不见界面就无法判断交互流程是否合理。

4. **学习路径** — vibe coding 的开发方式更适合前端生态（组件化、热更新、即时反馈），Python CLI 的迭代周期太长。

### 放弃的替代方案

- **保留 Python + FastAPI + 前端**：双语言方案在 Electron 打包阶段会遇到跨进程通信和打包复杂度的隐性成本
- **直接 fork scipaper-todo-app**：核心对象不同（Article vs Flow），继承太多不需要的功能（审稿、写作打卡、Zotero）

### 这会带来什么后果

- 短期：需要学习 TS/React/Node 生态，有一定学习曲线
- 中期：现有 Python 代码（vault/validators/context_builder）需要重写为 TS，但代码量不大
- 长期：Electron 打包时无需处理 Python sidecar，技术栈统一

### 保留不变的原则

- 文件系统优先于数据库（决策 2）
- context_summary 是主要 AI 注入源（决策 3）
- 显式选择优于自动推荐（决策 4）
- 样例 vault 是核心验证资产（决策 6）

---

## 决策 8：Cycle 改名为 Flow

### 结论

核心对象从 "Cycle" 改名为 "Flow"。

### 为什么这样做

"Cycle" 在中文语境下强烈暗示"周期性重复"（周期），但科研中的实际情况是：

1. **每次研究活动都是不同的** — 材料合成、性能测试、仪器表征、数据处理、机理分析，这些是不同性质的工序，不是同一套流程的重复
2. **"Cycle" 的粒度太大** — 如果把合成到表征到分析全塞进一个 cycle，那 Context Builder 选择时粒度太粗，无法精确选取需要的内容
3. **"Flow" 更贴合研究的自然形态** — 研究是一条"流程"，有分叉、有回溯、有线性推进。前期是试错迭代（多分支），后期是系统表征（一条线走下去）

### Flow 的定义

> Flow 是一个可独立产出判断/结论的研究工序。它可以是实验、表征、数据分析、文献论证、讨论或任何足以推进研究认知的活动。多个 Flow 组成研究的路径网络。

### 命名变更范围

- 核心对象：Cycle → Flow
- ID 前缀：C001 → F001
- 目录名：cycles/ → flows/
- 主文件：cycle.md → flow.md
- frontmatter 字段：cycle_id → flow_id, parent_cycles → parent_flows
- API 路径：/api/cycles → /api/flows
- 前端路由：/cycle/:id → /flow/:id
- 组件名：CycleCard → FlowCard, CycleWorkspace → FlowWorkspace 等

### 这会带来什么后果

- 所有现有文档、spec、example_vault 需要同步更新（一次性成本）
- 后续 coding agent 的上下文中不再有 "Cycle" 一词
- "Flow" 在英文中更自然，在中文里"流程"也比"周期"更准确

---

---

## 决策 9：Tailwind @theme 层是项目唯一的视觉真相源

### 结论

所有颜色、间距、字体、圆角等视觉属性从 `tokens.css` 的 `@theme inline` 块发出，组件代码中不硬编码任何视觉值。

### 为什么这样做

科研工作台的前端设计需要满足几个条件：

1. **主题切换** — 暗色模式不是可选功能，而是长时间科研阅读的刚需。CSS 变量 + Tailwind token 映射可以做到换一个 class 就换一整套颜色，不触碰组件代码。

2. **低认知负载** — 新加入的人（或 agent）只需要读一个 230 行的 `tokens.css` 就能理解完整设计体系，不需要在数百个组件中拼凑视觉规则。

3. **一致性** — 有了 token 层后，不存在"这个卡片用了 8px 圆角、那个用了 6px"的问题。所有圆角从 `--radius-md` / `--radius-lg` / `--radius-xl` 取值，语义明确。

### 放弃了什么替代方案

- **继续手写 CSS class**：05-08 的方案够用但不具备可扩展性，每加一个页面都要重新设计
- **CSS-in-JS（styled-components 等）**：runtime 开销、SSR 兼容性、与 Tailwind 生态不兼容
- **Tailwind v3**：v4 的 `@theme inline` 让自定义 token 映射到 utility class 更直接，不需要 `tailwind.config.js`

### 这会带来什么后果

- 之后所有 UI 改动都应在 Tailwind utility class 层面完成，不应新增自定义 CSS
- Token 新增需谨慎：先确认是否能用已有 token 表达，避免 token 膨胀
- `tokens.css` 约 230 行，如果未来超过 400 行应考虑按职责拆分（color/typography/spacing）

---

## 决策 10：字体系统三层层级

### 结论

Hanken Grotesk 用于标题、Inter 用于正文、JetBrains Mono 用于标签和代码。

### 为什么这样做

这不是审美选择，是信息层级需求：

- **Hanken Grotesk**：几何 sans-serif，有学术感但不死板。标题字体需要足够的"存在感"，让人能快速扫描页面结构
- **Inter**：针对屏幕阅读优化的字体，x-height 高、字形开放。在科研长文本场景下比系统默认字体明显减少眼疲劳
- **JetBrains Mono**：专为开发者设计的等宽字体，字形清晰、连字丰富。用于 ID（F001）、状态标签、代码片段，传递精度感

### 风险

- Google Fonts CDN 是外部依赖，离线场景需要 fallback。`tokens.css` 中已配置完整的 fallback 链（`"Inter", "Segoe UI", sans-serif`）
- 三套字体增加了约 150KB 的初始加载量，但目前没有性能瓶颈，暂不优化

---

---

## 决策 14：从 AppShell 单栏布局迁移到 ShellLayout 三栏布局

### 结论

前端壳子从 `AppShell`（单栏：顶栏 + 内容区）迁移到 `ShellLayout`（三栏：LeftSidebar + Outlet + RightSidePanel）。

### 为什么这样做

1. **空间利用效率** — 旧的单栏布局在宽屏下浪费大量水平空间。三栏布局可以同时展示导航、内容和 Agent 面板，减少页面跳转。

2. **"边浏览边讨论"的工作模式** — 科研场景下，用户经常需要在查看 Flow/Doc 的同时与 AI 讨论。三栏布局让 Agent 面板始终可用，不需要离开当前页面。

3. **导航层级清晰** — LeftSidebar 固定显示项目列表和操作，用户可以快速切换项目，不会迷失在多层路由中。

4. **可扩展性** — RightSidePanel 可以放 Agent 以外的内容（如 Claim 列表、相关 Flow 推荐等），为后续功能扩展预留空间。

### 放弃的替代方案

- **保持 AppShell + 弹出式 Agent** — Agent 以 Modal 或 Drawer 形式出现，但会遮挡内容，不适合长时间讨论
- **双栏布局（Sidebar + Content）** — 没有独立的 Agent 面板区域，Agent 功能仍需嵌入各页面
- **可拖拽面板（如 VS Code）** — 实现复杂度高，当前阶段不需要那么灵活的布局

### 这会带来什么后果

- 所有页面需要适配三栏布局，内容区宽度受限
- LeftSidebar 需要处理好响应式（窄屏时可折叠）
- RightSidePanel 的默认状态（展开/折叠）需要根据页面上下文决定
- 路由结构需要调整，Agent 相关页面成为独立路由

---

## 决策 15：建立独立的 Agent Session 系统

### 结论

将 AI 交互功能从各页面的嵌入式组件（`AIWorkbenchPanel`、`BottomChatPanel`）抽离为独立的 Agent session 系统。

### 为什么这样做

1. **消除代码重复** — 之前每个需要 AI 功能的页面都要集成一遍 `AIWorkbenchPanel`，代码重复严重。

2. **统一状态管理** — 聊天状态分散在不同页面，切换页面会丢失上下文。独立 session 系统用 `useAgentSessions` 统一管理，session 数据持久化到 localStorage。

3. **全局可用** — Agent 功能不再绑定特定页面，用户可以在任何地方发起讨论。

4. **Session 隔离** — 不同的讨论话题可以有独立的 session，互不干扰。

### 放弃的替代方案

- **全局单例聊天** — 只有一个聊天窗口，但无法同时处理多个话题
- **Context-based 共享** — 用 React Context 在页面间共享聊天状态，但页面卸载时状态仍会丢失
- **服务端 Session** — 将 session 存到后端数据库，但当前阶段增加后端复杂度不值得

### 这会带来什么后果

- 需要设计 session 的生命周期管理（创建、切换、删除）
- localStorage 有容量限制（通常 5-10MB），大量聊天记录可能需要清理策略
- 后续如果需要多设备同步，需要引入服务端持久化
- Agent 相关组件（SessionChat、SessionHeader 等）需要处理好与具体页面的解耦

---

## 决策 16：建立 AgentRuntime 抽象层隔离具体 Agent SDK

### 结论

在业务代码和具体 Agent SDK（如 Pi Coding Agent）之间插入一个 `AgentRuntime` 接口层，所有 Agent 调用通过接口进行，不直接依赖任何具体 SDK。

### 为什么这样做

1. **供应商中立** — Pi Coding Agent SDK 是一个优秀但具体的选择。如果将来想换用其他实现（如自建 Agent、Anthropic Claude Agent SDK、或 LangChain Agent），只需提供新的 `AgentRuntime` 实现，上层代码零改动
2. **接口风格适配** — Pi SDK 使用 callback 订阅模式（`session.onEvent(...)`），而现代 TS 代码更偏好 `AsyncIterable`。抽象层将 callback 桥接为 `for await...of` 循环，调用方代码更简洁
3. **配置解耦** — Pi SDK 的初始化需要 `AuthStorage`、`ModelRegistry` 等概念，和 Contour 的渠道管理系统是两套模型。`AgentRuntimeConfig` 作为中间表示，由 `channel-adapter` 负责翻译，两边各自治
4. **测试友好** — 接口层让 mock/stub 变得极其简单。可以写一个 `FakeRuntime` 返回预设事件流用于测试，不需要真正调用 LLM

### 事件归并原则

Pi SDK 发出约 12 种细粒度事件，`AgentStreamEvent` 归并为 9 种：
- `text_start` / `text_delta` / `text_end` → 统一为 `text_delta`（开始/结束由 `turn_start` / `turn_end` 承载）
- `thinking_start` / `thinking_delta` / `thinking_end` → 统一为 `thinking_delta`
- `tool_execution_start` / `tool_execution_end` → `tool_call_start` / `tool_call_end`

理由是上层消费者几乎从不单独处理 start/end 事件——它们只关心"有新的文本/思考内容到了"。

### 放弃的替代方案

- **直接使用 Pi SDK** — 最简单但耦合最紧，换 SDK 需要改动所有调用点
- **LangChain Agent 抽象** — 过度设计，引入了我们不关心的概念（Chain、Memory、VectorStore），且抽象层级太多难以 debug
- **自建 Agent 从零开始** — 重新实现 tool use、session 管理、模型切换等通用能力，工作量巨大且容易出 bug

### 这会带来什么后果

- 上层代码（API 路由、services）只依赖 `AgentRuntime` 接口，不 import 任何 `@earendil-works/pi-*` 包
- 新增 Agent SDK 时只需：实现 `AgentRuntime` 接口 → 在 `channel-adapter` 中添加工厂 → 完成
- 接口设计需要稳定——一旦多个实现依赖它，修改接口的代价会更高
- `AgentStreamEvent` 的类型定义需要覆盖所有实现的事件需求，如果新实现有独特事件需要扩展联合类型

---

## 决策 17：文档类型从固定枚举改为自由标签（tags）

### 结论

废弃 `DocType` 枚举（`project_brief`、`literature_review`、`method`、`data_analysis`、`experimental`、`other`），改为 `tags: string[]` 自由标签系统。

### 为什么这样做

1. **预设分类永远不够用** — 科研文档的类型远超 6 种。实际使用中可能还有"实验方案"、"仪器手册"、"会议记录"、"代码笔记"等，枚举无法覆盖
2. **一篇文档可能属于多个类别** — 一篇膜蒸馏综述可能同时涉及通量衰减机理（属于 `literature_review`）和具体实验方法（属于 `method`）。枚举只能选一个，标签可以同时打多个
3. **用户自主定义比我们预设更好** — 对于科研工作者，"综述"、"实验"、"表征"这些标签比 `literature_review`、`experimental` 等英文枚举值更直观。而且不同研究领域需要不同的标签体系
4. **与 Obsidian/Notion 等工具对齐** — 标签已经是知识管理工具的事实标准做法，用户不需要学习新的分类体系

### 放弃的替代方案

- **保留枚举但扩展** — 治标不治本，永远有新的文档类型冒出来
- **枚举 + 标签共存** — 两套系统并存导致混乱（"这个文档是 literature_review 还是打了'综述'标签？"）
- **文件夹分类** — 退回到用目录结构分类，但失去了多标签的优势

### 这会带来什么后果

- 所有文档的 YAML frontmatter 从 `type: literature_review` 改为 `tags: [综述, 膜蒸馏]`
- `example_vault` 需要批量更新
- 前端标签输入可以考虑后续加自动补全（从已有标签中推荐）
- 丧失枚举的类型安全——不过 `string[]` 本身已经很简单，不太会成为问题
- 向后兼容：如果读到旧的 `type` 字段，应该自动转换为 `tags: [type]`

---

## 决策 18：权限三模式骨架（readonly / review / yolo）

### 结论

Agent 工具权限分三种模式：readonly（默认只读）、yolo（全开）、review（钩子拦截写操作）。当前骨架版所有工具仍只读，默认 readonly 模式，零写操作风险。

### 为什么这样做

未来开放写能力（write/edit/bash、Agent 修改 Flow/Doc）时，需要权限防护：

1. **readonly 是安全基线** — 只开 read/grep/find/ls + 业务只读工具，写工具根本不进 tools 白名单，Agent 调不到。最安全，适合日常使用
2. **yolo 是开发模式** — 所有工具开放，不拦截。适合开发调试、信任场景
3. **review 是中间态** — 所有工具开放，但通过 `extensionFactories` 挂 tool_call 钩子拦截写操作。当前骨架版直接 deny，未来补确认 UI 后改成 await 用户确认

### 为什么用 extensionFactories 而不是工具执行层拦截

Pi SDK 的 `extensionFactories` 是官方推荐的扩展点，可以挂 `tool_call` 钩子在工具执行前拦截。优势：
- **统一拦截** — 不需要修改每个工具的实现
- **可 async** — handler 可以 await 用户确认，未来加确认 UI 时只需要在钩子里 await
- **可扩展** — 可以加"以后都允许"持久化规则、审计日志等

放弃的替代方案：
- **工具执行层拦截** — 需要修改每个工具的实现，代码分散
- **中间件模式** — Pi SDK 没有中间件概念，extensionFactories 是最接近的
- **不加权限，全开放** — 安全风险高，Agent 可能误操作

### 这会带来什么后果

- 当前所有工具仍只读，默认 readonly 模式，零写操作风险
- `AgentRuntimeConfig` 新增 `permissionMode` 字段
- `channel-adapter` 根据 permissionMode 决定内置 tools 白名单（`READONLY_BUILTIN_TOOLS` / `FULL_BUILTIN_TOOLS`）
- `pi-runtime` 在 review 模式下注入 `extensionFactories`
- 前端暂时不传 permissionMode，保持默认只读
- 未来需要：review 模式确认 UI（SSE `permission_request` 事件 + 前端弹窗 + POST 回传）、前端模式选择器 UI

### 调研依据（已验证 node_modules 源码）

- `extensionFactories` 通过 `DefaultResourceLoader` 注入，不是 `createAgentSession` 直接参数（`resource-loader.d.ts:70`）
- `pi.on("tool_call")` 返回 `{block:true, reason}` 即阻止（`agent-loop.js:386-392`）
- handler 可 async，未来能 await 用户确认
- `extensionFactories` 和 `customTools` 能共存，业务工具不用迁

---

## 未来如何继续记录设计决策

当后面出现新的关键取舍时，建议继续按这个格式往下加：

- 决策是什么
- 为什么这样做
- 放弃了什么替代方案
- 这会带来什么后果

如果后面条目太多，可以拆成类似这种结构：

- `design-decisions/001-cli-first.md`
- `design-decisions/002-summary-first.md`
- `design-decisions/003-no-new-flow-yet.md`

现在先集中写在一个文件里，后面再拆分就可以。

---

## 决策 19：Flow 编号采用纯数字递增（2026-07）

### 结论

Flow ID 采用 `F001`、`F002` 纯数字递增，编号只表示创建顺序。

### 为什么这样做

- 父子/前后关系完全交给 DAG 表达，不压进编号
- 哈希 ID（如 UUID）对人不友好，难以在讨论和笔记中引用
- 数字递增在 Obsidian、笔记、口头交流中天然可读

### 放弃的替代方案

- **哈希 ID**：全局唯一但对人不友好
- **语义前缀（如 F_exp_001）**：一旦编号改了语义也变了，且分类应交给 tag

---

## 决策 20：Flow 内部不设独立 AI（2026-07）

### 结论

Flow 是纯粹的"内容容器"（markdown + yaml），AI 是它外部的协作者。

### 为什么这样做

- 讨论某 Flow 时，通过 Agent Session 选中该 Flow 注入即可
- 不另开第二套 AI 入口（如每个 Flow 里嵌一个聊天窗口），避免认知记录碎片化
- 保持"Agent 是项目级协作者，不是 Flow 的附属品"的定位

### 放弃的替代方案

- **每个 Flow 内嵌聊天**：会导致同一个项目的讨论散落在各个 Flow 里，无法形成连贯的对话历史

---

## 决策 21：Flow 软锁前期不做（2026-07）

### 结论

"完成态只读"暂不实现。

### 为什么这样做

- 留痕靠把 vault 纳入 git（零开发量，天然 diff 历史）
- 软锁（"此 Flow 已完成，确认要改吗？"弹窗）增加交互摩擦
- 等 UI 打磨阶段再评估是否真的需要

### 这会带来什么后果

- 已完成 Flow 的内容可能被误改，但 git 历史可以恢复
- 后期如果需要，可以作为 Flow 的 UI 功能加入
