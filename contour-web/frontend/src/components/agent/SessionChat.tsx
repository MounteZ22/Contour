import { useEffect, useRef } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { ChatMessageItem } from '../ChatMessage';
import { ChatInputBar } from './ChatInputBar';
import { useChat } from '../../hooks/useChat';
import { useSmoothStream } from '../../hooks/useSmoothStream';
import { useAgentSessions, type AgentSession } from '../../hooks/useAgentSessions';
import { PermissionDialog } from './PermissionDialog';
import type { ChatMessage } from '../../state/aiApi';

export function SessionChat({ session }: { session: AgentSession }) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const { updateSession } = useAgentSessions();

  const {
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
    permissionMode,
    setPermissionMode,
    permissionRequest,
    handlePermissionResponse,
  } = useChat(session.contextItems, { sessionId: session.id, projectId: session.projectId });

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

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {/* 权限确认弹窗 */}
      {permissionRequest && (
        <PermissionDialog
          request={permissionRequest}
          onResponse={handlePermissionResponse}
        />
      )}
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-accent/20 bg-accent-subtle-bg text-accent-subtle-text text-xs font-mono"
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
              {messages.map((message: ChatMessage) => (
                <ChatMessageItem key={message.id} isStreaming={false} message={message} />
              ))}

              {smoothContent && (
                <ChatMessageItem
                  isStreaming={isStreaming}
                  message={{ id: 'streaming', role: 'assistant', content: smoothContent, toolActivities }}
                />
              )}

              {isStreaming && !smoothContent && toolActivities.length === 0 && (
                <div className="flex items-center gap-2 text-text-secondary px-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">AI 正在思考...</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg p-3 bg-danger-subtle-bg border border-danger/20 text-danger text-xs mx-2">
                  {error}
                </div>
              )}
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
        onKeyDown={handleKeyDown}
        onClear={clearMessages}
        hasMessages={messages.length > 0}
        permissionMode={permissionMode}
        onPermissionModeChange={setPermissionMode}
        contextItems={session.contextItems}
      />
    </div>
  );
}
