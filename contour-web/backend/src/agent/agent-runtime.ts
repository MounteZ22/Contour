/**
 * AgentRuntime — 运行时无关的 Agent 接口定义
 *
 * 设计意图：将 LLM Agent 的交互抽象为统一接口，使上层业务逻辑不依赖具体的
 * Agent SDK（如 Pi Coding Agent）。未来如需切换实现，只需提供新的
 * AgentRuntime 实现即可，无需修改调用方。
 *
 * 事件映射说明：
 * Pi SDK 的原始事件（如 text_start / text_delta / text_end）被归并到更简洁的
 * AgentStreamEvent 联合类型中。归并原则：
 * - text_start / text_delta / text_end → 对外只暴露 text_delta（调用方只需
 *   关心增量文本内容，开始/结束由 turn_start / turn_end 承载语义）
 * - tool_execution_start / tool_execution_end → tool_call_start / tool_call_end
 * - thinking 事件不向产品 UI 暴露：其内容可能是模型原始推理，不应作为
 *   面向用户的"思考摘要"传输或持久化
 * - agent_end 既是会话结束信号，也是 "done" 信号
 */

// ── 错误类型 ─────────────────────────────────────────────────────────────────
//
// 定义在此处而非 typed-error.ts 以避免循环依赖：typed-error.ts 是实现，
// agent-runtime.ts 是接口层，接口不应依赖实现。

/** Agent 错误码枚举 */
export type AgentErrorCode =
  | "invalid_api_key"
  | "rate_limited"
  | "prompt_too_long"
  | "network_error"
  | "service_error"
  | "invalid_model"
  | "aborted"
  | "unknown";

/** 统一错误载荷，供运行时和 HTTP 层共同使用 */
export interface AgentErrorPayload {
  code: AgentErrorCode;
  title: string;
  message: string;
  canRetry: boolean;
  action?: "open_settings";
  httpStatus?: number;
}

// ── 配置类型 ─────────────────────────────────────────────────────────────────

/** Agent 运行时初始化配置 */
export interface AgentRuntimeConfig {
  /** API Key（通过 init 参数传入，不依赖环境变量，为将来接入 channelManager 做准备） */
  apiKey: string;
  /** API Base URL（代理地址，例如 Proma 代理） */
  baseUrl: string;
  /** 模型 ID，例如 "claude-sonnet-5" */
  model: string;
  /**
   * Provider 名称（例如 "anthropic" / "kimi-coding" / "deepseek"）
   *
   * 用于 Pi SDK 的 ModelRegistry.registerProvider() 和 AuthStorage.setRuntimeApiKey()。
   * 缺省为 "anthropic" 以保持向后兼容。
   */
  provider?: string;
  /**
   * System prompt 覆盖（可选）
   *
   * 注入到 Pi SDK 的 DefaultResourceLoader.systemPromptOverride，让 Agent 感知
   * 当前选中的 Flow/Doc 等业务上下文。不传时 Pi SDK 使用默认 system prompt。
   */
  systemPrompt?: string;
  /**
   * 自定义工具定义数组（可选，运行时特定）
   *
   * 元素是 Pi SDK 的 ToolDefinition（TypeBox schema + execute handler）。
   * 接口层用 unknown[] 避免依赖 Pi SDK 类型，由具体实现（PiRuntime）做类型
   * 校验。调用方（如 api/ai.ts）负责组装工具数组并传入。
   */
  customTools?: unknown[];
  /** 当前项目明确链接、可由受控只读工具精确访问的额外文件。 */
  authorizedFiles?: string[];
  /**
   * 权限模式（可选，缺省 "readonly"）
   *
   * - "readonly"：只开放只读工具（read/grep/find/ls + 业务只读），写工具不进
   *   白名单，Agent 调不到。最安全，默认值。
   * - "yolo"：开放受路径白名单保护的 write/edit，不逐次确认。
   * - "review"：开放同样的受控 write/edit，并在执行前等待用户确认。
   * - bash 暂不开放，避免命令行绕过项目路径白名单。
   */
  permissionMode?: "readonly" | "review" | "yolo";
  /**
   * 应用数据目录
   *
   * 应用配置、项目配置、会话持久化等数据存放的根目录。
   * 例如 ~/.contour（prod）或 ~/.contour-dev（dev）。
   */
  dataDir: string;
  /**
   * 项目内容目录
   *
   * 项目 Vault 路径，仅用于业务上下文和项目定位。Agent 的 cwd 由运行时根据
   * projectId/sessionId 创建在应用数据目录中，不应直接指向 Vault。
   */
  projectDir: string;
  /**
   * 工作目录（工具执行的基准路径）
   *
   * @deprecated 请使用 projectDir 替代。保留此字段是为了向后兼容，
   * 当 projectDir 未传入时作为回退。后续所有调用方迁移后删除。
   */
  cwd?: string;
  /** 启用的工具名称列表，默认只开放 read */
  tools?: string[];
  /**
   * 项目 ID（可选）
   *
   * 对应 VAULTS_DIR 下项目子目录的 projectId（如 "PRJ_001"）。
   * 用于在 dataDir/projects/ 下隔离存储会话、权限规则等数据。
   * 不传时回退到 projectDir 的 basename。
   */
  projectId?: string;
  /**
   * 会话 ID（可选）
   *
   * 传此值可恢复已有会话的对话历史，Agent 会加载之前的消息作为上下文。
   * 不传或传空则创建新会话。每个会话存储在
   * dataDir/projects/{projectId}/sessions/{sessionId}/ 目录下。
   */
  sessionId?: string;
  /** 用户显式启用并经过 realpath 校验的项目技能目录。 */
  additionalSkillPaths?: string[];
  /** 外部 MCP 工具：不论 yolo/review，调用前都必须由用户逐次确认。 */
  mcpConfirmationToolNames?: string[];
}

