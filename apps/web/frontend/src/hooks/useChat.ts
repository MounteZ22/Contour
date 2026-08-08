import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { sendChatMessageStream, respondToPermission, toAgentErrorInfo } from '../state/aiApi';
import type { ChatMessage, ProcessActivity, ToolActivity, AskUserRequest } from '@contour/shared';
import type { AgentErrorInfo, PermissionRequest } from '../state/aiApi';
import type { AIContextItem } from '@contour/shared';
import { chatDraftsAtom, planModeEnabledAtom } from '../state/chat';

export type PermissionMode = "readonly" | "review" | "yolo";

/** Plan Mode 状态 */
export type PlanStatus = 'idle' | 'active' | 'complete' | 'approved';

export interface UseChatReturn {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (v: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  toolActivities: ToolActivity[];
  /** 当前轮的工具活动快照，仅供即时任务进度显示，不会持久化。 */
  taskActivities: ToolActivity[];
  processActivities: ProcessActivity[];
  error: AgentErrorInfo | null;
  handleSend: () => Promise<void>;
  handleSendText: (message: string) => Promise<void>;
  handleRetry: () => Promise<void>;
  handleStop: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  clearMessages: () => void;
  permissionMode: PermissionMode;
  setPermissionMode: (mode: PermissionMode) => void;
  /** 当前的权限确认请求（review 模式下弹出对话框用） */
  permissionRequest: PermissionRequest | null;
  /** 响应当前权限请求 */
  handlePermissionResponse: (action: "allow" | "deny", remember: boolean) => Promise<boolean>;
  /** 权限响应提交失败时保留的错误；横幅仍可重试。 */
  permissionResponseError: string | null;
  /** 当前流中的 AskUser 请求，必须在收到 SSE 后立即显示。 */
  askUserRequest: AskUserRequest | null;
  /** AskUser 提交成功后将答案写入当前消息并恢复流。 */
  handleAskUserAnswered: (requestId: string, answers: Record<string, string>) => void;
  /** Plan Mode 相关 */
  planModeEnabled: boolean;
  setPlanModeEnabled: (enabled: boolean) => void;
  planStatus: PlanStatus;
  planContent: string;
  handleApprovePlan: () => void;
  handleModifyPlan: (feedback: string) => void;
}

interface UseChatOptions {
  sessionId?: string;
  projectId?: string;
  modelSelection?: { channelId: string; model: string };
}

// ── localStorage 读写 ───────────────────────────────────────────────────────────

function readStoredMessages(sessionId: string | undefined): ChatMessage[] {
  // 防止新建但尚未保存的会话因共享 undefined key 而互相污染。
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
 * 从后端获取会话的结构化消息历史（ChatMessage[]）
 *
 * 成功时返回数组（可能为空 → 前端显示空会话）；失败时返回 null（调用方降级到 localStorage）。
 * 请求通过 signal 取消，避免切换会话时过期响应覆盖新会话状态。
 */
async function fetchBackendMessages(
  projectId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatMessage[] | null> {
  try {
    const res = await fetch(
      `/api/agent/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/messages`,
      { signal },
    );
    if (!res.ok) return null;
    const json: ApiResponse<ChatMessage[]> = await res.json();
    if (!json.success || !Array.isArray(json.data)) return null;
    return json.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    console.warn('[AgentSessions] 从后端获取消息失败，将降级到 localStorage:', err);
    return null;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useChat(initialContext: AIContextItem[] = [], options: UseChatOptions = {}): UseChatReturn {
  const { sessionId, projectId, modelSelection } = options;
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages(sessionId));
  const [drafts, setDrafts] = useAtom(chatDraftsAtom);
  const [planModeEnabled, setPlanModeEnabled] = useAtom(planModeEnabledAtom);
  const [transientInputValue, setTransientInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [taskActivities, setTaskActivities] = useState<ToolActivity[]>([]);
  const [processActivities, setProcessActivities] = useState<ProcessActivity[]>([]);
  const [error, setError] = useState<AgentErrorInfo | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [permissionResponseError, setPermissionResponseError] = useState<string | null>(null);
  const [askUserRequest, setAskUserRequest] = useState<AskUserRequest | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('readonly');
  const [planStatus, setPlanStatus] = useState<PlanStatus>('idle');
  const [planContent, setPlanContent] = useState('');
  const planContentRef = useRef('');
  const askUserRequestRef = useRef<AskUserRequest | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const failedMessageRef = useRef<{ message: string; partialContent: string } | null>(null);
  const resumeWatchdogRef = useRef<(() => void) | null>(null);
  const streamGenerationRef = useRef(0);

  const inputValue = sessionId ? (drafts[sessionId] ?? '') : transientInputValue;
  const setInputValue = useCallback((value: string) => {
    if (!sessionId) {
      setTransientInputValue(value);
      return;
    }
    setDrafts((previous) => previous[sessionId] === value ? previous : { ...previous, [sessionId]: value });
  }, [sessionId, setDrafts]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ── sessionId / projectId 变化时加载消息历史 ──────────────────────────────
  // 优先从后端结构化消息历史加载（成功即采用，含空会话）；失败时降级到 localStorage。
  // 切换会话时中止过期请求，防止旧会话响应覆盖新会话状态。
  useEffect(() => {
    // 任务浮层只属于正在进行的这一轮，切换会话时不能继承旧快照。
    setTaskActivities([]);
    // 切换会话时先清空消息，避免闪现上一会话内容；新会话消息由下方异步加载后填充。
    setMessages([]);
    if (!sessionId) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    if (projectId) {
      fetchBackendMessages(projectId, sessionId, abortController.signal).then((history) => {
        if (cancelled) return;
        if (history !== null) {
          // 后端成功：空数组也是有效状态（空会话），不回退 localStorage
          setMessages(history);
          // 同步到 localStorage 作为离线缓存
          writeStoredMessages(sessionId, history);
          return;
        }
        // 后端失败 → 降级到 localStorage
        setMessages(readStoredMessages(sessionId));
      });
    } else {
      // 无 projectId → 仅使用 localStorage
      setMessages(readStoredMessages(sessionId));
    }

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [sessionId, projectId]);

  // 切换会话或卸载时必须终止旧 SSE，避免旧流回调覆盖新会话状态。
  // 同时重置流式 UI 状态，防止切换会话后 isStreaming 等残留导致界面卡死。
  useEffect(() => {
    return () => {
      streamGenerationRef.current += 1;
      resumeWatchdogRef.current = null;
      abortControllerRef.current?.abort();
      setIsStreaming(false);
      setStreamingContent('');
      setToolActivities([]);
      setProcessActivities([]);
      setError(null);
      setPermissionRequest(null);
      setTaskActivities([]);
    };
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

  const sendMessage = useCallback(async (
    trimmed: string,
    appendUserMessage: boolean,
    requestOptions: { planMode?: boolean; preservePlan?: boolean } = {},
  ) => {
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
    setTaskActivities([]);
    setProcessActivities([]);
    setError(null);
    setPermissionResponseError(null);
    if (!requestOptions.preservePlan) {
      setPlanStatus('idle');
      setPlanContent('');
      planContentRef.current = '';
    }
    askUserRequestRef.current = null;
    setAskUserRequest(null);

    const currentToolActivities: ToolActivity[] = [];
    const currentProcessActivities: ProcessActivity[] = [];

    // ── Turn 分组追踪 ─────────────────────────────────────────────────────
    let partialContent = ''; // 当前轮已生成的文本
    let currentTurnIndex = -1; // 当前轮次序号（-1 表示未进入任何轮次）
    let currentTurnFilesChanged: string[] = [];
    let hasTurnEvents = false;

    /** 将当前轮内容刷为一条 assistant ChatMessage */
    const flushTurnMessage = () => {
      if (currentTurnIndex < 0) return;
      const content = partialContent;
      if (!content && currentToolActivities.length === 0) return;

      const askUserRequest = askUserRequestRef.current;
      const msg: ChatMessage = {
        id: `assistant_t${currentTurnIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        content,
        turnIndex: currentTurnIndex,
        filesChanged: currentTurnFilesChanged.length > 0 ? [...currentTurnFilesChanged] : undefined,
        toolActivities: currentToolActivities.length > 0 ? [...currentToolActivities] : undefined,
        processActivities: currentProcessActivities.length > 0 ? [...currentProcessActivities] : undefined,
        askUserRequest: askUserRequest ?? undefined,
      };
      updateMessages((prev) => [...prev, msg]);

      // 重置本轮累加器
      partialContent = '';
      currentToolActivities.length = 0;
      currentProcessActivities.length = 0;
      askUserRequestRef.current = null;
      setAskUserRequest(null);
      setStreamingContent('');
      setToolActivities([]);
      setTaskActivities([]);
      setProcessActivities([]);
    };
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const streamGeneration = ++streamGenerationRef.current;
    const isCurrentStream = () => (
      streamGenerationRef.current === streamGeneration
      && abortControllerRef.current === abortController
    );

    try {
      await sendChatMessageStream(trimmed, initialContext || [], {
        onChunk: (delta) => {
          if (!isCurrentStream()) return;
          partialContent += delta;
          setStreamingContent((prev) => prev + delta);
          // Plan Mode：收集 EnterPlanMode 之后的文本作为计划内容
          if (planContentRef.current !== null) {
            planContentRef.current += delta;
            setPlanContent(planContentRef.current);
          }
        },
        onToolActivity: (activity) => {
          if (!isCurrentStream()) return;
          const existingIdx = currentToolActivities.findIndex(
            (a) => (activity.id ? a.id === activity.id : a.toolName === activity.toolName) && a.status === 'running',
          );
          if (existingIdx >= 0) {
            currentToolActivities[existingIdx] = {
              ...currentToolActivities[existingIdx],
              ...activity,
              input: activity.input ?? currentToolActivities[existingIdx].input,
            };
          } else {
            currentToolActivities.push(activity);
          }
          setTaskActivities(currentToolActivities.filter(
            (item) => item.toolName === 'TaskCreate' || item.toolName === 'TaskUpdate',
          ));

          setToolActivities((prev) => {
            const idx = prev.findIndex(
              (a) => (activity.id ? a.id === activity.id : a.toolName === activity.toolName) && a.status === 'running',
            );
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                ...activity,
                input: activity.input ?? updated[idx].input,
              };
              return updated;
            }
            return [...prev, activity];
          });
        },
        onProcessActivity: (activity) => {
          if (!isCurrentStream()) return;
          const existingIdx = currentProcessActivities.findIndex((item) => item.id === activity.id);
          if (existingIdx >= 0) currentProcessActivities[existingIdx] = activity;
          else currentProcessActivities.push(activity);

          setProcessActivities((prev) => {
            const idx = prev.findIndex((item) => item.id === activity.id);
            if (idx < 0) return [...prev, activity];
            const updated = [...prev];
            updated[idx] = activity;
            return updated;
          });
        },
        onPermissionRequest: (request) => {
          if (!isCurrentStream()) return;
          setPermissionRequest(request);
          setPermissionResponseError(null);
        },
        onPlan: (event) => {
          if (!isCurrentStream()) return;
          if (event.action === 'enter') {
            setPlanStatus('active');
            planContentRef.current = '';
            setPlanContent('');
          } else if (event.action === 'exit') {
            setPlanStatus('complete');
            planContentRef.current = null as unknown as string;
          }
        },
        onAskUser: (request) => {
          if (!isCurrentStream()) return;
          askUserRequestRef.current = request;
          setAskUserRequest(request);
        },
        onTurnStart: (turnIndex) => {
          if (!isCurrentStream()) return;
          // 新一轮开始前，先刷出上一轮的内容
          flushTurnMessage();
          hasTurnEvents = true;
          currentTurnIndex = turnIndex;
          currentTurnFilesChanged = [];
        },
        onTurnEnd: (_turnIndex, filesChanged) => {
          if (!isCurrentStream()) return;
          currentTurnFilesChanged = filesChanged;
          // 本轮结束，刷出本轮消息
          flushTurnMessage();
          currentTurnIndex = -1;
        },
        onComplete: (_fullContent) => {
          if (!isCurrentStream()) return;
          failedMessageRef.current = null;
          // 如果有未刷出的内容（兼容无 turn 事件的旧版响应或最后一轮未结束）
          if (currentTurnIndex >= 0) {
            flushTurnMessage();
          } else if (!hasTurnEvents && (_fullContent || partialContent || currentToolActivities.length > 0)) {
            // 兼容无 turn 事件的响应：优先用后端返回的 fullContent
            const askUserRequest = askUserRequestRef.current;
            const assistantMessage: ChatMessage = {
              id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              role: 'assistant',
              content: _fullContent || partialContent,
              toolActivities: currentToolActivities.length > 0 ? [...currentToolActivities] : undefined,
              processActivities: currentProcessActivities.length > 0 ? [...currentProcessActivities] : undefined,
              askUserRequest: askUserRequest ?? undefined,
            };
            updateMessages((prev) => [...prev, assistantMessage]);
            askUserRequestRef.current = null;
          }
          setStreamingContent('');
          setIsStreaming(false);
          setToolActivities([]);
          setProcessActivities([]);
        },
        onAborted: (abortedContent) => {
          if (!isCurrentStream()) return;
          failedMessageRef.current = null;
          // 有 turn 上下文时刷出当前轮消息
          if (currentTurnIndex >= 0) {
            partialContent = abortedContent;
            flushTurnMessage();
          } else if (!hasTurnEvents) {
            const askUserRequest = askUserRequestRef.current;
            const assistantMessage: ChatMessage = {
              id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              role: 'assistant',
              content: abortedContent,
              status: 'stopped',
              toolActivities: currentToolActivities.length > 0 ? [...currentToolActivities] : undefined,
              processActivities: currentProcessActivities.length > 0 ? [...currentProcessActivities] : undefined,
              askUserRequest: askUserRequest ?? undefined,
            };
            updateMessages((prev) => [...prev, assistantMessage]);
            askUserRequestRef.current = null;
          }
          setStreamingContent('');
          setIsStreaming(false);
          setToolActivities([]);
          setProcessActivities([]);
        },
        onError: (errorInfo, _partialContent = '') => {
          if (!isCurrentStream()) return;
          failedMessageRef.current = { message: trimmed, partialContent: _partialContent };
          // 如果有正在进行的轮次，先刷出已生成的内容
          if (currentTurnIndex >= 0) {
            flushTurnMessage();
          }
          setError(errorInfo);
          setIsStreaming(false);
          setStreamingContent('');
          setToolActivities([]);
          setProcessActivities([]);
        },
        onWatchdogPaused: (resume) => {
          if (isCurrentStream()) resumeWatchdogRef.current = resume;
        },
      }, permissionMode, projectId, sessionId, abortController.signal, ...(modelSelection ? [modelSelection] : []), requestOptions.planMode ?? planModeEnabled);
    } catch (err) {
      if (!isCurrentStream()) return;
      failedMessageRef.current = { message: trimmed, partialContent: '' };
      setError(toAgentErrorInfo(err));
      setIsStreaming(false);
      setStreamingContent('');
      console.error('Chat error:', err);
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        resumeWatchdogRef.current = null;
        setIsLoading(false);
        setTimeout(scrollToBottom, 50);
      }
    }
  }, [isLoading, initialContext, scrollToBottom, updateMessages, permissionMode, projectId, sessionId, modelSelection, planModeEnabled]);

  const handleSend = useCallback(
    () => sendMessage(inputValue.trim(), true),
    [inputValue, sendMessage],
  );

  const handleSendText = useCallback(
    (message: string) => sendMessage(message.trim(), true),
    [sendMessage],
  );

  const handleRetry = useCallback(async () => {
    const failedMessage = failedMessageRef.current;
    if (!failedMessage) return;
    const retryMessage = failedMessage.partialContent
      ? `${failedMessage.message}\n\n上次回答在生成中断。请从以下已生成内容继续，不要重复已有内容：\n${failedMessage.partialContent}`
      : failedMessage.message;
    await sendMessage(retryMessage, false);
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
    if (!req) return false;

    try {
      const accepted = await respondToPermission(req.requestId, action, remember);
      if (!accepted) {
        setPermissionResponseError('服务未接受本次权限响应，请重试。');
        return false;
      }
      setPermissionRequest(null);
      setPermissionResponseError(null);
      const resume = resumeWatchdogRef.current;
      resumeWatchdogRef.current = null;
      resume?.();
      return true;
    } catch (err) {
      console.error('[Permission] 响应失败:', err);
      setPermissionResponseError(err instanceof Error ? err.message : '权限响应失败，请重试。');
      return false;
    }
  }, [permissionRequest]);

  const handleAskUserAnswered = useCallback((requestId: string, answers: Record<string, string>) => {
    const markAnswered = (request: AskUserRequest): AskUserRequest => ({
      ...request,
      status: 'answered',
      answers,
    });

    if (askUserRequestRef.current?.requestId === requestId) {
      const answeredRequest = markAnswered(askUserRequestRef.current);
      askUserRequestRef.current = answeredRequest;
      setAskUserRequest(answeredRequest);
    }
    updateMessages((previous) => previous.map((message) => (
      message.askUserRequest?.requestId === requestId
        ? { ...message, askUserRequest: markAnswered(message.askUserRequest) }
        : message
    )));
    const resume = resumeWatchdogRef.current;
    resumeWatchdogRef.current = null;
    resume?.();
  }, [updateMessages]);

  const clearMessages = useCallback(() => {
    updateMessages(() => []);
    setStreamingContent('');
    setIsStreaming(false);
    setToolActivities([]);
    setTaskActivities([]);
    setProcessActivities([]);
    setError(null);
    setPermissionRequest(null);
    setPermissionResponseError(null);
    setAskUserRequest(null);
    setPlanStatus('idle');
    setPlanContent('');
    planContentRef.current = '';
    failedMessageRef.current = null;
  }, [updateMessages]);

  /** 批准计划并开始执行 */
  const handleApprovePlan = useCallback(() => {
    // React 状态更新并不会同步改变当前闭包；显式覆盖请求参数以确保执行轮不是 Plan Mode。
    setPlanModeEnabled(false);
    setPlanStatus('approved');
    void sendMessage('批准计划，开始执行', false, { planMode: false, preservePlan: true });
  }, [sendMessage, setPlanModeEnabled]);

  /** 修改计划，发送反馈文本让 Agent 重新规划 */
  const handleModifyPlan = useCallback((feedback: string) => {
    setPlanStatus('idle');
    setPlanContent('');
    planContentRef.current = '';
    const message = feedback.trim()
      ? `修改计划：${feedback}`
      : '请重新规划';
    void sendMessage(message, false);
  }, [sendMessage]);

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    isStreaming,
    streamingContent,
    toolActivities,
    taskActivities,
    processActivities,
    error,
    handleSend,
    handleSendText,
    handleRetry,
    handleStop,
    handleKeyDown,
    clearMessages,
    permissionMode,
    setPermissionMode,
    permissionRequest,
    handlePermissionResponse,
    permissionResponseError,
    askUserRequest,
    handleAskUserAnswered,
    planModeEnabled,
    setPlanModeEnabled,
    planStatus,
    planContent,
    handleApprovePlan,
    handleModifyPlan,
  };
}
