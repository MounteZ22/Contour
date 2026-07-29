import type { AIContextItem } from '../types';

export type AgentErrorCode =
  | 'invalid_api_key'
  | 'rate_limited'
  | 'prompt_too_long'
  | 'network_error'
  | 'service_error'
  | 'invalid_model'
  | 'aborted'
  | 'unknown';

export interface AgentErrorInfo {
  code: AgentErrorCode;
  title: string;
  message: string;
  canRetry: boolean;
  action?: 'open_settings';
}

const NETWORK_ERROR: AgentErrorInfo = {
  code: 'network_error',
  title: '网络连接失败',
  message: 'Contour 暂时无法连接模型服务，请检查网络后重试。',
  canRetry: true,
};

const UNKNOWN_ERROR: AgentErrorInfo = {
  code: 'unknown',
  title: '生成失败',
  message: '发生了未能识别的问题，请重试；若仍然失败，请检查渠道设置。',
  canRetry: true,
};

const ERROR_CODES = new Set<AgentErrorCode>([
  'invalid_api_key', 'rate_limited', 'prompt_too_long', 'network_error',
  'service_error', 'invalid_model', 'aborted', 'unknown',
]);

export function parseAgentError(value: unknown, status?: number): AgentErrorInfo {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<AgentErrorInfo>;
    if (
      typeof candidate.code === 'string' && ERROR_CODES.has(candidate.code as AgentErrorCode) &&
      typeof candidate.title === 'string' && typeof candidate.message === 'string' &&
      typeof candidate.canRetry === 'boolean'
    ) {
      return candidate as AgentErrorInfo;
    }
  }

  if (status === 401 || status === 403) {
    return {
      code: 'invalid_api_key',
      title: 'API Key 无效',
      message: '当前渠道的 API Key 无效或已过期，请在设置中更新后重试。',
      canRetry: false,
      action: 'open_settings',
    };
  }
  if (status === 429) {
    return { code: 'rate_limited', title: '请求过于频繁', message: '请稍等片刻后重试。', canRetry: true };
  }
  return UNKNOWN_ERROR;
}

export class AgentRequestError extends Error {
  readonly details: AgentErrorInfo;

  constructor(details: AgentErrorInfo) {
    super(details.message);
    this.name = 'AgentRequestError';
    this.details = details;
  }
}

export function toAgentErrorInfo(error: unknown): AgentErrorInfo {
  if (error instanceof AgentRequestError) return error.details;
  return NETWORK_ERROR;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolActivities?: ToolActivity[];
  /** 可观察的执行状态，不含模型原始推理。 */
  processActivities?: ProcessActivity[];
  status?: 'stopped';
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

/** 权限确认请求（来自后端 permission-extension） */
export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: unknown;
  reason: string;
}

/** 用户对权限请求的决策 */
export interface PermissionResponse {
  action: "allow" | "deny";
  remember: boolean;
}

interface StreamCallbacks {
  /** 收到文本增量 */
  onChunk: (delta: string) => void;
  /** 收到工具活动 */
  onToolActivity?: (activity: ToolActivity) => void;
  /** 收到可观察的执行状态；不包含模型原始推理。 */
  onProcessActivity?: (activity: ProcessActivity) => void;
  /** 收到权限确认请求 */
  onPermissionRequest?: (request: PermissionRequest) => void;
  /** 流式完成 */
  onComplete: (fullContent: string) => void;
  /** 用户主动停止，返回停止前已收到的内容 */
  onAborted?: (partialContent: string) => void;
  /** 流式出错 */
  onError: (error: AgentErrorInfo, partialContent?: string) => void;
}

/**
 * 流式发送聊天消息
 *
 * 走 PiRuntime 后端（POST /api/ai/pi-chat），消费 AgentStreamEvent 事件流。
 */
