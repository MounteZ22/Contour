# Contour Phase 2 完成报告

> 完成时间：2026-07-30（北京时间）
>
> 分支：`codex/phase-2a-agent-experience`
>
> 范围：Phase 2A 与 Phase 2B；Phase 2C 仍是后续工作。

## 结果概览

Phase 2 将 Agent 从可用骨架补齐为可控制、可追踪、可配置的研究协作界面，并补上受限 Web 检索、项目指令文件、Flow 摘要、文件预览及项目插件管理。实现遵循本地优先和最小权限：外部网络、MCP 进程、Skill 指令都必须由用户显式配置或确认。

## 完成范围

| 模块 | 状态 | 交付内容 |
| --- | --- | --- |
| Agent 体验基础 | 完成 | 首条消息建会话、模型选择、会话重命名、草稿保存、停止、复制、重试及中文错误提示。 |
| 执行可见性 | 完成 | 工具调用显示脱敏后的参数和结果；原始模型推理不传到前端；TaskCreate/TaskUpdate 驱动当前轮任务浮层。 |
| 响应式与性能 | 完成 | 移动端右栏遮罩、焦点与 Escape 关闭；Flow 窄屏适配；路由与大型预览组件按需加载。 |
| 项目指令 | 完成 | 每轮显式读取项目根目录的 `AGENTS.md`、`CLAUDE.md`，按该顺序追加为低优先级指南。 |
| Flow 摘要 | 完成 | 服务端读取 Flow 后生成草稿；用户确认后原子写入 `flow_summary.md`。 |
| 网络检索 | 完成 | 设置页可启用/停用 Tavily、保存 API Key；`web_search` 与 `fetch_content` 仅在已启用且有 Key 时注入。 |
| PDF/XLSX 预览 | 完成 | 内置 PDF 分页/缩放和 XLSX 多工作表预览；解析失败时仍可交给系统程序。 |
| 插件管理 | 完成 | 设置页的“插件”按项目管理 MCP 与 Skill；配置持久化在项目数据目录的 `plugins.json`。 |
| MCP 运行时 | 完成 | 仅受限的本地 stdio MCP；显式启用后由 Agent 运行时连接并受逐次确认保护。 |
| Skill 运行时 | 完成 | 只加载用户在当前项目显式启用的技能目录，关闭 Pi 的默认/祖先目录自动发现。 |

## 关键设计与安全边界

### 项目指令文件

- 只接受项目根目录的 `AGENTS.md` 和 `CLAUDE.md`，不会扫描父目录、会话目录或用户主目录。
- 每个文件必须是 UTF-8、无 NUL、少于 200 行且不超过 32 KiB；realpath 必须仍位于项目根目录。
- 内容被标记为低优先级指导，不能改变 Contour 的权限、工具、网络和凭据边界。
- Pi 的 context 文件自动发现已关闭，避免无意的祖先目录注入。

### Web Search

- Tavily Key 只保存在本机设置中；读取设置接口只返回 `hasApiKey`，绝不回显明文 Key。
- 没有 Key 时不能启用；清除 Key 会自动关闭功能；关闭时 Agent 不会获得任何网络工具。
- `fetch_content` 仅限 HTTP(S)，拒绝 URL 凭据、私网/本机/链路本地/元数据地址、重定向后的不安全地址、附件、压缩或二进制响应。
- 请求不携带 Cookie，不下载文件，不执行命令，并限制重定向、响应体和超时；网页内容被视为不可信输入。

### MCP 与 Skill

- MCP 仅允许项目内显式登记的本地 stdio 服务。命令必须是已存在的绝对可执行文件；拒绝 `cmd`、PowerShell、shell、`npm`、`npx`、`yarn` 等包装器。
- 最多 3 个 MCP 服务、总计最多 20 个工具；参数、环境变量、工具描述、JSON Schema 与结果都有长度/数量/深度上限。
- 只读模式不会启动 MCP 进程；review 与 yolo 模式中的外部 MCP 工具均须每次由用户确认，“记住此决定”不适用于 MCP。
- 连接限时 30 秒，调用限时 60 秒；运行时销毁时关闭所有 MCP Client/子进程。
- Skill 目录必须存在、为绝对目录且经 realpath 校验；仅使用 `additionalSkillPaths` 加载，禁用全局和祖先自动发现。
- MCP 与 Skill 都能影响 Agent 行为，因此“添加路径/服务”和“启用”分离；新增项默认关闭。

### 文件预览

- 内置预览仅开放 PDF 与 XLSX；后端复用项目/Flow 授权，单文件上限 25 MiB，并设置 `no-store` 与 `nosniff`。
- XLSX 不使用存在高危依赖问题的 `xlsx` / `exceljs`，改用 `read-excel-file`；最多展示 20 个工作表、每表 250 行/80 列及 20,000 单元格。
- PDF 使用 `pdfjs-dist` 懒加载；两类预览失败均有系统打开回退，旧 `.xls` 保持系统打开。

