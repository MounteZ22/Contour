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

import { readdirSync, mkdirSync } from "fs";
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
import type {
  AgentRuntime,
  AgentRuntimeConfig,
  AgentStreamEvent,
  PromptOptions,
} from "./agent-runtime.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createPermissionExtensionFactory, setActiveRequester, createPermissionRequest, rejectAllPendingRequests } from "./permission-extension.js";

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
}

// ── PiRuntime 实现 ───────────────────────────────────────────────────────────

export class PiRuntime implements AgentRuntime {
  private config: AgentRuntimeConfig | null = null;
  private session: AgentSession | null = null;
  private modelRegistry: ModelRegistry | null = null;
  /** 当前模型（通过 ModelRegistry.find() 查找得到） */
  private model: Model<Api> | null = null;
  private activePrompt: ActivePrompt | null = null;

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
      throw new Error(
        `[PiRuntime] 未找到模型: ${provider}/${config.model}，请确认模型 ID 正确`,
      );
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
    const customToolNames = (config.customTools as Array<{ name: string }> | undefined)
      ?.map((t) => t.name) ?? [];
    const tools = Array.from(
      new Set([...(config.tools ?? ["read"]), ...customToolNames]),
    );

    // ══ SessionManager: 持久化会话 ══════════════════════════════════════════════
    //
    // 会话数据存储在 dataDir/projects/{projectName}/sessions/ 目录下。
    // - 新会话：通过 SessionManager.create() 自动创建文件
    // - 恢复会话：通过 sessionId 在 sessions/ 中查找已有文件并打开
    // Pi SDK 的 createAgentSession() 在收到已存有数据的 SessionManager 时，
    // 会自动从会话中恢复消息列表、模型和 thinkingLevel。
    const projectId = config.projectId ?? path.basename(config.projectDir ?? config.cwd);
    const sessionDir = path.join(config.dataDir, "projects", projectId, "sessions");
    mkdirSync(sessionDir, { recursive: true });
    const effectiveCwd = config.projectDir ?? config.cwd;

    let sessionManager: SessionManager;
    if (config.sessionId) {
      const sessionFile = findSessionFileById(sessionDir, config.sessionId);
      if (sessionFile) {
        sessionManager = SessionManager.open(sessionFile, sessionDir, effectiveCwd);
        console.log(`[PiRuntime] 恢复会话: ${config.sessionId}`);
      } else {
        console.warn(
          `[PiRuntime] 会话 ${config.sessionId} 未找到，创建新会话`,
        );
        sessionManager = SessionManager.create(effectiveCwd, sessionDir);
      }
    } else {
      sessionManager = SessionManager.create(effectiveCwd, sessionDir);
    }

    const { session } = await createAgentSession({
      cwd: effectiveCwd,
      agentDir: effectiveCwd,
      model: this.model,
      thinkingLevel: "off",
      authStorage,
      modelRegistry: this.modelRegistry,
      tools,
      customTools: config.customTools as any,
      resourceLoader: await this.createResourceLoader(config, authStorage),
      sessionManager,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    });

    this.session = session;
    console.log(`[PiRuntime] Session 已创建: ${session.sessionId}`);
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

