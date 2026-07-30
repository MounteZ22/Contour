# Contour Phase 2 完成报告

> 完成时间：2026-07-30（北京时间）
>
> 涉及分支与 PR：
> - **Part 1**: Phase 2A + 2B → `codex/phase-2a-agent-experience` → **PR #4**（已合入 main）
> - **Part 2**: Phase 2C → `codex/phase-2c-agent-experience` → **PR #5**（已审查并合入 main，merge commit `8101915`）

---

## Part 1：Phase 2A + 2B（codex 完成，已合入 main）

> 分支 `codex/phase-2a-agent-experience`，commit `8a042f7`
>
> 后续 P0 修复 commit `24cf546`（Proma Agent review 后补修），合并 commit `e27bee1`

### 完成范围

| 模块 | 状态 | 交付内容 |
| --- | --- | --- |
| Agent 体验基础 | ✅ | 首条消息建会话、模型选择、会话重命名、草稿保存、停止、复制、重试及中文错误提示。 |
| 执行可见性 | ✅ | 工具调用显示脱敏后的参数和结果；原始模型推理不传到前端；TaskCreate/TaskUpdate 驱动当前轮任务浮层。 |
| 响应式与性能 | ✅ | 移动端右栏遮罩、焦点与 Escape 关闭；Flow 窄屏适配；路由与大型预览组件按需加载。 |
| 项目指令 | ✅ | 每轮显式读取项目根目录的 `AGENTS.md`、`CLAUDE.md`，按该顺序追加为低优先级指南。 |
| Flow 摘要 | ✅ | 服务端读取 Flow 后生成草稿；用户确认后原子写入 `flow_summary.md`。 |
| 网络检索 | ✅ | 设置页可启用/停用 Tavily、保存 API Key；`web_search` 与 `fetch_content` 仅在已启用且有 Key 时注入。 |
| PDF/XLSX 预览 | ✅ | 内置 PDF 分页/缩放和 XLSX 多工作表预览；解析失败时仍可交给系统程序。 |
| 插件管理 | ✅ | 设置页的"插件"按项目管理 MCP 与 Skill；配置持久化在项目数据目录的 `plugins.json`。 |
| MCP 运行时 | ✅ | 仅受限的本地 stdio MCP；显式启用后由 Agent 运行时连接并受逐次确认保护。 |
| Skill 运行时 | ✅ | 只加载用户在当前项目显式启用的技能目录，关闭 Pi 的默认/祖先目录自动发现。 |

### 关键设计与安全边界

#### 项目指令文件

- 只接受项目根目录的 `AGENTS.md` 和 `CLAUDE.md`，不会扫描父目录、会话目录或用户主目录。
- 每个文件必须是 UTF-8、无 NUL、少于 200 行且不超过 32 KiB；realpath 必须仍位于项目根目录。
- 内容被标记为低优先级指导，不能改变 Contour 的权限、工具、网络和凭据边界。
- Pi 的 context 文件自动发现已关闭，避免无意的祖先目录注入。

#### Web Search

- Tavily Key 只保存在本机设置中；读取设置接口只返回 `hasApiKey`，绝不回显明文 Key。
- 没有 Key 时不能启用；清除 Key 会自动关闭功能；关闭时 Agent 不会获得任何网络工具。
- `fetch_content` 仅限 HTTP(S)，拒绝 URL 凭据、私网/本机/链路本地/元数据地址、重定向后的不安全地址、附件、压缩或二进制响应。
- 请求不携带 Cookie，不下载文件，不执行命令，并限制重定向、响应体和超时；网页内容被视为不可信输入。

#### MCP 与 Skill