## 主要变更位置

| 区域 | 主要文件 |
| --- | --- |
| Agent 运行时 | `contour-web/backend/src/agent/pi-runtime.ts`、`agent-runtime.ts`、`permission-extension.ts`、`channel-adapter.ts` |
| 项目指令/插件服务 | `contour-web/backend/src/services/project-claude-instructions.ts`、`project-plugin-config.ts` |
| Agent/插件 API | `contour-web/backend/src/api/ai.ts`、`project-plugins.ts`、`settings.ts`、`flows.ts`、`files.ts` |
| 工具 | `contour-web/backend/src/tools/web-search-tools.ts`、`project-mcp-tools.ts`、`task-progress-tools.ts` |
| Agent UI | `contour-web/frontend/src/components/agent/`、`ChatMessage.tsx`、`hooks/useChat.ts` |
| 设置与状态 | `contour-web/frontend/src/pages/SettingsPage.tsx`、`components/settings/{WebSearchSettings,PluginSettings}.tsx`、`state/{projectPlugins,flowSummary,agentModelSelection}.ts` |
| 文件预览 | `contour-web/frontend/src/components/agent/{PdfPreview,SpreadsheetPreview,FilePreview}.tsx` |

## 验证记录

在最终依赖安装后的独立验收中：

```text
backend:  npm install                 -> 通过，锁文件与安装状态一致
backend:  npm run build               -> 通过
backend:  npm test                    -> 28 files / 234 tests 通过
frontend: npm install                 -> 通过，锁文件与安装状态一致
frontend: npm run build               -> 通过
frontend: npm test                    -> 17 files / 113 tests 通过
git diff --check                      -> 通过
```

新增测试覆盖了以下高风险边界：项目根指令加载与大小限制、Flow 摘要保存、Web Search Key 脱敏与 SSRF 防护、MCP 命令白名单与工具上限、readonly 不连接 MCP、yolo 下的 MCP 强制逐次确认、显式 Skill 加载、文件内容授权以及任务追踪。

## 依赖审计与残余风险

### 后端

`npm audit --json` 的结果为 `1 high / 3 moderate / 2 low / 0 critical`。

- High：`@earendil-works/pi-coding-agent` 的 shrinkwrap 内嵌 `brace-expansion`。尝试升级 Pi 到 `0.80.10` 会移除当前运行时使用的 `AuthStorage` / `ModelRegistry` API，导致 TypeScript 编译失败。为不在功能批次中上线无法启动的 Agent，本次保留已验证的 `0.80.3`，应单独安排 Pi 兼容迁移。
- Moderate：Express 的 `qs` 链路，以及 Pi 依赖的 `protobufjs`。
- Low：`body-parser`、开发期 `esbuild`。

### 前端

`npm audit --json` 的结果为 `2 high / 1 low / 0 critical`。

- High：React Router 的 RSC Mode CSRF advisory。Contour 当前是纯 SPA，不使用 React Server Components 或 Server Actions，因此不走受影响的执行面；仍需关注上游正式修复版本并在可兼容时升级。
- Low：构建期 `@babel/core` source map 文件读取 advisory。

以上风险均没有被忽略或通过不兼容的强制升级掩盖。发布前应由审查者确认接受这些上游依赖风险，或单独排期兼容升级。

## 建议的人工复核

1. 在设置中配置 Tavily Key，确认开启后可检索；关闭或清除 Key 后同一 Agent 不再能看到网络工具。
2. 选择一个项目，在“插件”页添加一个无害的本地 stdio MCP。确认它默认关闭；只读会话不启动它，review/yolo 调用都会出现确认请求。
3. 添加一个包含 `SKILL.md` 的目录，确认默认关闭，启用后才会被当前项目的 Agent 识别。
4. 在项目根创建极小的 `AGENTS.md` 与 `CLAUDE.md`，开始新一轮 Agent 对话，确认模型能遵守二者的项目约定；再移除文件确认不残留。
5. 从文件面板打开一份 PDF 和 XLSX，确认懒加载预览、工作表切换、缩放/分页及系统打开回退。
6. 发送第一条 Agent 消息，确认它才创建会话；测试模型切换、停止、复制、草稿恢复、工具详情和任务进度。

## 后续范围

Phase 2C 尚未开始：Turn 分组和文件改动汇总、权限内联横幅、AskUser、`@` 提及、Plan Mode、全站 skeleton，以及 ContourMap 的自动布局/小地图/Claim 关联。这些应作为后续独立任务评估，不应被视为本次提交的隐含承诺。
