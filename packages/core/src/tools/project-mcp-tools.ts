/**
 * 受控 MCP stdio 桥接。
 *
 * 此模块只接收 project-plugin-config 已显式启用且二次校验通过的配置；不支持
 * HTTP/SSE/OAuth，不自动发现服务，不将 MCP 的原始 schema 或结果无限制地交给模型。
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Type } from "typebox";
import type { McpServerConfig, ProjectPluginConfigService } from "../services/project-plugin-config.js";

const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 60_000;
const MAX_TOTAL_TOOLS = 20;
const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_SCHEMA_CHARS = 12_000;
const MAX_RESULT_CHARS = 12_000;
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_ENTRIES = 80;
const MAX_RESULT_DEPTH = 6;
const MAX_RESULT_ENTRIES = 60;
const INHERITED_ENV_NAMES = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "LANG", "LC_ALL"] as const;

type McpListedTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

interface McpClientLike {
  connect(transport: StdioClientTransport): Promise<void>;
  listTools(
    params?: { cursor?: string },
    options?: { timeout?: number; maxTotalTimeout?: number },
  ): Promise<{ tools: McpListedTool[] }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { timeout?: number; maxTotalTimeout?: number; signal?: AbortSignal },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface ProjectMcpTools {
  tools: Array<{ name: string; label: string; description: string; parameters: unknown; execute: (...args: any[]) => Promise<unknown> }>;
  /** 外部 MCP 工具在 review 与 yolo 都必须逐次确认。 */
  reviewConfirmationToolNames: string[];
  dispose(): Promise<void>;
}

