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
 * - thinking 事件 → thinking_delta（同上归并逻辑）
 * - agent_end 既是会话结束信号，也是 "done" 信号
 */

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
  /**
   * 权限模式（可选，缺省 "readonly"）
   *
   * - "readonly"：只开放只读工具（read/grep/find/ls + 业务只读），写工具不进
   *   白名单，Agent 调不到。最安全，默认值。
   * - "yolo"：所有工具（含 write/edit/bash）开放，不拦截。
   * - "review"：所有工具开放，但通过 extensionFactories 挂 tool_call 钩子拦截
   *   写操作，等待用户通过 PermissionDialog 确认后放行或拒绝。
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
   * Agent 的工作目录和工具执行基准路径。例如 D:/Contour 或 D:/Contour-dev。
   * 同时也决定了项目名称（取其 basename）。
   * 新代码应使用此字段替代 cwd。
   */
  projectDir: string;
  /**
   * 工作目录（工具执行的基准路径）
   *
   * @deprecated 请使用 projectDir 替代。保留此字段是为了向后兼容，
   * 当 projectDir 未传入时作为回退。后续所有调用方迁移后删除。
   */
  cwd: string;
  /** 启用的工具名称列表，默认只开放 read */
  tools?: string[];
  /**
   * 会话 ID（可选）
   *
   * 传此值可恢复已有会话的对话历史，Agent 会加载之前的消息作为上下文。
   * 不传或传空则创建新会话。持久化文件存储在 dataDir/projects/{projectName}/sessions/ 目录下。
   */
  sessionId?: string;
}

// ── 事件类型 ─────────────────────────────────────────────────────────────────

/**
 * 运行时无关的 Agent 事件联合类型
 *
 * 这些事件从 Pi SDK 的原始事件归并而来，屏蔽了 SDK 内部的事件粒度：
 * - Pi 的 text_start / text_delta / text_end → 统一为 text_delta
 * - Pi 的 thinking_start / thinking_delta / thinking_end → 统一为 thinking_delta
 * - Pi 的 tool_execution_start / tool_execution_end → tool_call_start / tool_call_end
 * - Pi 的 agent_end 即为此处的 agent_end（含 "done" 语义）
 */
export type AgentStreamEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call_start"; toolName: string }
  | { type: "tool_call_end"; toolName: string; isError: boolean }
  | { type: "error"; message: string }
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
  dispose(): void;
}
