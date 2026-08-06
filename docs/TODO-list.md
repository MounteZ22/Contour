# Contour 开发方向

这份文档记录"想做什么"和"做了什么"。

---

## 近期（Phase 2）

### Agent 体验

- [x] 模型选择器

- [x] ~~Thinking 过程折叠展示~~ → 改为"思考过程"折叠（展示工具调用等可观察事件，模型原始 thinking_delta 已丢弃）

- [x] 工具调用可视化（调了什么、结果是什么）

- [x] 用户发消息才建 session（当前点 Agent 就建）

- [x] 停止生成按钮

- [x] 消息复制

- [x] 自动会话命名

- [x] 输入框草稿自动保存

- [x] 错误信息优化（可重试/不可重试 + 中文解释）

- [x] Turn 分组 + 本轮改了什么文件汇总

- [x] Agent 运行 / 任务完成状态显示（TaskProgressOverlay）

- [x] MCP 与 Skill，以 project 为单元区分（plugins.json 按项目隔离，配置在项目数据目录）

### Agent 能力

- [x] ~~安装 pi-web-access~~ → 改为自建 Tavily web_search + fetch_content（`web-search-tools.ts`）

- [x] ~~安装 pi-mcp-adapter~~ → 改为自建 @modelcontextprotocol/sdk stdio 桥接（`project-mcp-tools.ts`）

- [ ] CLAUDE.md 机制 — **只读已实现**：每轮受控读取项目根 AGENTS.md + CLAUDE.md；但 Agent **不会自主维护写回**（Prompt 明确说"用户维护"）

- [ ] Task 追踪体系 — **单轮已实现**：TaskCreate/TaskUpdate 仅在单次请求内存中有效，不持久化

- [x] PDF/Excel 内置预览（pdfjs-dist + read-excel-file）

- [x] flow_summary AI 自动生成

### ContourMap 增强

- [x] DAG 自动布局（Tarjan SCC + BFS 拓扑分层）

- [ ] 缩略图 / 小地图

- [x] Claims 与 Flow 可视化关联（badge + 展开列表 + 置信度色标）

- [x] Flow 卡片 hover 预览标题/状态/摘要

- [x] DAG 节点 hover 显示 summary（独立浮层，非 FlowCard 内联）

### 交互深度

- [x] Plan Mode — Agent 先调研再执行，计划给用户审批

- [x] 权限内联横幅（嵌入对话流，替代弹窗）

- [x] AskUser 结构化问答（单选/多选/文本输入）

- [x] 输入框 @ 提及 Flow/Doc（键盘 ↑↓ Enter Escape 导航）

- [x] 全站 loading/skeleton 状态（路由感知三种骨架屏）

### UI 打磨

- [x] Flow 窄屏细节（通用响应式已做，但无 390px 专项适配）

- [x] 右侧文件面板移动端交互（遮罩 + Escape + 焦点管理）

- [ ] 前端测试噪声清理 → 已完成（21 文件 / 136 测试全绿，零 warning）

- [ ] 前端包体 code splitting — **路由级 lazy load 已做**，无显式 vendor chunk 策略

- [ ] 用户头像昵称设置

- [ ] 富文本编辑器（TipTap）

- [x] 取消设置界面的附加（SettingsPage 5 个 tab 聚焦无冗余）

- [ ] 协议改为：AGPL-3.0

---

## 中期（Phase 3+）

- [ ] **Electron 打包** — 双击启动的桌面应用

- [ ] Flow 自定义 Tag（用户打标，Agent 可见）

- [ ] Flow 内跳转上下游（展开 DAG 缩略图，点击跳转）

- [ ] 新建 / 无 summary 的 Flow 的展示与处理

- [ ] 项目 Vault 导入/导出

### Task 追踪体系增强

- [ ] Task 持久化（当前仅单次请求内存，需跨轮次追踪）

### 第三方集成

- [ ] nature-skills 集成

- [ ] paper-fetch-skill + scansci-pdf skill

- [ ] Zotero 接入（MCP）

