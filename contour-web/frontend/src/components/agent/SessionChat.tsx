import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Loader2 } from 'lucide-react';
import { ChatMessageItem } from '../ChatMessage';
import { ChatInputBar } from './ChatInputBar';
import { PlanCard } from './PlanCard';
import { useChat } from '../../hooks/useChat';
import { useSmoothStream } from '../../hooks/useSmoothStream';
import { useAgentSessions, type AgentSession } from '../../hooks/useAgentSessions';
import { PermissionBanner } from './PermissionBanner';
import type { ChatMessage, PermissionRequest } from '../../state/aiApi';
import { AgentErrorNotice } from './AgentErrorNotice';
import { useSessionModelSelection } from '../../state/agentModelSelection';
import { TaskProgressOverlay } from './TaskProgressOverlay';
import { TurnGroup } from './TurnGroup';

type ChatDisplayItem =
  | { type: 'message'; message: ChatMessage }
  | { type: 'turnGroup'; turnMessages: ChatMessage[]; isLatest: boolean };

/** 将连续且属于同一 turnIndex 的助手消息合并为一个展示组。 */
export function groupMessagesByTurn(messages: ChatMessage[]): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const message = messages[i];
    if (message.turnIndex == null) {
      items.push({ type: 'message', message });
      i++;
      continue;
    }

    const group: ChatMessage[] = [];
    while (i < messages.length && messages[i].turnIndex === message.turnIndex) {
      group.push(messages[i]);
      i++;
    }
    items.push({ type: 'turnGroup', turnMessages: group, isLatest: i === messages.length });
  }
  return items;
}

/** 仅在后端成功接受拒绝决定后，才把权限横幅切换为已拒绝状态。 */
export async function confirmPermissionDenial(
  request: PermissionRequest | null,
  respond: (action: 'deny', remember: boolean) => Promise<boolean>,
): Promise<PermissionRequest | null> {
  if (!request) return null;
  return await respond('deny', false) ? request : null;
}

