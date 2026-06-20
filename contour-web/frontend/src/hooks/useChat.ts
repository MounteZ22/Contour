import { useCallback, useEffect, useRef, useState } from 'react';
import { sendChatMessageStream } from '../state/aiApi';
import type { ChatMessage, ToolActivity } from '../state/aiApi';
import type { AIContextItem } from '../types';

export interface UseChatReturn {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (v: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  toolActivities: ToolActivity[];
  error: string | null;
  handleSend: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  clearMessages: () => void;
}

interface UseChatOptions {
  sessionId?: string;
}

function readStoredMessages(sessionId: string | undefined): ChatMessage[] {
  if (!sessionId) return [];
  try {
    const raw = localStorage.getItem(`contour:chat:${sessionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredMessages(sessionId: string | undefined, messages: ChatMessage[]) {
  if (!sessionId) return;
  localStorage.setItem(`contour:chat:${sessionId}`, JSON.stringify(messages));
}

export function useChat(initialContext: AIContextItem[] = [], options: UseChatOptions = {}): UseChatReturn {
  const { sessionId } = options;
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages(sessionId));
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    setMessages(readStoredMessages(sessionId));
  }, [sessionId]);

  const updateMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        writeStoredMessages(sessionId, next);
        return next;
      });
    },
    [sessionId],
  );

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    updateMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');
    setToolActivities([]);
    setError(null);

    const currentToolActivities: ToolActivity[] = [];

    try {
      await sendChatMessageStream(trimmed, initialContext || [], {
        onChunk: (delta) => {
          setStreamingContent((prev) => prev + delta);
        },
        onToolActivity: (activity) => {
          const existingIdx = currentToolActivities.findIndex(
            (a) => a.toolName === activity.toolName && a.status === 'running',
          );
          if (existingIdx >= 0) {
            currentToolActivities[existingIdx] = activity;
          } else {
            currentToolActivities.push(activity);
          }

          setToolActivities((prev) => {
            const idx = prev.findIndex(
              (a) => a.toolName === activity.toolName && a.status === 'running',
            );
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = activity;
              return updated;
            }
            return [...prev, activity];
          });
        },
        onComplete: (fullContent) => {
          const assistantMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: fullContent,
            toolActivities: currentToolActivities.length > 0 ? [...currentToolActivities] : undefined,
          };
          updateMessages((prev) => [...prev, assistantMessage]);
          setStreamingContent('');
          setIsStreaming(false);
          setToolActivities([]);
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          setIsStreaming(false);
          setStreamingContent('');
          setToolActivities([]);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送失败，请重试';
      setError(msg);
      setIsStreaming(false);
      setStreamingContent('');
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 50);
    }
  }, [inputValue, isLoading, initialContext, scrollToBottom, updateMessages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const clearMessages = useCallback(() => {
    updateMessages(() => []);
    setStreamingContent('');
    setIsStreaming(false);
    setToolActivities([]);
    setError(null);
  }, [updateMessages]);

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    isStreaming,
    streamingContent,
    toolActivities,
    error,
    handleSend,
    handleKeyDown,
    clearMessages,
  };
}
