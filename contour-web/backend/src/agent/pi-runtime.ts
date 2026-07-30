/**
 * PiRuntime — 基于 @earendil-works/pi-coding-agent 的 AgentRuntime 实现
 *
 * 封装 createAgentSession() 为 AgentRuntime 接口，提供：
 * - 事件流桥接：将 Pi SDK 的 callback 订阅模式转换为 AsyncIterable
 * - baseUrl 覆盖：通过 ModelRegistry.registerProvider() 设置自定义端点
 * - 订阅生命周期管理：每次 prompt() 清理旧订阅，dispose() 做最终释放
 *
 * 当前能力：
 * - 多 provider 支持（anthropic / kimi-coding / deepseek 等，通过 config.provider）
 * - 内置工具默认仅开放 read，可通过 config.customTools 注入业务工具
 * - 业务上下文通过 config.systemPrompt 注入（追加到 Pi 默认 system prompt）
 * - 所有配置通过 init() 参数传入，不读环境变量
 */

import path from "path";
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import type {
  AgentRuntime,
  AgentRuntimeConfig,
  AgentStreamEvent,
  PromptOptions,
} from "./agent-runtime.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createOrResumePiSession } from "./session-storage.js";
import { createPermissionExtensionFactory, createPermissionRequest, rejectAllPendingRequests } from "./permission-extension.js";
import type { PermissionRequesterFn } from "./permission-extension.js";
import { classifyAgentError, typedAgentError } from "./typed-error.js";
import { createAuthorizedFileTools } from "../tools/authorized-file-tools.js";
import { applyAgentToolPolicy } from "./tool-policy.js";
import { createProjectMcpTools, type ProjectMcpTools } from "../tools/project-mcp-tools.js";
import { AskUserRequestManager, type AskUserRequestLifecycle } from "./ask-user.js";

// ── 内部类型 ─────────────────────────────────────────────────────────────────

/** prompt() 调用对应的内部状态，用于管理单次对话的生命周期 */
interface ActivePrompt {
  /** 事件队列（消费者未等待时暂存事件） */
  queue: AgentStreamEvent[];
  /** 等待事件的 resolve 回调（消费者在队列空时注册等待） */
  waitingResolve: ((event: IteratorResult<AgentStreamEvent>) => void) | null;
  /** 是否已结束 */
  done: boolean;
  /** Pi SDK 订阅取消函数 */
  unsubscribe: () => void;
  /** AskUser 管理器中属于当前 prompt 的 generation。 */
  askUserGeneration: number | null;
}

const MAX_TOOL_PAYLOAD_CHARS = 12_000;
const MAX_TOOL_PAYLOAD_DEPTH = 6;
const MAX_TOOL_PAYLOAD_ENTRIES = 50;
const MAX_TOTAL_NODES = 5_000;
const SENSITIVE_TOOL_FIELD = /(?:api[_-]?key|token|secret|password|authorization|cookie|credential)/i;
const SENSITIVE_TEXT_ASSIGNMENT = /\b((?:api[_-]?key|token|secret|password|authorization|cookie|credential)[\w.-]*\s*[:=]\s*)[^\s,;]+/gi;
const BEARER_TOKEN = /\b(bearer\s+)[^\s,;]+/gi;

export interface PiRuntimeOptions {
  /** AskUser 请求进入和离开时的路由生命周期回调。 */
  askUserLifecycle?: AskUserRequestLifecycle;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(SENSITIVE_TEXT_ASSIGNMENT, '$1[已隐藏]')
    .replace(BEARER_TOKEN, '$1[已隐藏]');
}

/**
 * 将工具参数和结果转换为可安全展示的 JSON 值。
 *
 * 工具结果可能包含循环引用、二进制对象或意外的大段内容；同时部分工具参数也
 * 可能带有凭据。这里在离开运行时边界前统一裁剪和脱敏，防止它们进入 SSE、
 * localStorage 或聊天历史。
 */
