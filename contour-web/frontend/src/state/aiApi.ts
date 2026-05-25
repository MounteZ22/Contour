import type { AIContextItem } from '../components/AIWorkbenchPanel';

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
 * 消费 SSE 后端，通过回调返回增量内容
 */
export async function sendChatMessageStream(
  message: string,
  contextItems: AIContextItem[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const res = await fetch('/api/ai/chat', {
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
            content?: string;
            error?: string;
          };

          eventCount++;
          if (eventCount <= 3) {
            console.log('[SSE Frontend] Event:', event);
          }

          if (event.type === 'text' && event.content) {
            fullContent += event.content;
            callbacks.onChunk(event.content);
          } else if (event.type === 'tool' && callbacks.onToolActivity) {
            callbacks.onToolActivity({
              toolName: (event as any).toolName || '',
              status: (event as any).status || 'running',
              input: (event as any).input,
              result: (event as any).result,
            });
          } else if (event.type === 'done') {
            console.log('[SSE Frontend] Done. Full content length:', fullContent.length);
            callbacks.onComplete(fullContent);
            return;
          } else if (event.type === 'error') {
            callbacks.onError(event.error || '流式响应异常');
            return;
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
