import { useCallback, useEffect, useRef, useState } from 'react';
import { sendChatMessageStream, respondToPermission, toAgentErrorInfo } from '../state/aiApi';
import type { AgentErrorInfo, ChatMessage, PermissionRequest, ToolActivity } from '../state/aiApi';
import type { AIContextItem } from '../types';

export type PermissionMode = "readonly" | "review" | "yolo";

export interface UseChatReturn {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (v: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  toolActivities: ToolActivity[];
  error: AgentErrorInfo | null;
  handleSend: () => Promise<void>;
  handleRetry: () => Promise<void>;
  handleStop: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  clearMessages: () => void;
  permissionMode: PermissionMode;
  setPermissionMode: (mode: PermissionMode) => void;
  /** 当前的权限确认请求（review 模式下弹出对话框用） */
  permissionRequest: PermissionRequest | null;
  /** 响应当前权限请求 */
  handlePermissionResponse: (action: "allow" | "deny", remember: boolean) => Promise<void>;
}

interface UseChatOptions {
  sessionId?: string;
  projectId?: string;
}

// ── localStorage 读写 ───────────────────────────────────────────────────────────

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

// ── 后端 API ────────────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 从后端获取会话的完整消息历史（JSONL 原始记录）
 * 失败时返回 null（调用方降级到 localStorage）
 */
async function fetchBackendMessages(
  projectId: string,
  sessionId: string,
): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch(
      `/api/agent/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`,
    );
    if (!res.ok) return null;
    const json: ApiResponse<Record<string, unknown>[]> = await res.json();
    if (!json.success || !Array.isArray(json.data)) return null;
    return json.data;
  } catch (err) {
    console.warn('[AgentSessions] 从后端获取消息失败，将降级到 localStorage:', err);
    return null;
  }
}

// ── JSONL → ChatMessage 转换 ────────────────────────────────────────────────────

/**
 * 将 Pi SDK JSONL 事件记录转换为 ChatMessage 数组
 *
 * Pi SDK JSONL 中的事件格式：
 * - 用户消息：{ "role": "user", "content": "..." }
 * - Assistant 文本增量：{ "type": "message_update", "assistantMessageEvent": { "type": "text_delta", "delta": "..." } }
 * - 或直接的 text_delta：{ "type": "text_delta", "delta": "..." }
 * - 会话管理事件（agent_start / turn_start / turn_end / agent_end）被忽略
 *
 * 转换策略：将连续的 text_delta 聚合为一条 assistant 消息，
 * turn_start / turn_end 边界作为消息分隔。
 */
