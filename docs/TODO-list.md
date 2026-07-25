# Contour TODO List

Contour 的想法备忘与待办清单。记录"想到但还没做"的功能、需要拍板的设计决策、以及远期方向。

本文件与另外两份文档互补：

- `dev_journal/design-decisions.md` —— **已拍板**的设计决策（正式记录）
- `dev_journal/project-status.md` —— 当前进度与下一步

> 分类逻辑：按**成熟度**而非模块组织，方便一眼看出"现在该关注哪批"。 `- [ ]` = 待办/开放，`- [x]` = 已完成/结案。

---

## 一、已确认的设计决策（待写入 design-decisions）

> 这些已经在讨论中得出结论，准备沉淀进 `design-decisions.md`，不再是开放问题。

- **Flow 编号采用纯数字递增**（`FLOW_001`） 只表示创建顺序；父子 / 前后关系完全交给 DAG 表达，不压进编号。哈希 ID 对人不友好，放弃。

- **Flow 内部不设独立 AI**Flow 是纯粹的"内容容器"（markdown + yaml），AI 是它外部的协作者。讨论某 Flow 时，通过 Agent Session 选中该 Flow 注入即可（见 Decision 15），不另开第二套 AI 入口，避免认知记录碎片化。

- **Flow 软锁前期不做**"完成态只读"暂不实现。留痕靠把 vault 纳入 `git`（零开发量，天然 diff 历史）；软锁（"此 Flow 已完成，确认要改吗？"弹窗）等 UI 打磨阶段再加。

---

## 二、待定决策

> 还需要进一步讨论才能定方向。

- [ ] **npm 还是 bun**暂定 npm：与 Electron 打包（electron-builder）生态最成熟、踩坑记录最多。bun 更快但可能在原生依赖上踩坑；且 npm→bun 随时可切，不锁死。等核心稳定后再评估。

- [ ] **Agent 获取 Flow 内容：统一工具 vs 直接 read**现状已有 3 个只读 vault 工具（read Flow / search Flow / read Doc）。开放问题：是只让 Agent 走这些结构化工具，还是也允许它直接 read 文件路径自由探索？两者可并存，需定边界与默认行为。

---

## 三、近期开发主线

> 优先级最高，进入当前冲刺。

- [ ] **agent running / 任务完成状态显示** — 参考 proma，在 Agent 面板展示运行 / 完成态。

- [ ] **用户发送消息才新建 session** — 当前每次点 Agent 就新建 session。改成：聊天框初始显示在中间，用户发送第一条消息后才建立 session（和主流 Agent 产品一致）。

- [ ] **输入框加模型选择 + 工具调用展开** — 和正常 Agent 产品一样，输入框旁加模型下拉和工具调用折叠区。

---

## 四、已完成（Phase 1 Foundation）

> 2026-07-25 审查通过并合并到 main。

- [x] **会话按 Project 隔离** — 后端 session-storage 按 `projects/{projectId}/sessions/` 存储；前端左侧栏会话列表跟随选中项目过滤；右侧文件面板跟随会话所属项目。

- [x] **flow 摘要改名 flow_summary** — scanner.ts 使用 `flow_summary.md`，`context_summary.md` 作为 legacy 兼容。

- [x] **Flow 附件文件夹** — flowAssets.ts 支持每个 Flow 的 `attachments/` 目录，上传/删除/列出附件。

- [x] **Flow 链接文件** — flowAssets.ts 支持每个 Flow 添加/删除外部文件链接（links），配合 authorizedPaths 权限控制。

- [x] **附加文件夹/文件管理** — Agent 右侧文件面板底部直接添加/删除附加文件夹和文件，通过 authorizedPaths 注入 Agent 可访问范围。

- [x] **会话文件右侧 bar** — 选中 Flow/Doc 后在"会话文件" Tab 显示快捷入口；Flow 目录树可展开浏览 flow.md、附件、链接。

- [x] **选中 Flow 后 Prompt 注入 summary** — promptBuilder 根据 contextItems 注入所选 Flow 的 summary。

- [x] **Contour 界面 / Agent 界面可切换** — ShellLayout 三栏 + AgentView。Contour 界面有多选，选中 Flow 后切到 Agent 界面即加载 Flow 信息作为 prompt。

- [x] **按选中的 Flow 注入背景信息** — 未选任何 Flow / 背景 → 不注入 summary，Agent 用工具自行探索 vault；选中 Flow → 注入背景与 Flow 信息。

- [x] **左侧栏重构** — skill / 设置 / 对话记录 / project 入口的布局（参考 proma）。

- [x] **Claim 前端入口** — 后端 CRUD 已完成（`api/claims.ts`），前端补了 `ProjectClaimPage` 的 UI。

- [x] **自动化测试系统**

- [x] **会话持久化 + 删除** — session-storage.ts 会话 JSONL 持久化；左侧栏 hover 删除按钮 + 确认弹窗；旧无 projectId 数据自动迁移。

- [x] **Agent 核心加固** — typed-error 错误体系、tool-policy 工具策略、TOCTOU 互斥锁、SessionManager 异常兜底、cleanupActivePrompt 资源安全、ErrorBoundary 兜底。

- [x] **安全加固** — authorized-file-tools 392 行安全文件工具（realpath 防符号链接、路径白名单、ReDoS 防护）、审计日志、permission-extension 原子写入 + 语义化规则匹配。

---

## 五、待办功能（已明确，待排期）

> 范围清晰，但还没进入当前冲刺。

- [ ] **Flow 自定义 Tag**（用户打标，Agent 可见）
- [ ] **DAG 节点 hover 显示 summary**
- [ ] 用户可设置头像昵称等信息，agent chat 界面 user 与 agent 头像改为矩形（小圆角）（参考 proma）
- [ ] **Flow 内跳转上下游**：加按钮展开 DAG 缩略图，点击其他 Flow 跳转
- [ ] **富文本编辑器 - TipTap**
- [ ] **新建 / 无 summary 的 Flow 的展示与处理**
- [ ] **会话内授权 Agent 读写指定文件夹**（拖入 / ➕ 添加），权限范围控制
- [ ] **项目 Vault 导入/导出** — 支持选择已有的 `.contour[-dev]` 配置目录和 `Contour-dev` 下的项目文件夹，将其添加到项目列表中（类似"导入已有 vault"）。导出时可将项目 vault 打包。实现项目数据的可移植性。

---

## 六、第三方集成（中后期）

> 面向科研场景的增强能力，依赖核心稳定后再做。

- [ ] **nature-skills 集成进 Contour**
- [ ] **paper-fetch-skill + scansci-pdf skill**
- [ ] **Sci paper todo 的 Zotero 接入**（可能是 zotero mcp？）
- [ ] **丢实验数据给 Agent**：它处理后撰写 / 整理 Flow 文档
- [ ] **web search with 数据库**（参考 note agent）
- [ ] **Office cli 集成**

---

## 七、远期探索

> 更后期、更实验性的方向，先记录，不预设方案。

- [ ] **引入 mindkit？**（探讨场景下）
- [ ] **Zotero MCP**
- [ ] **知识图谱 + RAG**（参考 yuxi）
- [ ] 研究或项目结束后，可用的 flow、数据、文件、图片等；采用 loop engineering 类似的方式，逐步完成论文/报告的撰写（可能参考：github:Draftpaper_loop）
- **离线模型支持** — 当前 AI 功能设计假设有网络连接，未考虑本地模型（如 Ollama）接入方案。