- MCP 仅允许项目内显式登记的本地 stdio 服务。命令必须是已存在的绝对可执行文件；拒绝 `cmd`、PowerShell、shell、`npm`、`npx`、`yarn` 等包装器。
- 最多 3 个 MCP 服务、总计最多 20 个工具；参数、环境变量、工具描述、JSON Schema 与结果都有长度/数量/深度上限。
- 只读模式不会启动 MCP 进程；review 与 yolo 模式中的外部 MCP 工具均须每次由用户确认，"记住此决定"不适用于 MCP。
- 连接限时 30 秒，调用限时 60 秒；运行时销毁时关闭所有 MCP Client/子进程。
- Skill 目录必须存在、为绝对目录且经 realpath 校验；仅使用 `additionalSkillPaths` 加载，禁用全局和祖先自动发现。
- MCP 与 Skill 都能影响 Agent 行为，因此"添加路径/服务"和"启用"分离；新增项默认关闭。

#### 文件预览

- 内置预览仅开放 PDF 与 XLSX；后端复用项目/Flow 授权，单文件上限 25 MiB，并设置 `no-store` 与 `nosniff`。
- XLSX 不使用存在高危依赖问题的 `xlsx` / `exceljs`，改用 `read-excel-file`；最多展示 20 个工作表、每表 250 行/80 列及 20,000 单元格。
- PDF 使用 `pdfjs-dist` 懒加载；两类预览失败均有系统打开回退，旧 `.xls` 保持系统打开。

### P0 修复（Proma Agent Review 后补修）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| P0-1 | IPv6 展开式 SSRF 绕过 | `web-search-tools.ts` | URL 构造器标准化 IPv6 + hostname 去方括号 |
| P0-2 | 权限规则路径穿越 | `permission-extension.ts` | `path.normalize()` + Windows 兼容 `.replace(/\\/g, '/')` |
| P0-4 | sanitizeToolPayload DoS | `pi-runtime.ts` | 新增 `MAX_TOTAL_NODES` 限流 + 递归 `nodeCount` 传递 |
| P0-5 | 双重 Auth Header | `flowSummary.ts` | provider 分支 `if/else if/else` 互斥 |
| P0-6 | SettingsManager 双重实例化 | `pi-runtime.ts` | 共享单例，通过 `createResourceLoader` 传入 |
| P0-7 | MCP 全有或全无失败 | `project-mcp-tools.ts` | 逐个 `try-catch` + `closeQuietly` + `continue` |

> P0-3（Tavily Key 明文落盘）经讨论确认为行业惯例（Claude Code、Proma 等均本地明文存储配置文件），跳过。

### Part 1 主要变更位置

| 区域 | 主要文件 |
| --- | --- |
| Agent 运行时 | `backend/src/agent/pi-runtime.ts`、`agent-runtime.ts`、`permission-extension.ts`、`channel-adapter.ts` |
| 项目指令/插件服务 | `backend/src/services/project-claude-instructions.ts`、`project-plugin-config.ts` |
| Agent/插件 API | `backend/src/api/ai.ts`、`project-plugins.ts`、`settings.ts`、`flows.ts`、`files.ts` |
| 工具 | `backend/src/tools/web-search-tools.ts`、`project-mcp-tools.ts`、`task-progress-tools.ts` |
| Agent UI | `frontend/src/components/agent/`、`ChatMessage.tsx`、`hooks/useChat.ts` |
| 设置与状态 | `frontend/src/pages/SettingsPage.tsx`、`components/settings/{WebSearchSettings,PluginSettings}.tsx`、`state/{projectPlugins,flowSummary,agentModelSelection}.ts` |
| 文件预览 | `frontend/src/components/agent/{PdfPreview,SpreadsheetPreview,FilePreview}.tsx` |

### Part 1 验证记录

```text
backend:  tsc --noEmit               -> 1 预存错误（flowSummary.ts），零新增
backend:  npm test                   -> 28 files / 237 tests 通过
frontend: tsc --noEmit               -> 零错误
frontend: npm test                   -> 18 files / 120 tests 通过
```

---

## Part 2：Phase 2C（审查修复完成，已合入 main）

> 分支 `codex/phase-2c-agent-experience`
>
> 功能 commit：`40c7258` → `1b2ee7c` → `256bc6d`
>
> 审查修复 commit：`53ad480`（PR #5 合并前完成）
>
> 8 个协作子 Agent 并行开发；后续由多维度审查、并行修复和两轮独立交叉验证收口。

