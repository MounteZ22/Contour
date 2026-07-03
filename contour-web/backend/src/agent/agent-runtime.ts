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
  /** 工作目录（工具执行的基准路径） */
  cwd: string;
  /** 启用的工具名称列表，默认只开放 read */
  tools?: string[];
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
  | { type: "error"; message: string };

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
