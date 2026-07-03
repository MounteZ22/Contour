/**
 * PiRuntime — 基于 @earendil-works/pi-coding-agent 的 AgentRuntime 实现
 *
 * 封装 createAgentSession() 为 AgentRuntime 接口，提供：
 * - 事件流桥接：将 Pi SDK 的 callback 订阅模式转换为 AsyncIterable
 * - baseUrl 覆盖：通过 ModelRegistry.registerProvider() 设置自定义端点
 * - 订阅生命周期管理：每次 prompt() 清理旧订阅，dispose() 做最终释放
 *
 * 当前限制（刻意为之）：
 * - 仅支持 Anthropic provider（通过 Proma 代理）
 * - 仅开放 read 工具
 * - 所有配置通过 init() 参数传入，不读环境变量
 */

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
  /** 当前模型（find() 返回的 Model 对象，因 pi-ai 嵌套依赖类型无法直接导入，用 any） */
  private model: any = null;
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

    // ── 凭据存储 ──────────────────────────────────────────────────────────
    const authStorage = AuthStorage.create();
    authStorage.setRuntimeApiKey("anthropic", config.apiKey);

    // ── 模型注册表 + baseUrl 覆盖 ─────────────────────────────────────────
    //
    // Pi SDK 底层（@earendil-works/pi-ai）在构造 Anthropic client 时直接使用
    // model.baseUrl，不读取 ANTHROPIC_BASE_URL 环境变量。规范做法是通过
    // ModelRegistry.registerProvider() 为已有 provider 设置 baseUrl：
    //   当只传 baseUrl（不传 models）时，Pi SDK 会保留该 provider 下的所有
    //   已有模型，仅将 baseUrl 替换为新值。
    // 参见 Pi SDK 文档: https://pi.dev/docs/latest/custom-provider
    //     "When only baseUrl and/or headers are provided (no models),
    //      all existing models for that provider are preserved with the new endpoint."
    // 源码验证: model-registry.js applyProviderConfig() 737-744 行
    const modelRegistry = ModelRegistry.create(authStorage);
    modelRegistry.registerProvider("anthropic", {
      baseUrl: config.baseUrl,
    });
    this.modelRegistry = modelRegistry;

    // ── 查找模型 ──────────────────────────────────────────────────────────
    const model = modelRegistry.find("anthropic", config.model);
    if (!model) {
      throw new Error(
        `[PiRuntime] 未找到模型: anthropic/${config.model}，请确认模型 ID 正确`,
      );
    }
    this.model = model;

    console.log(
      `[PiRuntime] 模型已解析: ${model.id} | provider: ${model.provider ?? "anthropic"} | baseUrl: ${model.baseUrl}`,
    );

    // ── 创建 AgentSession ─────────────────────────────────────────────────
    const { session } = await createAgentSession({
      cwd: config.cwd,
      agentDir: config.cwd,
      model: this.model,
      thinkingLevel: "off",
      authStorage,
      modelRegistry: this.modelRegistry,
      tools: config.tools ?? ["read"],
      resourceLoader: await this.createResourceLoader(config, authStorage),
      sessionManager: SessionManager.inMemory(),
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
    this.session
      .prompt(text, {
        images: options?.images as any,
      })
      .catch((err: Error) => {
        pushEvent({ type: "error", message: err.message });
        signalDone();
      });

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
    if (!this.modelRegistry) {
      throw new Error("[PiRuntime] 未初始化，请先调用 init()");
    }
    const model = this.modelRegistry.find("anthropic", modelId);
    if (!model) {
      throw new Error(`[PiRuntime] 未找到模型: anthropic/${modelId}`);
    }
    this.model = model;
    if (this.session) {
      await this.session.setModel(model);
    }
    console.log(`[PiRuntime] 模型已切换: ${modelId}`);
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
    const loader = new DefaultResourceLoader({
      cwd: config.cwd,
      agentDir: config.cwd,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    });
    await loader.reload();
    return loader;
  }
}
