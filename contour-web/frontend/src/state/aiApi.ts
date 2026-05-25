import type { AIContextItem } from '../components/AIWorkbenchPanel';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  message: string,
  contextItems: AIContextItem[],
): Promise<ChatMessage> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, contextItems }),
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || '请求失败');
  }

  return {
    id: `msg_${Date.now()}`,
    role: data.data.role,
    content: data.data.message,
  };
}