function convertJsonlToChatMessages(records: Record<string, unknown>[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let currentAssistantContent = '';
  let msgIndex = 0;

  for (const record of records) {
    // Pi v3 最终消息：{ type: 'message', message: { role, content } }
    if (record.type === 'message' && record.message && typeof record.message === 'object') {
      const piMessage = record.message as Record<string, unknown>;
      const role = piMessage.role;
      if (role === 'user' || role === 'assistant') {
        if (currentAssistantContent) {
          messages.push({ id: `hist_${msgIndex++}`, role: 'assistant', content: currentAssistantContent });
          currentAssistantContent = '';
        }
        const content = typeof piMessage.content === 'string'
          ? piMessage.content
          : Array.isArray(piMessage.content)
            ? piMessage.content
                .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === 'object')
                .filter((block) => block.type === 'text' && typeof block.text === 'string')
                .map((block) => block.text as string)
                .join('\n')
            : '';
        if (content) {
          messages.push({
            id: (record.id as string) || `hist_${msgIndex++}`,
            role,
            content,
          });
        }
      }
      continue;
    }

    // 会话元数据（跳过）
    if (record.type === 'session' || record.type === 'session_info' || record.type === 'session_created') continue;

    // 用户消息
    if (record.role === 'user' && typeof record.content === 'string') {
      // 先保存之前累积的 assistant 内容
      if (currentAssistantContent) {
        messages.push({
          id: `hist_${msgIndex++}`,
          role: 'assistant',
          content: currentAssistantContent,
        });
        currentAssistantContent = '';
      }
      messages.push({
        id: (record.id as string) || `hist_${msgIndex++}`,
        role: 'user',
        content: record.content,
      });
      continue;
    }

    // Pi SDK message_update.text_delta 事件
    if (record.type === 'message_update') {
      const sub = record.assistantMessageEvent as Record<string, unknown> | undefined;
      if (sub?.type === 'text_delta' && typeof sub.delta === 'string') {
        currentAssistantContent += sub.delta;
      }
      continue;
    }

    // 直接的 text_delta 事件（简化格式）
    if (record.type === 'text_delta' && typeof record.delta === 'string') {
      currentAssistantContent += record.delta;
      continue;
    }

    // turn_end 作为 assistant 消息边界
    if (record.type === 'turn_end' && currentAssistantContent) {
      messages.push({
        id: `hist_${msgIndex++}`,
        role: 'assistant',
        content: currentAssistantContent,
      });
      currentAssistantContent = '';
    }
  }

  // 保存最后未结束的 assistant 内容
  if (currentAssistantContent) {
    messages.push({
      id: `hist_${msgIndex++}`,
      role: 'assistant',
      content: currentAssistantContent,
    });
  }

  return messages;
}

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useChat(initialContext: AIContextItem[] = [], options: UseChatOptions = {}): UseChatReturn {
  const { sessionId, projectId } = options;
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages(sessionId));
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [error, setError] = useState<AgentErrorInfo | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('readonly');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const failedMessageRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ── sessionId / projectId 变化时加载消息历史 ──────────────────────────────
  // 优先从后端 JSONL 加载，失败时降级到 localStorage
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    if (projectId) {
      fetchBackendMessages(projectId, sessionId).then((records) => {
        if (cancelled) return;
        if (records && records.length > 0) {
          const converted = convertJsonlToChatMessages(records);
          if (converted.length > 0) {
            setMessages(converted);
            // 同步到 localStorage 作为离线缓存
            writeStoredMessages(sessionId, converted);
            return;
          }
        }
        // 后端无数据或转换结果为空 → 降级到 localStorage
        setMessages(readStoredMessages(sessionId));
      });
    } else {
      // 无 projectId → 仅使用 localStorage
      setMessages(readStoredMessages(sessionId));
    }

    return () => {
      cancelled = true;
    };
  }, [sessionId, projectId]);

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

  const sendMessage = useCallback(async (trimmed: string, appendUserMessage: boolean) => {
    if (!trimmed || isLoading) return;

    if (appendUserMessage) {
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: trimmed,
      };
      updateMessages((prev) => [...prev, userMessage]);
      setInputValue('');
    }
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');
    setToolActivities([]);
    setError(null);

    const currentToolActivities: ToolActivity[] = [];
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

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
        onPermissionRequest: (request) => {
          setPermissionRequest(request);
        },
        onComplete: (fullContent) => {
          failedMessageRef.current = null;
          const assistantMessage: ChatMessage = {
            id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'assistant',
            content: fullContent,
            toolActivities: currentToolActivities.length > 0 ? [...currentToolActivities] : undefined,
          };
          updateMessages((prev) => [...prev, assistantMessage]);
          setStreamingContent('');
          setIsStreaming(false);
          setToolActivities([]);
        },
        onAborted: (partialContent) => {
          failedMessageRef.current = null;
          const assistantMessage: ChatMessage = {
            id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'assistant',
            content: partialContent,
            status: 'stopped',
            toolActivities: currentToolActivities.length > 0 ? [...currentToolActivities] : undefined,
          };
          updateMessages((prev) => [...prev, assistantMessage]);
          setStreamingContent('');
          setIsStreaming(false);
          setToolActivities([]);
        },
        onError: (errorInfo) => {
          failedMessageRef.current = trimmed;
          setError(errorInfo);
          setIsStreaming(false);
          setStreamingContent('');
          setToolActivities([]);
        },
      }, permissionMode, projectId, sessionId, abortController.signal);
    } catch (err) {
      failedMessageRef.current = trimmed;
      setError(toAgentErrorInfo(err));
      setIsStreaming(false);
      setStreamingContent('');
      console.error('Chat error:', err);
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      setTimeout(scrollToBottom, 50);
    }
  }, [isLoading, initialContext, scrollToBottom, updateMessages, permissionMode, projectId, sessionId]);

  const handleSend = useCallback(
    () => sendMessage(inputValue.trim(), true),
    [inputValue, sendMessage],
  );

  const handleRetry = useCallback(async () => {
    const failedMessage = failedMessageRef.current;
    if (!failedMessage) return;
    await sendMessage(failedMessage, false);
  }, [sendMessage]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handlePermissionResponse = useCallback(async (
    action: "allow" | "deny",
    remember: boolean,
  ) => {
    const req = permissionRequest;
    if (!req) return;

    try {
      await respondToPermission(req.requestId, action, remember);
    } catch (err) {
      console.error('[Permission] 响应失败:', err);
    } finally {
      setPermissionRequest(null);
    }
  }, [permissionRequest]);

  const clearMessages = useCallback(() => {
    updateMessages(() => []);
    setStreamingContent('');
    setIsStreaming(false);
    setToolActivities([]);
    setError(null);
    failedMessageRef.current = null;
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
    handleRetry,
    handleStop,
    handleKeyDown,
    clearMessages,
    permissionMode,
    setPermissionMode,
    permissionRequest,
    handlePermissionResponse,
  };
}