    // ── 构建共享状态对象 ──────────────────────────────────────────────────
    const promptState: ActivePrompt = {
      queue: [],
      waitingResolve: null,
      done: false,
      unsubscribe: () => {},
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
        if (!mapped) return;

        if (mapped.type === "agent_end") {
          pushEvent(mapped);
          signalDone();
          return;
        }

        pushEvent(mapped);
      },
    );

    // ── 异步发送 prompt（不阻塞 AsyncIterable 的返回） ───────────────────
    const promptPromise = this.session
      .prompt(text, {
        images: options?.images as any,
      })
      .catch((err: unknown) => {
        pushEvent({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        signalDone();
      });

    // ── 设置权限确认 requester ──────────────────────────────────────────
    //
    // 当 permission-extension 的 tool_call 钩子需要用户确认时，调用此函数。
    // 函数将 permission_request 事件注入事件流供前端消费，并返回一个
    // Promise 等待用户决策结果（通过 POST /api/ai/permission-response 传入）。
    //
    // cleanup：prompt 结束后清除 requester，避免泄漏到下一次 prompt。
    const cleanup = (): void => {
      setActiveRequester(null);
      rejectAllPendingRequests("prompt 已结束");
    };

    setActiveRequester(async (info) => {
      const { requestId, promise } = createPermissionRequest(
        info.toolName,
        info.input,
        info.reason,
      );

      // 注入 permission_request 事件供前端消费
      pushEvent({
        type: "permission_request",
        requestId,
        toolName: info.toolName,
        input: info.input,
        reason: info.reason,
      });

      return promise;
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
      throw new Error(`[PiRuntime] 未找到模型: ${provider}/${modelId}`);
    }
    this.model = model;
    if (this.session) {
      await this.session.setModel(model);
    }
    console.log(`[PiRuntime] 模型已切换: ${provider}/${modelId}`);
  }

  dispose(): void {
    this.cleanupActivePrompt();
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    this.modelRegistry = null;
    this.model = null;
    this.config = null;
    console.log("[PiRuntime] 资源已释放");
  }

  // ── 私有方法 ────────────────────────────────────────────────────────────

  /** 清理上一次 prompt 的订阅状态 */
  private cleanupActivePrompt(): void {
    if (this.activePrompt) {
      this.activePrompt.unsubscribe();
      // 如果消费者还在等待，发送 done 信号避免永久挂起
      if (this.activePrompt.waitingResolve && !this.activePrompt.done) {
        this.activePrompt.waitingResolve({ value: undefined, done: true });
      }
      this.activePrompt = null;
    }
  }

  /**
   * 将 Pi SDK 事件映射为 AgentStreamEvent
   *
   * 映射规则：
   * - agent_start / turn_start / turn_end / agent_end → 直接映射
   * - message_update.text_delta → text_delta
   *   （忽略 text_start / text_end，turn_start / turn_end 已承载起止语义）
   * - message_update.thinking_delta → thinking_delta
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

      case "agent_end":
        return { type: "agent_end" };

      case "turn_start":
        return { type: "turn_start" };

      case "turn_end":
        return { type: "turn_end" };

      case "message_update": {
        const sub = (event as any).assistantMessageEvent;
        if (!sub) return null;

        switch (sub.type) {
          case "text_delta":
            return { type: "text_delta", delta: sub.delta };
          case "thinking_delta":
            return { type: "thinking_delta", delta: sub.delta };
          default:
            return null;
        }
      }

      case "tool_execution_start":
        return {
          type: "tool_call_start",
          toolName: (event as any).toolName ?? "unknown",
        };

      case "tool_execution_end":
        return {
          type: "tool_call_end",
          toolName: (event as any).toolName ?? "unknown",
          isError: !!(event as any).isError,
        };

      default:
        return null;
    }
  }

  /** 创建 ResourceLoader */
  private async createResourceLoader(
    config: AgentRuntimeConfig,
    _authStorage: AuthStorage,
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
    const effectiveCwd = config.projectDir ?? config.cwd;
    const projectId = config.projectId ?? path.basename(effectiveCwd);
    const extensionFactories =
      permissionMode === "review"
        ? [createPermissionExtensionFactory("review", config.dataDir, projectId)]
        : [];

    const loader = new DefaultResourceLoader({
      cwd: effectiveCwd,
      agentDir: effectiveCwd,
      systemPromptOverride,
      extensionFactories,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    });
    await loader.reload();
    return loader;
  }
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/**
 * 在 sessionDir 中查找指定 sessionId 对应的会话文件
 *
 * 会话文件命名格式：{timestamp}_{sessionId}.jsonl（由 SessionManager 生成）。
 * 通过文件名后缀匹配，避免读取文件内容。
 *
 * @param sessionDir - sessions/ 目录路径
 * @param sessionId  - 要查找的会话 ID
 * @returns 完整的文件路径，未找到则返回 null
 */
function findSessionFileById(
  sessionDir: string,
  sessionId: string,
): string | null {
  try {
    const files = readdirSync(sessionDir);
    const match = files.find((f) => f.endsWith(`_${sessionId}.jsonl`));
    return match ? path.join(sessionDir, match) : null;
  } catch {
    // 目录不存在或无权读取 → session 不存在
    return null;
  }
}
