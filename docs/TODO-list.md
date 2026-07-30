# Contour 开发方向

这份文档记录"想做什么"和"做了什么"。

---

## 近期（Phase 2）

### Agent 体验

- [ ] 模型选择器

- [ ] Thinking 过程折叠展示

- [ ] 工具调用可视化（调了什么、结果是什么）

- [ ] 用户发消息才建 session（当前点 Agent 就建）

- [ ] 停止生成按钮

- [ ] 消息复制

- [ ] 自动会话命名

- [ ] 输入框草稿自动保存

- [ ] 错误信息优化（可重试/不可重试 + 中文解释）

- [ ] Turn 分组 + 本轮改了什么文件汇总

- [ ] Agent 运行 / 任务完成状态显示（TaskProgressOverlay）

- [ ] mcp与skill，依旧以project为单元区分（不同project可以有不同插件）。mcp与skill配置与文件放置位置放在C盘的.contour\[-dev\]下（参考proma）

### Agent 能力

- [ ] 安装 pi-web-access — Web 搜索 + 论文下载

- [ ] 安装 pi-mcp-adapter — MCP 协议（Zotero 等外部工具）

- [ ] CLAUDE.md 机制 — Agent 维护项目操作手册

- [ ] Task 追踪体系 — Agent 自主创建/更新任务

- [ ] PDF/Excel 内置预览（替代系统程序打开）

- [ ] flow_summary AI 自动生成

### ContourMap 增强

- [ ] DAG 自动布局

- [ ] 缩略图 / 小地图

- [ ] Claims 与 Flow 可视化关联

- [ ] Flow 卡片 hover 预览标题/状态/摘要

- [ ] DAG 节点 hover 显示 summary

### 交互深度

- [ ] Plan Mode — Agent 先调研再执行，计划给用户审批

- [ ] 权限内联横幅（嵌入对话流，替代弹窗）

- [ ] AskUser 结构化问答（单选/多选/文本输入）

- [ ] 输入框 @ 提及 Flow/Doc

- [ ] 全站 loading/skeleton 状态

### UI 打磨

- [ ] Flow 窄屏细节（390px 宽度下按钮、时间等压缩排版）

- [ ] 右侧文件面板移动端交互（遮罩点击关闭、Escape、焦点管理）

- [ ] 前端测试噪声清理

- [ ] 前端包体 code splitting（当前 666KB）

- [ ] 用户头像昵称设置

- [ ] 富文本编辑器（TipTap）

- [ ] 取消设置界面的附加

---

## 中期（Phase 3+）

- [ ] **Electron 打包** — 双击启动的桌面应用

- [ ] Flow 自定义 Tag（用户打标，Agent 可见）

- [ ] Flow 内跳转上下游（展开 DAG 缩略图，点击跳转）

- [ ] 新建 / 无 summary 的 Flow 的展示与处理

- [ ] 项目 Vault 导入/导出

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