- [ ] 丢实验数据给 Agent，处理后撰写 Flow

- [ ] Web search with 数据库（参考 note agent）

- [ ] Office CLI 集成

### 多 Agent 协作

- [ ] SubAgent 委派 + 对抗审查 + 并行探索

- [ ] 科研多 Agent 分工（数据 Agent + 文献 Agent + 整合 Agent）

---

## 远期探索

- [ ] 知识图谱 + RAG

- [ ] 离线模型支持（Ollama）

- [ ] 研究结束后自动生成论文/报告（参考 Draftpaper_loop）

- [ ] npm 还是 bun？（当前 npm，等核心稳定后评估）

---

## 已完成

### 2026-07-29/30 — Phase 2 Agent 体验与交互闭环

- [x] 模型选择器（ChatInputBar 内嵌 Cpu 图标下拉）

- [x] 工具调用可视化（脱敏参数与结果展开）

- [x] 停止生成 / 消息复制 / 自动命名 / 草稿保存 / 重试 / 中文错误提示

- [x] Turn 分组 + 文件改动汇总

- [x] TaskProgressOverlay（TaskCreate/Update 驱动，4s 自动消失）

- [x] 项目指令文件（AGENTS.md + CLAUDE.md 受控读取）

- [x] Flow AI 摘要（服务端 LLM 生成 + 用户确认 + 原子写入）

- [x] 网络检索（自建 Tavily，SSRF/DNS/凭据脱敏完整防护）

- [x] PDF/XLSX 内置预览（pdfjs-dist + read-excel-file，lazy loading）

- [x] MCP 与 Skill 插件管理（按项目隔离，plugins.json，命令白名单）

- [x] MCP stdio 桥接（自建 @modelcontextprotocol/sdk，超时/截断/逐次确认）

- [x] 全站骨架屏（PageSkeleton / AgentPageSkeleton / FlowPageSkeleton）

- [x] ContourMap：BFS 自动布局 + hover 预览卡片 + Claims 关联徽标

- [x] 权限内联横幅（PermissionBanner 替代弹窗）

- [x] @ 提及 Flow/Doc（键盘导航 + 后端搜索端点）

- [x] AskUser 交互问答（单选/多选/文本 + SSE 桥接）

- [x] Plan Mode MVP（📋 开关 + PlanCard 审批流 + 后端 prompt 注入）

- [x] 响应式：移动端遮罩/Escape、Flow 窄屏适配

- [x] P0 安全修复：IPv6 SSRF、路径穿越、双重 Auth Header、DoS、MCP 优雅降级

### 2026-07-25 — Phase 1 Foundation

- [x] Agent 基础引擎（PiRuntime + SSE + 会话持久化）

- [x] 分层 System Prompt（7 个子模块）

- [x] 安全文件工具（realpath 白名单、TOCTOU 防护、ReDoS 检测）

- [x] Flow 附件文件夹 + 链接文件

- [x] 附加文件夹/文件管理（Agent 右侧面板直接操作）

- [x] 会话按项目隔离 + 删除 + 旧数据迁移

- [x] Flow 摘要改名 flow_summary（兼容旧 context_summary）

- [x] Agent 核心加固（TOCTOU 锁、SessionManager 兜底、资源安全）

- [x] 权限三模式骨架（readonly / review / yolo）

- [x] 审计日志 + ErrorBoundary

- [x] ARIA 可访问性（FileTree / RightSidePanel / LeftSidebar）

### 2026-07 之前

- [x] Contour 界面 / Agent 界面可切换（三栏布局）

- [x] 选中 Flow 后 Prompt 注入 summary

- [x] 左侧栏重构（项目列表 + 会话列表 + 导航）

- [x] Claim 前端入口

- [x] 自动化测试系统

- [x] Flow 编号纯数字递增（F001）

- [x] SSE 流式输出（替代一次性 JSON）

- [x] AgentRuntime 抽象层

- [x] 文档类型从枚举改为自由标签

- [x] 字体系统三层层级（Hanken Grotesk / Inter / JetBrains Mono）