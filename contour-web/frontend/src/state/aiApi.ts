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

interface StreamCallbacks {
  /** 收到文本增量 */
  onChunk: (delta: string) => void;
  /** 收到工具活动 */
  onToolActivity?: (activity: ToolActivity) => void;
  /** 流式完成 */
  onComplete: (fullContent: string) => void;
  /** 流式出错 */
  onError: (error: string) => void;
}

/**
 * 流式发送聊天消息
 *
 * 走 PiRuntime 后端（POST /api/ai/pi-chat），消费 AgentStreamEvent 事件流。
 * channelId 不传，后端回退到默认 agent 渠道。contextItems（Flow/Doc 引用）
 * 透传给后端，由 buildSystemPrompt() 注入到 Agent 的 system prompt。
 *
 * 事件映射（Pi AgentStreamEvent → 前端回调）：
 * - text_delta → onChunk(delta)
 * - tool_call_start → onToolActivity(running)
 * - tool_call_end → onToolActivity(done，出错时 result 标记)
 * - done → onComplete
 * - error → onError
 * - agent_start / turn_start / turn_end / agent_end / thinking_delta → 忽略（最小集展示）
 */
export async function sendChatMessageStream(
  message: string,
  contextItems: AIContextItem[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const res = await fetch('/api/ai/pi-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, contextItems }),
  });

  console.log('[SSE Frontend] Response status:', res.status, 'content-type:', res.headers.get('content-type'));

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`请求失败 (${res.status}): ${text.slice(0, 200)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let eventCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[SSE Frontend] Stream done. Events:', eventCount, 'Content length:', fullContent.length);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const event = JSON.parse(data) as {
            type: string;
            delta?: string;
            toolName?: string;
            isError?: boolean;
            message?: string;
          };

          eventCount++;
          if (eventCount <= 3) {
            console.log('[SSE Frontend] Event:', event);
          }

          switch (event.type) {
            case 'text_delta':
              if (event.delta) {
                fullContent += event.delta;
                callbacks.onChunk(event.delta);
              }
              break;

            case 'tool_call_start':
              if (callbacks.onToolActivity && event.toolName) {
                callbacks.onToolActivity({
                  toolName: event.toolName,
                  status: 'running',
                });
              }
              break;

            case 'tool_call_end':
              if (callbacks.onToolActivity && event.toolName) {
                callbacks.onToolActivity({
                  toolName: event.toolName,
                  status: 'done',
                  result: event.isError ? '工具执行出错' : undefined,
                });
              }
              break;

            case 'done':
              console.log('[SSE Frontend] Done. Full content length:', fullContent.length);
              callbacks.onComplete(fullContent);
              return;

            case 'error':
              callbacks.onError(event.message || '流式响应异常');
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
    // Stream ended without explicit done event
    callbacks.onComplete(fullContent);
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : '连接中断');
  } finally {
    reader.releaseLock();
  }
}

/**
 * 非流式发送聊天消息（保留向后兼容）
 */
export async function sendChatMessage(
  message: string,
  contextItems: AIContextItem[],
): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    let content = '';
    sendChatMessageStream(message, contextItems, {
      onChunk: (delta) => {
        content += delta;
      },
      onComplete: () => {
        resolve({
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content,
        });
      },
      onError: (error) => {
        reject(new Error(error));
      },
    }).catch(reject);
  });
}
