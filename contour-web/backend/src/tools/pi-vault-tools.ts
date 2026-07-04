/**
 * pi-vault-tools — Contour 业务工具的 Pi SDK 封装
 *
 * 把现有的 getFlowDetail / searchFlows / getDoc 三个 Vault 工具包装成
 * Pi SDK 的 ToolDefinition 格式（TypeBox schema），通过 createAgentSession
 * 的 customTools 参数注入，让 Pi Agent 能主动查询 Flow/Doc 数据。
 *
 * 设计要点：
 * - 复用 toolRegistry.executeTool 作为统一执行入口，业务逻辑不重复
 * - 参数 schema 用 TypeBox（Pi SDK v0.80.3 的实际要求，非 JSON Schema / Zod，
 *   见调研报告第二节）。TypeBox 是 pi-coding-agent 的嵌套依赖，已被 hoist
 *   到顶层 node_modules，可直接 import
 * - 放在 tools/ 目录（而非 agent/），因为它依赖 Pi SDK 类型 + vaultTools
 *   实现，属于"跨 Pi SDK 和业务"的适配层，和 toolRegistry 同属工具层
 */

import { Type, type Static } from "typebox";
import { executeTool } from "./toolRegistry.js";

// ── 参数 schema ─────────────────────────────────────────────────────────────

const getFlowDetailParams = Type.Object({
  flowId: Type.String({
    description: 'Flow 的唯一标识符，如 "F1"、"experiment-setup"',
  }),
});

const searchFlowsParams = Type.Object({
  query: Type.String({ description: "搜索关键词" }),
});

const getDocParams = Type.Object({
  docId: Type.String({
    description: '文档的唯一标识符，如 "project_brief"、"glossary"',
  }),
});

// ── 工具执行辅助 ─────────────────────────────────────────────────────────────

/**
 * 把 executeTool 的 string 返回值包装成 Pi SDK 的 AgentToolResult 格式
 *
 * executeTool 出错时返回 `JSON.stringify({error:...})` 字符串（而非抛异常），
 * 这里原样塞进 content 让 Agent 看到错误信息，不设 isError（保持和旧 /chat
 * 一致的"工具成功执行但返回错误内容"语义）。
 */
async function runVaultTool(
  toolName: "getFlowDetail" | "searchFlows" | "getDoc",
  params: Record<string, unknown>,
) {
  const result = await executeTool(toolName, params);
  return {
    content: [{ type: "text" as const, text: result }],
    details: {},
  };
}

// ── Pi 工具定义 ─────────────────────────────────────────────────────────────

/**
 * 追加到 system prompt 的业务工具使用引导
 *
 * 必要性：某些模型（如 kimi-coding）工具选择能力弱，默认倾向用内置 read
 * 工具去文件系统搜数据，但 Flow/Doc 存储在 Contour vault 中，read 访问不到，
 * 会陷入循环。这里明确引导模型：查 Flow/Doc 必须用业务工具。
 */
export const VAULT_TOOLS_PROMPT = `
## 工具使用说明

Contour 的 Flow 和 Doc 数据存储在 Contour vault 中，不在文件系统里，内置的 read/grep/find 工具访问不到。当用户请求涉及 Flow 或 Doc 的查询、搜索、读取时，**必须**使用以下业务工具：

- searchFlows(query)：按关键词搜索 Flow（标题/摘要/标签匹配）。用户说"搜索/查找/找一下相关 flow"时用这个。
- getFlowDetail(flowId)：按 ID 读取 Flow 完整内容（含所有章节）。用户给出 flowId 或要深入了解某 flow 时用。
- getDoc(docId)：按 ID 读取 Doc 完整内容。用户要查看项目文档/术语表等时用。

不要用 read 工具去文件系统找 Flow/Doc 数据，那会失败。
`.trim();

/**
 * Contour 业务工具的 Pi ToolDefinition 数组
 *
 * 传给 PiRuntime → createAgentSession({ customTools })。
 * Pi SDK 中自定义工具优先级高于内置工具（同名覆盖），这里三个工具名和内置
 * 工具不冲突，会和内置 read 等工具并存。
 *
 * 类型上不强标 PiToolDefinition（泛型签名复杂），由 createAgentSession 的
 * customTools 参数做结构校验，tsc 会拦截不匹配。
 */
export const contourCustomTools = [
  {
    name: "getFlowDetail",
    label: "Get Flow Detail",
    description:
      "读取指定研究脉络（Flow）的完整内容，包括所有章节。需要深入了解某个研究方向的详细信息时调用。",
    parameters: getFlowDetailParams,
    execute: async (_toolCallId: string, params: Static<typeof getFlowDetailParams>) =>
      runVaultTool("getFlowDetail", params),
  },
  {
    name: "searchFlows",
    label: "Search Flows",
    description:
      "按关键词搜索研究脉络（Flow）。在标题、摘要、标签中匹配。返回匹配的 Flow 摘要列表。需要查找相关内容但不确定具体 Flow ID 时调用。",
    parameters: searchFlowsParams,
    execute: async (_toolCallId: string, params: Static<typeof searchFlowsParams>) =>
      runVaultTool("searchFlows", params),
  },
  {
    name: "getDoc",
    label: "Get Document",
    description:
      "读取指定文档（Doc）的完整内容。需要查看项目文档、研究计划、术语表等详细信息时调用。",
    parameters: getDocParams,
    execute: async (_toolCallId: string, params: Static<typeof getDocParams>) =>
      runVaultTool("getDoc", params),
  },
];