// ── 事件类型 ─────────────────────────────────────────────────────────────────

/**
 * 运行时无关的 Agent 事件联合类型
 *
 * 这些事件从 Pi SDK 的原始事件归并而来，屏蔽了 SDK 内部的事件粒度：
 * - Pi 的 text_start / text_delta / text_end → 统一为 text_delta
 * - Pi 的 tool_execution_start / tool_execution_end → tool_call_start / tool_call_end
 * - Pi 的 agent_end 即为此处的 agent_end（含 "done" 语义）
 */
export type AgentStreamEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "text_delta"; delta: string }
  | {
      type: "tool_call_start";
      toolCallId: string;
      toolName: string;
      /** 已脱敏、已截断的工具参数，仅用于前端展示。 */
      input?: Record<string, unknown>;
    }
  | {
      type: "tool_call_end";
      toolCallId: string;
      toolName: string;
      isError: boolean;
      /** 已脱敏、已截断并格式化的工具结果，仅用于前端展示。 */
      result?: string;
    }
  | { type: "error"; error: AgentErrorPayload }
  /** 权限确认请求：通知前端弹出确认框，等待用户决策后放行/拒绝 */
  | {
      type: "permission_request";
      requestId: string;
      toolName: string;
      input: unknown;
      reason: string;
    };

// ── Prompt 选项 ──────────────────────────────────────────────────────────────

/** prompt() 方法的可选参数 */
export interface PromptOptions {
  /** 图片附件（base64 编码） */
  images?: Array<{
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  }>;
}

// ── AgentRuntime 接口 ────────────────────────────────────────────────────────

/**
 * Agent 运行时接口
 *
 * 所有 Agent SDK 封装都需要实现此接口。设计要点：
 * - prompt() 返回 AsyncIterable，符合 TS 生态对流式数据的处理惯例
 * - 所有配置通过 init() 参数传入，不隐式依赖环境变量或全局状态
 * - 不耦合任何 Contour 内部 service（如 channelManager），保持模块独立
 */
export interface AgentRuntime {
  /** 初始化运行时，传入 API 凭据和工作目录等配置 */
  init(config: AgentRuntimeConfig): Promise<void>;

  /**
   * 发送消息并返回异步事件流
   *
   * 调用方使用 for await...of 消费事件，循环在收到 agent_end 后结束。
   * 内部实现负责在 dispose() 或新一轮 prompt() 时清理旧的事件订阅。
   */
  prompt(text: string, options?: PromptOptions): AsyncIterable<AgentStreamEvent>;

  /** 中止当前正在执行的操作 */
  abort(): Promise<void>;

  /** 切换模型（后续 prompt 调用使用新模型） */
  setModel(model: string): Promise<void>;

  /** 释放所有资源，包括事件订阅、session 等 */
  dispose(): void | Promise<void>;
}