### 完成范围

| # | 功能 | 说明 |
|---|------|------|
| 1 | **全站 skeleton/loading** | 路由感知骨架屏：通用 `PageSkeleton`、`AgentPageSkeleton`、`FlowPageSkeleton`；初次项目加载和路由懒加载均使用骨架屏。纯 Tailwind `animate-pulse`，无新依赖。 |
| 2 | **权限内联横幅** | `PermissionBanner.tsx` 嵌入对话流，替代弹窗。三个操作：允许本次 / 拒绝 / 本次会话所有同类放行（yolo 模式）。拒绝后横幅保留"已拒绝"状态；提交失败时保留重试入口。 |
| 3 | **AskUser 交互问答** | 后端实例级、按 prompt generation 隔离的 `AskUserRequestManager` + 自定义 `AskUserQuestion` 工具 + `POST /api/ai/ask-user-response` 端点。前端 `AskUserCard.tsx` 支持单选/多选/文本输入，收到 SSE 后立即嵌入对话流。 |
| 4 | **Turn 分组 + 文件改动汇总** | 后端 `turn_start`/`turn_end` SSE 事件，按同一轮次分组，并只统计成功 write/edit 的文件路径。前端 `TurnGroup.tsx` 可折叠展示。 |
| 5 | **@ 提及 Flow/Doc** | `MentionList.tsx` 在输入 `@` 后弹出，搜索项目 Flow/Doc/文件。键盘 ↑↓ Enter Escape 导航。后端 `GET /api/project/:id/search-mentions?q=` 端点。 |
| 6 | **Plan Mode MVP** | `ChatInputBar` 中 📋 切换开关（`planModeEnabledAtom`）。`PlanCard.tsx` 展示 Markdown 计划 + "批准并执行"/"修改计划"按钮。后端注册 TypeBox `EnterPlanMode`/`ExitPlanMode` 工具并转为 SSE 事件；批准后的下一轮会关闭 Plan Mode 并进入执行路径。 |
| 7 | **ContourMap: hover 预览** | Flow 节点 hover 300ms 后显示浮层卡片（标题 + 前 3 行摘要 + 更新时间）。纯 CSS，`pointer-events-none` 不干扰交互。 |
| 8 | **ContourMap: 自动布局** | `computeLayeredLayout()`：Tarjan SCC 缩点后对凝聚 DAG 横向分层；环内节点同层、下游节点继续向右排列。右下角"自动布局"按钮批量保存位置，防重复提交、失败提示并在全部请求结束后只刷新一次。 |
| 9 | **ContourMap: Claims 关联** | Flow 节点底部 Shield 徽标显示关联 Claims 数量，点击展开/折叠列表，含置信度标签 + 跳转链接。 |
| 10 | **pi-hermes-memory 调研** | `docs/hermes-memory-assessment.md` 评估报告。结论：暂缓——与 Contour"不采用本地数据库"规则冲突，需 Z 确认策略后再定。 |

### 🔧 附带修复

- `useChat.ts`：`onError` 回调中 `partialContent` 始终为空的 pre-existing bug（参数被重命名但 body 引用了外层局部变量）

### 审查后修复

- **AskUser 生命周期**：消除卡片不渲染、120 秒 watchdog 中断、并发 Runtime 串流和旧 prompt 清理新请求的问题；用户答案会保存到消息历史。
- **Plan Mode 闭环**：补齐后端事件工具和输入栏开关，批准计划后显式以普通执行模式发送下一轮请求。
- **交互健壮性**：权限响应失败保留横幅重试入口；会话切换会中止旧 SSE 并忽略陈旧回调。
- **ContourMap**：循环关系不再导致节点消失或下游边反向；自动布局避免并发保存和重复项目刷新。

### Part 2 主要变更位置