export async function sendChatMessageStream(
  message: string,
  contextItems: AIContextItem[],
  callbacks: StreamCallbacks,
  permissionMode?: "readonly" | "review" | "yolo",
  projectId?: string,
  sessionId?: string,
  signal?: AbortSignal,
  modelSelection?: { channelId: string; model: string },
): Promise<void> {
  const body: Record<string, unknown> = { message, contextItems };
  if (permissionMode) body.permissionMode = permissionMode;
  if (projectId) body.projectId = projectId;
  if (sessionId) body.sessionId = sessionId;
  if (modelSelection) {
    body.channelId = modelSelection.channelId;
    body.model = modelSelection.model;
  }

  let partialContent = '';
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  let didWatchdogTimeout = false;
  const abortController = new AbortController();
  const resetWatchdog = () => {
    if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      didWatchdogTimeout = true;
      abortController.abort();
      callbacks.onError({
        code: 'network_error',
        title: '生成超时',
        message: '超过 120 秒未收到生成数据，请检查网络后重试。',
        canRetry: true,
      }, partialContent);
    }, 120_000);
  };
  const abortFromSignal = () => abortController.abort();
  const cleanup = () => {
    if (watchdogTimer !== undefined) clearTimeout(watchdogTimer);
    signal?.removeEventListener('abort', abortFromSignal);
  };
  if (signal?.aborted) {
    abortController.abort();
  } else {
    signal?.addEventListener('abort', abortFromSignal, { once: true });
  }
  resetWatchdog();

  let res: Response;
  try {
    res = await fetch('/api/ai/pi-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
  } catch (err) {
    cleanup();
    if (didWatchdogTimeout) return;
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      callbacks.onAborted?.(partialContent);
      return;
    }
    callbacks.onError(toAgentErrorInfo(err), partialContent);
    return;
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { error?: unknown } | null;
    cleanup();
    throw new AgentRequestError(parseAgentError(payload?.error, res.status));
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetWatchdog();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const raw = JSON.parse(data) as Record<string, unknown>;

          switch (raw.type) {
            case 'agent_start':
              callbacks.onProcessActivity?.({
                id: 'agent-start',
                label: '正在准备回答',
                status: 'active',
              });
              break;

            case 'turn_start':
              callbacks.onProcessActivity?.({
                id: 'turn-start',
                label: '正在生成回应',
                status: 'active',
              });
              break;

            case 'text_delta':
              if (raw.delta) {
                partialContent += raw.delta as string;
                callbacks.onChunk(raw.delta as string);
              }
              break;

            case 'tool_call_start':
              if (raw.toolName) {
                callbacks.onToolActivity?.({
                  id: typeof raw.toolCallId === 'string' ? raw.toolCallId : undefined,
                  toolName: raw.toolName as string,
                  status: 'running',
                  input: isRecord(raw.input) ? raw.input : undefined,
                });
                callbacks.onProcessActivity?.({
                  id: `tool-${raw.toolCallId ?? raw.toolName}`,
                  label: `正在调用 ${raw.toolName as string}`,
                  status: 'active',
                });
              }
              break;

            case 'tool_call_end':
              if (raw.toolName) {
                callbacks.onToolActivity?.({
                  id: typeof raw.toolCallId === 'string' ? raw.toolCallId : undefined,
                  toolName: raw.toolName as string,
                  status: raw.isError ? 'error' : 'done',
                  result: typeof raw.result === 'string'
                    ? raw.result
                    : raw.isError ? '工具执行出错' : undefined,
                });
                callbacks.onProcessActivity?.({
                  id: `tool-${raw.toolCallId ?? raw.toolName}`,
                  label: `${raw.toolName as string} ${raw.isError ? '执行失败' : '已完成'}`,
                  status: raw.isError ? 'error' : 'done',
                });
              }
              break;

            case 'permission_request':
              if (callbacks.onPermissionRequest && raw.requestId) {
                callbacks.onPermissionRequest({
                  requestId: raw.requestId as string,
                  toolName: raw.toolName as string,
                  input: raw.input,
                  reason: (raw.reason as string) || `需要确认 ${raw.toolName} 操作`,
                });
              }
              break;

            case 'done':
              callbacks.onProcessActivity?.({
                id: 'agent-start',
                label: '回答已准备完成',
                status: 'done',
              });
              callbacks.onProcessActivity?.({
                id: 'turn-start',
                label: '回应已生成',
                status: 'done',
              });
              callbacks.onProcessActivity?.({
                id: 'agent-finished',
                label: '已完成',
                status: 'done',
              });
              callbacks.onComplete(partialContent);
              return;

            case 'error':
              callbacks.onError(parseAgentError(raw.error ?? raw.message), partialContent);
              return;

            default:
              // thinking_delta 是模型原始推理，不能展示或持久化。
              break;
          }
        } catch {
          // ignore unparseable lines
        }
      }
    }
    callbacks.onComplete(partialContent);
  } catch (err) {
    if (didWatchdogTimeout) return;
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      callbacks.onAborted?.(partialContent);
    } else {
      callbacks.onError(toAgentErrorInfo(err), partialContent);
    }
  } finally {
    reader.releaseLock();
    cleanup();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 发送用户对工具权限请求的决策
 *
 * 由 PermissionDialog 在用户点击后调用，告知后端放行或拒绝。
 */
export async function respondToPermission(
  requestId: string,
  action: "allow" | "deny",
  remember: boolean = false,
): Promise<boolean> {
  const res = await fetch('/api/ai/permission-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, action, remember }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`权限响应失败 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { success: boolean };
  return data.success;
}
