import { useEffect, useRef } from 'react';
import { Bot, Eye, Loader2, Send, ShieldCheck, X, Zap } from 'lucide-react';
import { ChatMessageItem } from '../ChatMessage';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
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
  } = useChat(session.contextItems, { sessionId: session.id });

  const { displayedContent: rawSmoothContent } = useSmoothStream({
    content: streamingContent,
    isStreaming,
  });

  const smoothContent = isStreaming || streamingContent ? rawSmoothContent : '';
  const hasContext = session.contextItems.length > 0;

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
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && !isStreaming ? (
            <div className="min-h-[45vh] rounded-2xl border border-dashed border-border bg-card/70 p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Bot size={24} />
              </div>
              <h2 className="mt-4 text-xl font-semibold font-headline">开始一次 Agent 会话</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground leading-relaxed">
                这里承接原先散落在 Dashboard、Flow 和文档页里的 AI 讨论。选中的 Flow 与文档会作为上下文发送给 Agent。
              </p>
              {hasContext && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {session.contextItems.map((item) => (
                    <span
                      key={`${item.type}-${item.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-mono"
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
                <div className="flex items-center gap-2 text-muted-foreground px-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">AI 正在思考...</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs mx-2">
                  {error}
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur px-6 py-3">
        <div className="max-w-3xl mx-auto">
          {hasContext && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground/60">上下文:</span>
              {session.contextItems.map((item) => (
                <span
                  key={`${item.type}-${item.id}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                    item.type === 'flow'
                      ? 'bg-primary/10 border-primary/20 text-primary'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {item.type === 'flow' ? 'F' : 'D'}
                  {item.id}
                  <span className="truncate max-w-[120px]">{item.title}</span>
                </span>
              ))}
            </div>
          )}

          {/* 权限模式选择 */}
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-mono text-muted-foreground/60">权限:</span>
            {([
              { value: 'readonly' as const, label: '只读', icon: Eye, title: '仅允许读取文件' },
              { value: 'review' as const, label: '审查', icon: ShieldCheck, title: '写操作需弹窗确认' },
              { value: 'yolo' as const, label: '自动', icon: Zap, title: '允许所有操作' },
            ]).map(({ value, label, icon: Icon, title }) => (
              <Button
                key={value}
                variant={permissionMode === value ? 'default' : 'ghost'}
                size="sm"
                className="h-7 gap-1 text-xs px-2.5"
                onClick={() => setPermissionMode(value)}
                title={title}
                type="button"
              >
                <Icon size={12} />
                {label}
                {value === 'review' && permissionMode !== value && (
                  <span className="text-amber-500 leading-none">●</span>
                )}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              className="flex-1 font-mono"
              disabled={isLoading}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasContext ? '基于选中的上下文提问...' : '在此输入消息，与 Agent 交流...'}
              value={inputValue}
            />
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={clearMessages}
                title="清空对话"
                type="button"
              >
                <X size={14} />
              </Button>
            )}
            <Button
              size="icon"
              className="shrink-0"
              disabled={isLoading || !inputValue.trim()}
              onClick={handleSend}
              type="button"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