function sanitizeToolPayload(value: unknown, seen = new WeakSet<object>(), depth = 0, nodeCount: { count: number } = { count: 0 }): unknown {
  if (++nodeCount.count > MAX_TOTAL_NODES) return "[内容过大，已省略]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const redacted = redactSensitiveText(value);
    return redacted.length <= MAX_TOOL_PAYLOAD_CHARS
      ? redacted
      : `${redacted.slice(0, MAX_TOOL_PAYLOAD_CHARS)}\n…（内容已截断）`;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (depth >= MAX_TOOL_PAYLOAD_DEPTH) return "[层级过深，已省略]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[循环引用]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_TOOL_PAYLOAD_ENTRIES)
      .map((item) => sanitizeToolPayload(item, seen, depth + 1, nodeCount));
    if (value.length > MAX_TOOL_PAYLOAD_ENTRIES) items.push(`…（其余 ${value.length - MAX_TOOL_PAYLOAD_ENTRIES} 项已省略）`);
    return items;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries.slice(0, MAX_TOOL_PAYLOAD_ENTRIES)) {
    result[key] = SENSITIVE_TOOL_FIELD.test(key)
      ? "[已隐藏]"
      : sanitizeToolPayload(item, seen, depth + 1, nodeCount);
  }
  if (entries.length > MAX_TOOL_PAYLOAD_ENTRIES) {
    result._truncated = `其余 ${entries.length - MAX_TOOL_PAYLOAD_ENTRIES} 个字段已省略`;
  }
  return result;
}

function sanitizeToolInput(value: unknown): Record<string, unknown> | undefined {
  const sanitized = sanitizeToolPayload(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return undefined;
  return sanitized as Record<string, unknown>;
}

function extractToolResultText(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .flatMap((block) => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return [];
      const candidate = block as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string" ? [candidate.text] : [];
    })
    .join("\n");
  return text || undefined;
}