export interface CreateProjectMcpToolsOptions {
  projectId: string;
  projectDir: string;
  /** readonly 时调用方根本不应请求连接；此字段是纵深防线。 */
  permissionMode: "readonly" | "review" | "yolo";
  /** 测试注入点；生产环境始终使用 MCP Client。 */
  createClient?: () => McpClientLike;
  createTransport?: (server: McpServerConfig, environment: Record<string, string>) => StdioClientTransport;
  plugins: Pick<ProjectPluginConfigService, "getEnabledProjectMcpServers">;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…（内容已截断）`;
}

function safeJson(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return truncate(value, MAX_RESULT_CHARS);
  if (typeof value === "undefined") return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (depth >= MAX_RESULT_DEPTH || typeof value !== "object") return "[已省略]";
  if (seen.has(value)) return "[循环引用]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, MAX_RESULT_ENTRIES).map((item) => safeJson(item, depth + 1, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_RESULT_ENTRIES)
    .map(([key, item]) => [key, safeJson(item, depth + 1, seen)]));
}

function sanitizeSchema(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > MAX_SCHEMA_DEPTH) return null;
  const source = value as Record<string, unknown>;
  if (source.type !== "object") return null;
  const copied = Object.fromEntries(Object.entries(source).slice(0, MAX_SCHEMA_ENTRIES).flatMap(([key, item]) => {
    if (key === "properties" && item && typeof item === "object" && !Array.isArray(item)) {
      const properties = Object.fromEntries(Object.entries(item as Record<string, unknown>).slice(0, MAX_SCHEMA_ENTRIES).flatMap(([name, schema]) => {
        const nested = sanitizeSchema(schema, depth + 1) ?? (schema && typeof schema === "object" && !Array.isArray(schema) ? schema : null);
        return nested ? [[name, nested]] : [];
      }));
      return [[key, properties]];
    }
    if (key === "required" && Array.isArray(item)) return [[key, item.filter((entry) => typeof entry === "string").slice(0, MAX_SCHEMA_ENTRIES)]];
    if (["type", "title", "description", "additionalProperties", "enum", "default", "items", "minimum", "maximum", "minLength", "maxLength", "pattern"].includes(key)) {
      return [[key, typeof item === "string" ? truncate(item, MAX_DESCRIPTION_CHARS) : item]];
    }
    return [];
  }));
  try {
    return JSON.stringify(copied).length <= MAX_SCHEMA_CHARS ? copied : null;
  } catch {
    return null;
  }
}

function minimalEnvironment(extra: Record<string, string>): Record<string, string> {
  const inherited = Object.fromEntries(INHERITED_ENV_NAMES.flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }));
  return { ...inherited, ...extra };
}

function mcpToolName(serverIndex: number, toolIndex: number, original: string): string {
  const normalized = original.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 36) || "tool";
  return `mcp_${serverIndex + 1}_${toolIndex + 1}_${normalized}`;
}

function formatMcpResult(value: unknown): string {
  try {
    return truncate(JSON.stringify(safeJson(value), null, 2) ?? "null", MAX_RESULT_CHARS);
  } catch {
    return "[MCP 工具返回了无法安全序列化的结果]";
  }
}

async function closeQuietly(client: McpClientLike): Promise<void> {
  try { await client.close(); } catch { /* 连接可能已由超时关闭。 */ }
}

async function connectWithTimeout(client: McpClientLike, transport: StdioClientTransport): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`MCP 服务连接超时（${CONNECT_TIMEOUT_MS / 1000} 秒）`)), CONNECT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 建立当前项目已启用的本地 MCP 连接，并转换成 Pi ToolDefinition 兼容对象。
 * readonly 永远返回空集合，防止只读会话触发任何外部可执行程序。
 */
export async function createProjectMcpTools(options: CreateProjectMcpToolsOptions): Promise<ProjectMcpTools> {
  if (options.permissionMode === "readonly") {
    return { tools: [], reviewConfirmationToolNames: [], dispose: async () => {} };
  }

  const servers = options.plugins.getEnabledProjectMcpServers(options.projectId).slice(0, 3);
  const clients: McpClientLike[] = [];
  const tools: ProjectMcpTools["tools"] = [];
  const reviewConfirmationToolNames: string[] = [];

    for (const [serverIndex, server] of servers.entries()) {
      if (tools.length >= MAX_TOTAL_TOOLS) break;
      // SDK 的 Client 有比桥接所需更宽的泛型签名；在唯一边界处收窄，避免
      // 让 MCP 协议类型渗入 Agent 工具层。
      const client = options.createClient?.() ?? new Client({ name: "contour", version: "1.0.0" }) as unknown as McpClientLike;
      try {
        const environment = minimalEnvironment(server.env);
        const transport = options.createTransport?.(server, environment) ?? new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: environment,
          cwd: options.projectDir,
          stderr: "pipe",
          maxBufferSize: MAX_RESULT_CHARS * 4,
        });
        await connectWithTimeout(client, transport);
        clients.push(client);

        const listed = await client.listTools(undefined, { timeout: CONNECT_TIMEOUT_MS, maxTotalTimeout: CONNECT_TIMEOUT_MS });
        const permitted = listed.tools.slice(0, Math.min(server.toolLimit, MAX_TOTAL_TOOLS - tools.length));
        for (const [toolIndex, remoteTool] of permitted.entries()) {
          if (!remoteTool || typeof remoteTool.name !== "string" || !remoteTool.name.trim()) continue;
          const schema = sanitizeSchema(remoteTool.inputSchema);
          if (!schema) continue;
          const name = mcpToolName(serverIndex, toolIndex, remoteTool.name);
          const description = truncate(remoteTool.description?.trim() || `调用 MCP 服务 ${server.name} 的 ${remoteTool.name}`, MAX_DESCRIPTION_CHARS);
          tools.push({
            name,
            label: `MCP: ${server.name} / ${remoteTool.name}`,
            description,
            parameters: Type.Unsafe(schema),
            execute: async (_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) => {
              const result = await client.callTool(
                { name: remoteTool.name, arguments: params },
                undefined,
                { timeout: CALL_TIMEOUT_MS, maxTotalTimeout: CALL_TIMEOUT_MS, signal },
              );
              return {
                content: [{ type: "text" as const, text: formatMcpResult(result) }],
                details: { source: "mcp", server: server.name, tool: remoteTool.name },
              };
            },
          });
          reviewConfirmationToolNames.push(name);
        }
      } catch (error) {
        console.warn(`[ProjectMcpTools] MCP 服务 ${server.name} 连接失败，已跳过:`, error);
        await closeQuietly(client);
        continue;
      }
    }

  return {
    tools,
    reviewConfirmationToolNames,
    dispose: async () => { await Promise.all(clients.map(closeQuietly)); },
  };
}