export function SessionChat({ session, initialMessage }: { session: AgentSession; initialMessage?: string }) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const initialMessageRef = useRef(initialMessage?.trim());
  const { updateSession } = useAgentSessions();
  const modelSelector = useSessionModelSelection(session.id);

  const {
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
  } = useChat(session.contextItems, {
    sessionId: session.id,
    projectId: session.projectId,
    modelSelection: modelSelector.selection,
  });

  // 已拒绝的权限请求（横幅保留在消息流中显示"已拒绝"状态）
  const [deniedRequest, setDeniedRequest] = useState<PermissionRequest | null>(null);

  // 新的 permissionRequest 到来时，清除之前已拒绝的记录
  useEffect(() => {
    if (permissionRequest) {
      setDeniedRequest(null);
    }
  }, [permissionRequest]);

  // 处理权限响应：允许 / 拒绝 / 允许本次会话所有同类操作
  const handleAllow = useCallback(() => {
    void handlePermissionResponse('allow', false);
  }, [handlePermissionResponse]);

  const handleDeny = useCallback(async () => {
    const confirmedRequest = await confirmPermissionDenial(permissionRequest, handlePermissionResponse);
    if (confirmedRequest) setDeniedRequest(confirmedRequest);
  }, [handlePermissionResponse, permissionRequest]);

  const handleAllowSession = useCallback(() => {
    setPermissionMode('yolo');
    void handlePermissionResponse('allow', true);
  }, [handlePermissionResponse, setPermissionMode]);

  const { displayedContent: rawSmoothContent } = useSmoothStream({
    content: streamingContent,
    isStreaming,
  });

  const smoothContent = isStreaming || streamingContent ? rawSmoothContent : '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, toolActivities]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest || latest.id === lastMessageIdRef.current) return;
    lastMessageIdRef.current = latest.id;
    updateSession(session.id, {
      lastMessage: latest.content.slice(0, 120),
    });
  }, [messages, session.id, updateSession]);

  useEffect(() => {
    const message = initialMessageRef.current;
    if (!message) return;
    initialMessageRef.current = undefined;
    void handleSendText(message);
  }, [handleSendText]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {/* 权限确认弹窗已移除 — 改用内联横幅，嵌入下方消息流中 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="max-w-[720px] mx-auto flex flex-col gap-5">
          {messages.length === 0 && !isStreaming ? (
            <div className="min-h-[45vh] rounded-2xl border border-dashed border-border bg-surface/70 p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-accent-subtle-bg text-accent-strong flex items-center justify-center">
                <Bot size={24} />
              </div>
              <h2 className="mt-4 text-xl font-semibold font-headline">开始一次 Agent 会话</h2>
              <p className="mt-2 max-w-lg text-sm text-text-secondary leading-relaxed">
                这里承接原先散落在 Dashboard、Flow 和文档页里的 AI 讨论。选中的 Flow 与文档会作为上下文发送给 Agent。
              </p>
              {session.contextItems.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {session.contextItems.map((item) => (
                    <span
                      key={`${item.type}-${item.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-accent-strong/20 bg-accent-subtle-bg text-accent-subtle-text text-xs font-mono"
                    >
                      {item.type === 'flow' ? 'F' : 'D'}
                      {item.id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {(() => {
                // 将消息按 turn 分组：连续带 turnIndex 的消息归入一个 TurnGroup
                const items = groupMessagesByTurn(messages);

                // 渲染分组后的项目列表
                return items.map((item, idx) => {
                  if (item.type === 'message') {
                    return (
                      <ChatMessageItem
                        key={item.message.id}
                        isStreaming={false}
                        message={item.message}
                        onAskUserAnswered={handleAskUserAnswered}
                      />
                    );
                  }
                  return (
                    <TurnGroup
                      key={`turn-${item.turnMessages[0]?.turnIndex ?? idx}`}
                      turnMessages={item.turnMessages}
                      defaultExpanded={item.isLatest}
                      onAskUserAnswered={handleAskUserAnswered}
                    />
                  );
                });
              })()}

              {/* Plan Mode：显示执行计划卡片 */}
              {(planStatus === 'active' || planStatus === 'complete' || planStatus === 'approved') && planContent && (
                <PlanCard
                  content={planContent}
                  status={planStatus}
                  onApprove={handleApprovePlan}
                  onModify={handleModifyPlan}
                />
              )}

              {(smoothContent || toolActivities.length > 0 || processActivities.length > 0 || askUserRequest) && (
                <ChatMessageItem
                  isStreaming={isStreaming}
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: smoothContent,
                    toolActivities,
                    processActivities,
                    askUserRequest: askUserRequest ?? undefined,
                  }}
                  onAskUserAnswered={handleAskUserAnswered}
                />
              )}

              {isStreaming && !smoothContent && toolActivities.length === 0 && processActivities.length === 0 && (
                <div className="flex items-center gap-2 text-text-secondary px-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">AI 正在思考...</span>
                </div>
              )}

              {/* 内联权限确认横幅：待确认 */}
              {permissionRequest && !deniedRequest && (
                <PermissionBanner
                  request={permissionRequest}
                  onAllow={handleAllow}
                  onDeny={handleDeny}
                  onAllowSession={handleAllowSession}
                  error={permissionResponseError}
                />
              )}

              {/* 内联权限确认横幅：已拒绝 */}
              {deniedRequest && (
                <PermissionBanner
                  request={deniedRequest}
                  denied
                  onAllow={handleAllow}
                  onDeny={handleDeny}
                  onAllowSession={handleAllowSession}
                />
              )}

              {error && (
                <AgentErrorNotice
                  error={error}
                  onRetry={() => { void handleRetry(); }}
                  onOpenSettings={() => navigate('/settings')}
                />
              )}
              <TaskProgressOverlay
                activities={taskActivities}
                isLoading={isLoading}
                hasError={Boolean(error)}
              />
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInputBar
        inputValue={inputValue}
        onInputChange={setInputValue}
        isLoading={isLoading}
        onSend={handleSend}
        onStop={handleStop}
        onKeyDown={handleKeyDown}
        onClear={clearMessages}
        hasMessages={messages.length > 0}
        permissionMode={permissionMode}
        onPermissionModeChange={setPermissionMode}
        contextItems={session.contextItems}
        modelOptions={modelSelector.options}
        selectedModel={modelSelector.selectedOption}
        modelStatus={modelSelector.status}
        onModelChange={modelSelector.selectModel}
        projectId={session.projectId}
        planModeEnabled={planModeEnabled}
        onPlanModeChange={setPlanModeEnabled}
      />
    </div>
  );
}