function formatToolResult(value: unknown): string {
  // Pi 工具统一返回 { content, details }。前端工具活动应优先展示 content
  // 中的文本，而不是把整个包装对象再包一层 JSON；这样结构化工具结果（如
  // { task: ... }）可以被进度视图直接读取，普通文件工具的结果也更易读。
  const textContent = extractToolResultText(value);
  if (textContent !== undefined) {
    return sanitizeToolPayload(textContent) as string;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(sanitizeToolPayload(value), null, 2) ?? "[undefined]";
  } catch {
    serialized = "[工具结果无法序列化]";
  }
  return serialized.length <= MAX_TOOL_PAYLOAD_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_TOOL_PAYLOAD_CHARS)}\n…（内容已截断）`;
}

// ── PiRuntime 实现 ───────────────────────────────────────────────────────────

export class PiRuntime implements AgentRuntime {
  private config: AgentRuntimeConfig | null = null;
  private session: AgentSession | null = null;
  private modelRegistry: ModelRegistry | null = null;
  /** 当前模型（通过 ModelRegistry.find() 查找得到） */
  private model: Model<Api> | null = null;
  private activePrompt: ActivePrompt | null = null;
  /** 当前 prompt 会话的权限确认 requester（实例级，避免多实例并发覆盖） */
  private activeRequester: PermissionRequesterFn | null = null;
  /** 当前运行时建立的外部 MCP 连接，必须随会话释放。 */
  private projectMcpTools: ProjectMcpTools | null = null;
  /** 仅属于此运行时的 AskUser 请求和 SSE 通道。 */
  private readonly askUserManager: AskUserRequestManager;

  /** 当前轮次序号（从 0 开始，每次 turn_start 递增） */
  private turnIndex = 0;

  /** 本轮中 write/edit 工具涉及的文件路径（去重用） */
  private currentTurnFiles: Set<string> = new Set();
  /** write/edit 开始时暂存的路径；仅在成功结束后确认记录。 */
  private pendingTurnFileWrites = new Map<string, string>();

  constructor(options: PiRuntimeOptions = {}) {
    this.askUserManager = new AskUserRequestManager(options.askUserLifecycle);
  }

  /**
   * 初始化 Pi 运行时
   *
   * 关键步骤：
   * 1. 通过 registerProvider() 覆盖 baseUrl——这是 Pi SDK 官方推荐的代理配置方式
   *    （参见 https://pi.dev/docs/latest/custom-provider）
   * 2. 创建 AuthStorage 并注入 API Key
   * 3. 创建 AgentSession，工具列表限定为 ["read"]
   */
  async init(config: AgentRuntimeConfig): Promise<void> {
    this.config = config;

    // Pi SDK 的 provider 名（如 "anthropic" / "kimi-coding" / "deepseek"），
    // 用于 AuthStorage / ModelRegistry / find 三处调用，保持一致。
    // 缺省 "anthropic" 以保持向后兼容（旧调用方未传 provider 时）。
    const provider = config.provider ?? "anthropic";

    // ── 凭据存储 ──────────────────────────────────────────────────────────
    const authStorage = AuthStorage.create();
    authStorage.setRuntimeApiKey(provider, config.apiKey);

    // ── 模型注册表 + baseUrl 覆盖 ─────────────────────────────────────────
    //
    // Pi SDK 底层（@earendil-works/pi-ai）在构造 client 时直接使用 model.baseUrl。
    // 规范做法是通过 ModelRegistry.registerProvider() 为已有 provider 设置 baseUrl：
    //   当只传 baseUrl（不传 models）时，Pi SDK 会保留该 provider 下的所有
    //   已有模型，仅将 baseUrl 替换为新值。
    // 参见 Pi SDK 文档: https://pi.dev/docs/latest/custom-provider
    //     "When only baseUrl and/or headers are provided (no models),
    //      all existing models for that provider are preserved with the new endpoint."
    // 源码验证: model-registry.js applyProviderConfig() 737-744 行
    const modelRegistry = ModelRegistry.create(authStorage);
    modelRegistry.registerProvider(provider, {
      baseUrl: config.baseUrl,
    });
    this.modelRegistry = modelRegistry;

    // ── 查找模型 ──────────────────────────────────────────────────────────
    const model = modelRegistry.find(provider, config.model);
    if (!model) {
      throw typedAgentError("invalid_model");
    }
    this.model = model;

    console.log(
      `[PiRuntime] 模型已解析: ${model.id} | provider: ${model.provider ?? provider} | baseUrl: ${model.baseUrl}`,
    );

    // ── 创建 AgentSession ─────────────────────────────────────────────────
    //
    // customTools：业务自定义工具（如 getFlowDetail/searchFlows/getDoc），
    //   由调用方通过 config.customTools 传入（实际类型是 Pi 的 ToolDefinition[]，
    //   接口层用 unknown[] 避免依赖 Pi SDK 类型）。Pi SDK 中自定义工具和内置
    //   工具（read 等）并存，同名时自定义覆盖内置。
    //
    // ⚠️ tools 白名单合并（关键）：Pi SDK 的 `tools` 参数是白名单，同时管内置
    //   工具和 customTools——customTools 里的工具名如果不在 tools 集合里，会被
    //   agent-session.js 的 isAllowedTool() 过滤掉，根本不注册进 Agent 工具集
    //   （源码 agent-session.js:1864-1868）。所以这里把 customTools 的 name
    //   自动合并进 tools，让业务工具 always-on，调用方不用同时维护两份名单。
    // ══ SessionManager: 持久化会话 ══════════════════════════════════════════════
    //
    // 每个会话拥有独立 workspace，并由 Pi SessionManager 写入合法 JSONL：
    // dataDir/projects/{projectName}/sessions/{sessionId}/
    // Pi SDK 的 createAgentSession() 在收到已存有数据的 SessionManager 时，
    // 会自动从会话中恢复消息列表、模型和 thinkingLevel。
    const projectId = config.projectId ?? path.basename(config.projectDir);
    const sessionId = config.sessionId;
    if (!sessionId) {
      throw typedAgentError("unknown", {
        title: "会话配置缺失",
        message: "缺少产品 sessionId，无法保证会话连续性",
      });
    }
    const sessionHandle = await createOrResumePiSession(config.dataDir, projectId, sessionId);
    const sessionManager: SessionManager = sessionHandle.manager;
    const effectiveCwd = sessionHandle.workspaceDir;
    console.log(`[PiRuntime] ${sessionHandle.created ? "创建" : "恢复"}产品会话: ${sessionId}`);

    // 用同名受控工具覆盖 Pi 内置 read/grep/find/ls/write/edit。路径在每次执行前由后端
    // 白名单校验，Prompt 只负责解释范围，不承担授权职责。
    const permissionMode = config.permissionMode ?? "readonly";
    if (!["readonly", "review", "yolo"].includes(permissionMode)) {
      throw new Error("[PiRuntime] 权限模式无效");
    }
    const allowWrite = permissionMode === "review" || permissionMode === "yolo";
    const contourFileTools = createAuthorizedFileTools({
        projectId,
        workspaceDir: effectiveCwd,
        additionalFiles: config.authorizedFiles,
        allowWrite,
      }) as Array<{ name: string }>;
    // readonly 不调用 bridge，因此不会启动任何外部 MCP 程序。review/yolo 都会
    // 创建桥接，但由 ResourceLoader 的强制确认名单确保每次调用先确认。
    const projectMcpTools = await createProjectMcpTools({
      projectId,
      projectDir: config.projectDir,
      permissionMode,
    });
    try {
      const toolPolicy = applyAgentToolPolicy({
        requestedTools: config.tools,
        customTools: [
          ...(config.customTools ?? []),
          ...projectMcpTools.tools,
          createAskUserQuestionTool(this.askUserManager),
          ...createPlanModeTools(),
        ],
        contourFileTools,
        allowWrite,
      });

      const sharedSettings = SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      });

      const { session } = await createAgentSession({
      cwd: effectiveCwd,
      agentDir: effectiveCwd,
      model: this.model,
      thinkingLevel: "off",
      authStorage,
      modelRegistry: this.modelRegistry,
      tools: toolPolicy.tools,
      customTools: toolPolicy.customTools as any,
      resourceLoader: await this.createResourceLoader({
        ...config,
        mcpConfirmationToolNames: projectMcpTools.reviewConfirmationToolNames,
      }, authStorage, effectiveCwd, sharedSettings),
      sessionManager,
      settingsManager: sharedSettings,
      });

      this.session = session;
      this.projectMcpTools = projectMcpTools;
      console.log(`[PiRuntime] Session 已创建: ${session.sessionId}`);
    } catch (error) {
      await projectMcpTools.dispose();
      throw error;
    }
  }

  /**
   * 发送消息并返回异步事件流
   *
   * 实现要点：
   * - 每次调用 prompt() 会先清理上一次的订阅（防止订阅堆积）
   * - 通过构建 AsyncIterable 桥接 Pi SDK 的 callback 事件模型
   * - subscribe 回调和 AsyncIterable 的 next() 共享同一个 promptState 对象
   */
  prompt(
    text: string,
    options?: PromptOptions,
  ): AsyncIterable<AgentStreamEvent> {
    if (!this.session) {
      throw new Error("[PiRuntime] 未初始化，请先调用 init()");
    }

    // 清理上一次 prompt 的订阅（防止订阅堆积）
    this.cleanupActivePrompt();

    // 重置 turn 序号（每次 prompt() 从 0 开始）
    this.turnIndex = 0;
    this.currentTurnFiles = new Set();
    this.pendingTurnFileWrites.clear();

    // ── 构建共享状态对象 ──────────────────────────────────────────────────
    const promptState: ActivePrompt = {
      queue: [],
      waitingResolve: null,
      done: false,
      unsubscribe: () => {},
      askUserGeneration: null,
    };
    this.activePrompt = promptState;

    // ── 事件推入辅助函数 ───────────────────────────────────────────────────
    const pushEvent = (event: AgentStreamEvent): void => {
      if (promptState.waitingResolve) {
        promptState.waitingResolve({ value: event, done: false });
        promptState.waitingResolve = null;
      } else {
        promptState.queue.push(event);
      }
    };

    const signalDone = (): void => {
      promptState.done = true;
      if (promptState.waitingResolve) {
        promptState.waitingResolve({ value: undefined, done: true });
        promptState.waitingResolve = null;
      }
    };

    // ── 订阅 Pi 事件 → 转换为 AgentStreamEvent ──────────────────────────
    promptState.unsubscribe = this.session.subscribe(
      (event: AgentSessionEvent) => {
        const mapped = this.mapEvent(event);
        if (event.type === "agent_end") {
          if (mapped) pushEvent(mapped);
          signalDone();
          return;
        }

        if (!mapped) return;
        pushEvent(mapped);
      },
    );

    // ── 设置权限确认 requester（必须在 session.prompt() 之前）─────────────
    //
    // 当 permission-extension 的 tool_call 钩子需要用户确认时，调用此函数。
    // 函数将 permission_request 事件注入事件流供前端消费，并返回一个
    // Promise 等待用户决策结果（通过 POST /api/ai/permission-response 传入）。
    //
    // ⚠️ 时序关键：必须在 session.prompt() 之前设置 activeRequester，否则
    // prompt 启动后 tool_call 钩子可能先于 requester 赋值触发，
    // 导致"确认链路未就绪"拒绝。
    //
    // cleanup：prompt 结束后清除 requester，避免泄漏到下一次 prompt。
    let currentAbort: (() => void) | null = null;

    const cleanup = (): void => {
      // 无论当前轮次是否已替换，都只处理自己创建的 AskUser generation。
      // 旧 prompt 延迟 settle 时不能碰新 prompt 的 emitter 或 pending 请求。
      if (promptState.askUserGeneration !== null) {
        this.askUserManager.endPrompt(promptState.askUserGeneration, "prompt 已结束");
      }
      if (this.activePrompt !== promptState) return;
      this.activeRequester = null;
      currentAbort?.();
      rejectAllPendingRequests("prompt 已结束");
    };

    this.activeRequester = async (info) => {
      const { requestId, promise, abort } = createPermissionRequest(
        info.toolName,
        info.input,
        info.reason,
      );
      currentAbort = abort;

      // 注入 permission_request 事件供前端消费
      pushEvent({
        type: "permission_request",
        requestId,
        toolName: info.toolName,
        input: info.input,
        reason: info.reason,
      });

      return promise;
    };

    // ── 设置 AskUser 事件通道（仅供当前运行时和当前 prompt 使用） ──────
    promptState.askUserGeneration = this.askUserManager.beginPrompt(pushEvent);

    // ── 异步发送 prompt（不阻塞 AsyncIterable 的返回） ───────────────────
    const promptPromise = this.session
      .prompt(text, {
        images: options?.images as any,
      })
      .catch((err: unknown) => {
        pushEvent({
          type: "error",
          error: classifyAgentError(err),
        });
        signalDone();
      });

    // promptPromise 完成后清理 requester
    promptPromise.then(cleanup, cleanup);

    // ── 返回 AsyncIterable ───────────────────────────────────────────────
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<AgentStreamEvent>> {
            if (promptState.queue.length > 0) {
              const value = promptState.queue.shift()!;
              return { value, done: false };
            }
            if (promptState.done) {
              return { value: undefined, done: true };
            }
            return new Promise((resolve) => {
              promptState.waitingResolve = resolve;
            });
          },
        };
      },
    };
  }

  async abort(): Promise<void> {
    if (this.session) {
      try {
        await this.session.abort();
      } catch (err) {
        console.warn("[PiRuntime] abort 出错:", err);
      }
    }
    this.cleanupActivePrompt();
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.modelRegistry || !this.config) {
      throw new Error("[PiRuntime] 未初始化，请先调用 init()");
    }
    const provider = this.config.provider ?? "anthropic";
    const model = this.modelRegistry.find(provider, modelId);
    if (!model) {
      throw typedAgentError("invalid_model");
    }
    this.model = model;
    if (this.session) {
      await this.session.setModel(model);
    }
    console.log(`[PiRuntime] 模型已切换: ${provider}/${modelId}`);
  }

  async dispose(): Promise<void> {
    this.cleanupActivePrompt();
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    this.modelRegistry = null;
    this.model = null;
    this.config = null;
    const mcpTools = this.projectMcpTools;
    this.projectMcpTools = null;
    if (mcpTools) await mcpTools.dispose();
    console.log("[PiRuntime] 资源已释放");
  }

  // ── 私有方法 ────────────────────────────────────────────────────────────

  /** 清理上一次 prompt 的订阅状态 */
  private cleanupActivePrompt(): void {
    if (!this.activePrompt) return;
    const promptState = this.activePrompt;
    try {
      promptState.unsubscribe();
      // 如果消费者还在等待，发送 done 信号避免永久挂起
      if (promptState.waitingResolve && !promptState.done) {
        promptState.waitingResolve({ value: undefined, done: true });
      }
    } finally {
      this.activePrompt = null;
    }
    // 只清理旧 prompt generation 的 AskUser 请求，不影响新一轮。
    if (promptState.askUserGeneration !== null) {
      this.askUserManager.endPrompt(promptState.askUserGeneration, "prompt 已结束");
    }
    this.activeRequester = null;
    rejectAllPendingRequests("prompt 已结束");
    this.pendingTurnFileWrites.clear();
  }

  /**
   * 将 Pi SDK 事件映射为 AgentStreamEvent
   *
   * 映射规则：
   * - agent_start / turn_start / turn_end / agent_end → 直接映射
   * - message_update.text_delta → text_delta
   *   （忽略 text_start / text_end，turn_start / turn_end 已承载起止语义）
   * - message_update.thinking_delta → 丢弃。该事件承载模型原始推理，不是
   *   可安全展示的产品摘要，严禁传给前端或写入聊天历史。
   * - tool_execution_start / tool_execution_end → tool_call_start / tool_call_end
   *
   * 不对外暴露的事件（被归并）：
   * - message_start / message_end（语义由 turn_start / turn_end 承载）
   * - text_start / text_end（归并到 text_delta）
   * - queue_update / compaction_* / thinking_level_changed 等（管理事件）
   */
  private mapEvent(event: AgentSessionEvent): AgentStreamEvent | null {
    switch (event.type) {
      case "agent_start":
        return { type: "agent_start" };

      case "agent_end": {
        const messages = (event as unknown as {
          messages?: Array<{ role?: string; stopReason?: string; errorMessage?: string }>;
        }).messages ?? [];
        const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
        if (lastAssistant?.stopReason === "error") {
          return { type: "error", error: classifyAgentError(lastAssistant.errorMessage) };
        }
        if (lastAssistant?.stopReason === "aborted") {
          return { type: "error", error: classifyAgentError("aborted") };
        }
        return { type: "agent_end" };
      }

      case "turn_start": {
        // 新一轮开始：递增序号，清空本轮文件改动记录
        this.turnIndex += 1;
        this.currentTurnFiles = new Set();
        this.pendingTurnFileWrites.clear();
        return { type: "turn_start", turnIndex: this.turnIndex };
      }

      case "turn_end": {
        const filesChanged = [...this.currentTurnFiles];
        this.pendingTurnFileWrites.clear();
        return { type: "turn_end", turnIndex: this.turnIndex, filesChanged };
      }

      case "message_update": {
        const sub = (event as any).assistantMessageEvent;
        if (!sub) return null;

        switch (sub.type) {
          case "text_delta":
            return { type: "text_delta", delta: sub.delta };
          default:
            return null;
        }
      }

      case "tool_execution_start": {
        const toolName: string = (event as any).toolName ?? "unknown";
        const args: unknown = (event as any).args;

        // 暂存 write / edit 路径；工具成功结束后才算作真实改动。
        if ((toolName === 'write' || toolName === 'edit') && args && typeof args === 'object') {
          const pathValue = (args as Record<string, unknown>).path;
          const toolCallId = (event as any).toolCallId;
          if (typeof toolCallId === 'string' && toolCallId && typeof pathValue === 'string' && pathValue.length > 0) {
            this.pendingTurnFileWrites.set(toolCallId, pathValue);
          }
        }

        return {
          type: "tool_call_start",
          toolCallId: (event as any).toolCallId ?? toolName,
          toolName,
          input: sanitizeToolInput(args),
        };
      }

      case "tool_execution_end": {
        const toolCallId = (event as any).toolCallId ?? (event as any).toolName ?? "unknown";
        const toolName = (event as any).toolName ?? "unknown";
        const pendingPath = this.pendingTurnFileWrites.get(toolCallId);
        this.pendingTurnFileWrites.delete(toolCallId);
        if (!((event as any).isError) && (toolName === "write" || toolName === "edit") && pendingPath) {
          this.currentTurnFiles.add(pendingPath);
        }
        return {
          type: "tool_call_end",
          toolCallId,
          toolName,
          isError: !!(event as any).isError,
          result: formatToolResult((event as any).result),
        };
      }

      default:
        return null;
    }
  }

  /** 创建 ResourceLoader */
  private async createResourceLoader(
    config: AgentRuntimeConfig,
    _authStorage: AuthStorage,
    effectiveCwd: string,
    sharedSettings: SettingsManager,
  ): Promise<DefaultResourceLoader> {
    // systemPromptOverride 注入业务上下文（如 Flow/Doc）到 Agent 的 system prompt。
    // 文档第五节已记录：systemPromptOverride 实际是 DefaultResourceLoader 的构造
    // 选项，不是 createAgentSession() 的直接参数。
    //
    // 类型上它是一个函数 (base) => string：接收 Pi 默认 system prompt（含工具使用
    // 指导、安全说明等），返回覆盖后的。这里采用"追加"而非"替换"——把业务上下文
    // 拼在 Pi 默认 prompt 之后，避免丢失 Pi 的 Agent 行为指导。
    const systemPromptOverride = config.systemPrompt
      ? (base: string | undefined) =>
          `${base ?? ""}\n\n--- 业务上下文 ---\n${config.systemPrompt}`.trim()
      : undefined;

    // extensionFactories 注入权限拦截钩子（仅 review 模式）。
    // readonly 靠 tools 白名单限制（写工具不进白名单），yolo 全放行，都不需要钩子。
    // 调研确认：extensionFactories 通过 DefaultResourceLoader 注入（不是
    // createAgentSession 直接参数），且和 customTools 能共存。
    const permissionMode = config.permissionMode ?? "readonly";
    const projectId = config.projectId ?? path.basename(effectiveCwd);
    const mustConfirmTools = config.mcpConfirmationToolNames ?? [];
    const extensionFactories =
      permissionMode === "review" || mustConfirmTools.length > 0
        ? [createPermissionExtensionFactory(permissionMode, config.dataDir, projectId, () => this.activeRequester, mustConfirmTools)]
        : [];

    const loader = new DefaultResourceLoader({
      cwd: effectiveCwd,
      agentDir: effectiveCwd,
      // Contour 只在 promptBuilder 中受控读取项目根 CLAUDE.md。禁用 Pi 的默认
      // 祖先扫描，避免会话目录或磁盘父目录中的 AGENTS.md/CLAUDE.md 意外影响 Agent。
      noContextFiles: true,
      // 关闭 Pi 的默认/祖先技能发现，只读取 Contour 配置中用户显式启用的目录。
      noSkills: true,
      additionalSkillPaths: config.additionalSkillPaths ?? [],
      systemPromptOverride,
      extensionFactories,
      settingsManager: sharedSettings,
    });
    await loader.reload();
    return loader;
  }
}

// ── AskUserQuestion 自定义工具 ──────────────────────────────────────────────

/**
 * 创建覆盖 Pi SDK 内置 AskUserQuestion 的自定义工具。
 *
 * Pi SDK 内置的 AskUserQuestion 依赖 SDK 自有的 UI 层；Contour 前端需要
 * 通过自己的 UI 展示问题并收集答案。此自定义工具：
 * 1. 通过 ask-user.ts 模块发出 ask_user SSE 事件
 * 2. 等待前端 POST /api/ai/ask-user-response 回传答案
 * 3. 将答案作为工具结果返回给 Agent
 */
const askUserQuestionParams = Type.Object({
  questions: Type.Array(Type.Object({
    question: Type.String({ description: "要询问用户的问题" }),
    header: Type.String({ description: "简短标题" }),
    options: Type.Optional(Type.Array(Type.Object({
      label: Type.String({ description: "选项标签" }),
      description: Type.Optional(Type.String({ description: "选项说明" })),
    }))),
    multiSelect: Type.Optional(Type.Boolean({ description: "是否允许多选" })),
  })),
});

function createAskUserQuestionTool(manager: AskUserRequestManager) {
  return {
    name: "AskUserQuestion",
    label: "向用户提问",
    description:
      "当需要用户选择、补充信息或确认偏好时调用。支持三种题型：" +
      "单选（options 数组 + multiSelect: false）、多选（options 数组 + multiSelect: true）、" +
      "文本输入（不传 options，由用户自由输入）。",
    parameters: askUserQuestionParams,
    execute: async (_toolCallId: string, params: Static<typeof askUserQuestionParams>) => {
      const result = await manager.request(params.questions);
      // 将用户答案格式化为工具结果文本
      const answerText = Object.entries(result.answers)
        .map(([header, answer]) => `${header}: ${answer}`)
        .join("\n");
      return {
        content: [{ type: "text" as const, text: `用户已回答：\n${answerText}` }],
        details: {},
      };
    },
  };
}

const emptyPlanModeParams = Type.Object({});

/** Plan Mode 工具仅作为前端状态切换信号，不改变 Agent 或项目状态。 */
export function createPlanModeTools() {
  return [
    {
      name: "EnterPlanMode",
      label: "进入计划模式",
      description: "开始输出待用户审批的执行计划时调用。不会执行任何项目修改。",
      parameters: emptyPlanModeParams,
      execute: async (_toolCallId: string, _params: Static<typeof emptyPlanModeParams>) => ({
        content: [{ type: "text" as const, text: "已进入计划模式，请先向用户展示执行计划。" }],
        details: {},
      }),
    },
    {
      name: "ExitPlanMode",
      label: "退出计划模式",
      description: "用户批准计划并准备继续下一步时调用。该工具本身不会执行任何修改。",
      parameters: emptyPlanModeParams,
      execute: async (_toolCallId: string, _params: Static<typeof emptyPlanModeParams>) => ({
        content: [{ type: "text" as const, text: "已退出计划模式。" }],
        details: {},
      }),
    },
  ];
}
