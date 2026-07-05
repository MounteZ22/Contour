import type { AIContextItem } from '../types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolActivities?: ToolActivity[];
}

export interface ToolActivity {
  toolName: string;
  status: 'running' | 'done';
  input?: Record<string, unknown>;
  result?: string;
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
  /** 收到权限确认请求 */
  onPermissionRequest?: (request: PermissionRequest) => void;
  /** 流式完成 */
  onComplete: (fullContent: string) => void;
  /** 流式出错 */
  onError: (error: string) => void;
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
): Promise<void> {
  const body: Record<string, unknown> = { message, contextItems };
  if (permissionMode) body.permissionMode = permissionMode;

  const res = await fetch('/api/ai/pi-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`请求失败 (${res.status}): ${text.slice(0, 200)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

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
            case 'text_delta':
              if (raw.delta) {
                fullContent += raw.delta;
                callbacks.onChunk(raw.delta as string);
              }
              break;

            case 'tool_call_start':
              if (callbacks.onToolActivity && raw.toolName) {
                callbacks.onToolActivity({
                  toolName: raw.toolName as string,
                  status: 'running',
                });
              }
              break;

            case 'tool_call_end':
              if (callbacks.onToolActivity && raw.toolName) {
                callbacks.onToolActivity({
                  toolName: raw.toolName as string,
                  status: 'done',
                  result: raw.isError ? '工具执行出错' : undefined,
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
              callbacks.onComplete(fullContent);
              return;

            case 'error':
              callbacks.onError((raw.message as string) || '流式响应异常');
              return;

            default:
              // agent_start / turn_start / turn_end / agent_end / thinking_delta
              // 在最小集展示策略下忽略
              break;
          }
        } catch {
          // ignore unparseable lines
        }
      }
    }
    callbacks.onComplete(fullContent);
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : '连接中断');
  } finally {
    reader.releaseLock();
  }
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
