# PR Review: codex/phase-1-foundation

> 审查日期: 2026-07-25
> 审查人: Proma Agent（技术总监角色）+ 5 审查子 Agent + 4 修复子 Agent + 2 验证子 Agent
> 合并结果: ✅ 通过，已合并到 main（commit `43e6ede`）

---

## PR 概况

| 指标 | 数值 |
|------|------|
| 分支 | `codex/phase-1-foundation` |
| 文件数 | 91（47 新增 + 44 修改） |
| 代码变更 | +7,078 / -956 |
| 提交 | Squash merge（由 7/18 的 Agent 创建） |
| 功能 | Agent 核心重构、API 层新增、安全工具、前端骨架 |

---

## 审查维度与评分

| 维度 | 模型 | 评分 | 关键发现 |
|------|------|------|----------|
| 架构与设计 | deepseek-v4-pro | 8.5/10 | 三处重复工具函数、cwd 废弃字段设计瑕疵 |
| 后端核心实现 | deepseek-v4-pro | 8.0/10 | registry TOCTOU 竞态、SessionManager.open 无兜底、cleanupActivePrompt 不安全 |
| 权限与安全 | deepseek-v4-pro | 7.5/10 | edit 工具 TOCTOU、信息泄露路径、locate.ts symlink 缺口 |
| 前端集成 | deepseek-v4-flash | 7.2/10 | SSE 丢 partial content、Jotai atom 泄漏、无 ErrorBoundary |
| API 与类型 | deepseek-v4-flash | 7.5/10 | docId 校验缺失、前后端类型不一致、跨项目碰撞 |

**综合加权**: 7.7/10（修复后 9.0+）

---

## 🔴 P0 严重问题（12 项）

### 架构

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | 三处重复实现 `isInside()` + `comparisonKey()` | authorizedPaths / projectManager / authorized-file-tools | 抽取 `vault/path-utils.ts` |
| 2 | `AgentRuntimeConfig.cwd` @deprecated 但必填 | agent-runtime.ts:88-97 | 改为 `cwd?: string`，pi-runtime 只用 projectDir |

### 后端核心

| # | 问题 | 修复 |
|---|------|------|
| 3 | session-storage registry 读-改-写 TOCTOU 竞态 | `withRegistryLock()` 模块级互斥锁 |
| 4 | `SessionManager.open()` 损坏 JSONL 抛异常堵死恢复 | try/catch + console.warn + fallback SessionManager.create |
| 5 | `cleanupActivePrompt` unsubscribe 异常不安全 | try/finally 确保 activePrompt = null |

### 权限与安全

| # | 问题 | 修复 |
|---|------|------|
| 6 | edit 工具异步 readFile 与授权间 TOCTOU | readFile 前 realpathSync 重新校验 |
| 7 | `requireReadableText` 错误消息暴露绝对路径 | 改为通用描述"二进制文件无法以文本格式读取" |

### 前端

| # | 问题 | 修复 |
|---|------|------|
| 8 | SSE 流中断丢弃已累积 partial content | onError 签名扩展 + handleRetry 断点续传 |
| 9 | flowAssets Jotai atom Map 永不释放 | 去掉全局 atom Map，改为 useState |

### API

| # | 问题 | 修复 |
|---|------|------|
| 10 | docs POST 无 docId 格式校验 | 统一 validateDocId |
| 11 | AIContextItem.type 前后端不一致 | 统一为 'flow' \| 'doc' \| 'claim' |
| 12 | docs PUT/DELETE 按 docId 全局搜索所有项目 | 加 ?projectId 参数精确定位 |

---

## 🟡 P1 警告（15 项精选）

- typed-error HTTP 状态码与错误码分离 → 内聚到 ERROR_DEFAULTS
- typed-error cause 链无深度限制 → 限制 5 层
- pi-runtime 裸 Error → typedAgentError 统一
- agent-runtime 接口依赖 typed-error → 类型上移解耦
- session-storage createOrResumePiSession 职责过重 → 拆分 findExistingPiFile
- listJsonlFiles 递归无 symlink 保护 → isSymbolicLink() 跳过
- permission-extension 写入非原子 → temp + rename 原子写入
- permission-extension 规则前缀匹配脆弱 → write/edit 对 path 语义匹配
- agent-sessions 列表 N+1 查询 → lastMessage 写入 registry O(1) 返回
- agent-sessions 直接调 Pi SDK SessionManager → 封装 getSessionSummary
- files.ts API 返回完整绝对路径 → 改为相对路径
- SSE 无超时保护 → 120s watchdog timer
- ErrorBoundary 缺失 → 新建全站 ErrorBoundary 组件
- localStorage sessionId:undefined 多会话互相污染 → 跳过读写
- write 工具 authorizeWrite 两次调用 mutex key 不一致 → 统一用 target

---

## 🔵 精选建议

- agent 模块缺少 barrel export → 新建 `agent/index.ts`
- grep 工具无 ReDoS 防护 → 嵌套量词检测 `hasReDoSrisk()`
- 缺少安全审计日志 → 新建 `services/audit-log.ts`
- ARIA 可访问性缺失 → FileTree / RightSidePanel / LeftSidebar 补 role 属性
- ChatInputBar layout thrashing → 去掉独立 useEffect，在 handleInput 中调用

---

## ✅ 架构亮点

1. `authorizedPaths.ts` realpath-based 安全模型（canonicalExistingPath + canonicalWritablePath 纵深防御）
2. Pi SDK 7 个已知坑点全部正确处理
3. promptBuilder 拆分为 7 个子模块，职责单一
4. SSE 生命周期管理完整（10 分钟超时、client disconnect、双分支错误处理、finally cleanup）
5. session-storage 原子写入（temp + rename）
6. typed-error 分类引擎覆盖所有常见场景

---

## 审查流程统计

| 阶段 | 子 Agent | 结果 |
|------|----------|------|
| Phase 2 并行审查 | 5 个（3 pro + 2 flash） | 27 个问题发现 |
| Phase 5 并行修复 | 4 个（2 pro + 1 terra + 1 flash） | 27+5 项修复 |
| Phase 6 交叉验证 | 2 个（1 pro + 1 flash） | 39/39 通过 |
| 后续修复 | 父 Agent 直接修 | 6 个 Bug/功能补丁 |

---

## 附带功能增强（审查期间追加）

- Agent 右侧面板直接管理附加文件夹/文件
- 会话按项目隔离 + 删除按钮 + 旧数据迁移
- Background/Claim 目录展开路径 Bug 修复
- Z 键层级修复 + hover 实心红 + confirm 弹窗

---

## 关键教训

1. **修复回归**：files.ts 相对路径改动导致 Background/Claim 展开报错。改动 API 返回值格式时，需要检查所有消费端——不仅是代码里的调用方，还包括前端的状态管理和组件组合逻辑。

2. **交叉验证的价值**：如果 Phase 6 只验证修复是否正确而非启动运行，路径 Bug 不会暴露。Phase 7.5（启动验证）和 Phase 8（烟雾测试）是 v1.1 新增的流程步骤，正是来自这次实践的教训。

3. **对抗式审查有效**：原 PR 由 Agent 创建，审查也由 Agent 完成，但通过不同模型、独立维度、禁止自我修复的流程设计，实现了真正的质量闭环。