| 区域 | 主要文件 |
| --- | --- |
| Agent 运行时 | `backend/src/agent/pi-runtime.ts`、`agent-runtime.ts`、`ask-user.ts`（新） |
| API | `backend/src/api/ai.ts`、`backend/src/api/project.ts` |
| Skeleton | `frontend/src/components/ui/Skeleton.tsx`（新）、`PageSkeleton.tsx`（新）、`AgentPageSkeleton.tsx`（新）、`FlowPageSkeleton.tsx`（新） |
| Agent 组件 | `frontend/src/components/agent/PermissionBanner.tsx`（新）、`AskUserCard.tsx`（新）、`PlanCard.tsx`（新）、`TurnGroup.tsx`（新）、`MentionList.tsx`（新） |
| Agent UI 修改 | `frontend/src/components/agent/SessionChat.tsx`、`ChatInputBar.tsx`、`ChatMessage.tsx` |
| ContourMap | `frontend/src/components/ContourMap.tsx`、`frontend/src/pages/ContourView.tsx` |
| 状态与 Hook | `frontend/src/state/chat.ts`、`aiApi.ts`、`frontend/src/hooks/useChat.ts` |
| 入口 | `frontend/src/App.tsx`、`frontend/src/pages/AgentView.tsx` |

### Part 2 验证记录

```text
backend:  npm test                   -> 29 files / 246 tests 通过
backend:  npm run build              -> 1 预存错误（flowSummary.ts:144 TS2367），零新增
frontend: npm run build              -> 通过（tsc --noEmit + Vite）
frontend: npm test                   -> 21 files / 136 tests 通过
runtime:  GET /api/project           -> 200
runtime:  POST 过期 ask-user 响应    -> 404（符合预期）
```

新增回归测试覆盖 AskUser 跨 Runtime 与同 Runtime prompt generation 隔离、HTTP 响应路由、Plan 工具、权限重试、Plan 批准切换、Turn 分组、SCC 布局、批量保存失败和骨架屏无障碍语义。

---

## 综合依赖审计与残余风险

### 后端

`npm audit --json` 的结果为 `1 high / 3 moderate / 2 low / 0 critical`。

- High：`@earendil-works/pi-coding-agent` 的 shrinkwrap 内嵌 `brace-expansion`。升级 Pi 到 `0.80.10` 会移除 `AuthStorage` / `ModelRegistry` API，需单独安排兼容迁移。
- Moderate：Express 的 `qs` 链路，以及 Pi 依赖的 `protobufjs`。
- Low：`body-parser`、开发期 `esbuild`。

### 前端

`npm audit --json` 的结果为 `2 high / 1 low / 0 critical`。

- High：React Router RSC Mode CSRF advisory。Contour 是纯 SPA，不使用 React Server Components，受影响面为零。
- Low：构建期 `@babel/core` source map 文件读取 advisory。

---

## 建议的人工复核

### Phase 2A+2B

1. 在设置中配置 Tavily Key，确认开启后可检索；关闭或清除 Key 后 Agent 不再有网络工具。
2. 在"插件"页添加一个无害的本地 stdio MCP。确认默认关闭；只读会话不启动它；review/yolo 调用均出现确认请求。
3. 在项目根创建 `AGENTS.md` / `CLAUDE.md`，开始新对话确认 Agent 遵守约定；移除文件确认不残留。
4. 从文件面板打开 PDF 和 XLSX，确认懒加载预览、工作表切换、缩放/分页及系统打开回退。
5. 测试模型切换、停止、复制、草稿恢复、工具详情和任务进度。

### Phase 2C（合并后人工验收）

6. 路由切换时的骨架屏效果（/agent → /flows → /settings）
7. 权限确认不再弹窗，改为对话流内联横幅
8. Plan Mode 开关 → 发消息 → 审批/修改计划卡片交互
9. 输入框 @ 弹出建议列表，键盘导航选择文件
10. ContourMap 节点 hover 预览 + 自动布局按钮 + Claims 徽标

---

## Phase 2 完成度

```
Phase 2A: ████████████ 12/12  100%  已合入 main
Phase 2B: ██████████░░  9/10   90%  pi-hermes-memory 暂缓
Phase 2C: ██████████░░  9/10   90%  code splitting 跳过（Electron 场景无收益）
────────────────────────────────────
总体:     ██████████░░ 30/32   94%
```
