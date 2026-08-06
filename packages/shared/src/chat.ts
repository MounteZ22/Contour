/**
 * @contour/shared — 跨端 Agent 聊天契约
 *
 * 后端 Agent 运行时（未来迁入 packages/core）与 web 前端共用这些类型，
 * 避免 core 反向依赖 frontend。
 */

/** AskUser 单个问题的结构 */
export interface AskUserQuestion {
  question: string;
  header: string;
  options?: AskUserOption[];
  multiSelect?: boolean;
}

/** AskUser 选项 */
export interface AskUserOption {
  label: string;
  description?: string;
}

/** 一次性问答请求（嵌入在消息中） */
export interface AskUserRequest {
  requestId: string;
  questions: AskUserQuestion[];
  status: 'pending' | 'answered';
  /** 已提交的答案，用于在对话历史中保留用户选择。 */
  answers?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 所属轮次序号（从 1 开始），用于前端按 turn 分组展示 */
  turnIndex?: number;
  /** 本轮中 write/edit 操作涉及的文件路径（去重后） */
  filesChanged?: string[];
  toolActivities?: ToolActivity[];
  /** 可观察的执行状态，不含模型原始推理。 */
  processActivities?: ProcessActivity[];
  status?: 'stopped';
  /** AskUser 交互问答请求 */
  askUserRequest?: AskUserRequest;
}

export interface ToolActivity {
  /** Pi SDK 的 toolCallId，用于区分同名的并行调用。 */
  id?: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  input?: Record<string, unknown>;
  result?: string;
}

export interface ProcessActivity {
  id: string;
  label: string;
  status: 'active' | 'done' | 'error';
}
