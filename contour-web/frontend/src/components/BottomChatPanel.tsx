import { useRef, useEffect } from 'react';
import { Bot, Loader2, Send, X, ChevronDown, MessageCircle } from 'lucide-react';
import type { ChatMessage } from '../state/aiApi';
import { ChatMessageItem } from './ChatMessage';
import { useSmoothStream } from '../hooks/useSmoothStream';
import { useChat } from '../hooks/useChat';
import { Input } from './ui/input';
import { Button } from './ui/button';

export interface AIContextItem {
  id: string;
  title: string;
  type: 'flow' | 'doc';
}

interface BottomChatPanelProps {
  initialContext?: AIContextItem[];
  onClearContext?: () => void;
}

export function BottomChatPanel({
  initialContext,
  onClearContext,
}: BottomChatPanelProps) {
  const hasContext = initialContext && initialContext.length > 0;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  } = useChat(initialContext || []);

  const { displayedContent: rawSmoothContent } = useSmoothStream({
    content: streamingContent,
    isStreaming,
  });

  const smoothContent = isStreaming || streamingContent ? rawSmoothContent : '';
  const hasMessages = messages.length > 0 || isStreaming || isLoading;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, toolActivities]);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col transition-all duration-300 ease-out ${
        hasMessages
          ? 'h-[60vh] max-h-[600px]'
          : 'h-auto'
      }`}
    >
      {/* 消息列表区域（仅在有时展开） */}
      {hasMessages && (
        <div className="flex-1 overflow-y-auto bg-card/95 backdrop-blur border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
            {/* 头部工具栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md inline-flex items-center justify-center bg-primary/10 text-primary">
                  <Bot size={14} />
                </div>
                <span className="text-xs font-mono font-medium text-primary">AI 助手</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={clearMessages}
                  type="button"
                >
                  清空对话
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => {
                    clearMessages();
                  }}
                  title="收起"
                  type="button"
                >
                  <ChevronDown size={16} />
                </Button>
              </div>
            </div>

            {/* 消息列表 */}
            {messages.map((msg: ChatMessage) => (
              <ChatMessageItem key={msg.id} isStreaming={false} message={msg} />
            ))}

            {/* 流式消息气泡 */}
            {smoothContent && (
              <ChatMessageItem
                isStreaming={isStreaming}
                message={{ id: 'streaming', role: 'assistant', content: smoothContent, toolActivities }}
              />
            )}

            {/* 流式中但尚无内容时显示思考指示器 */}
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

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* 底部输入栏（始终显示） */}
      <div className="bg-card border-t border-border shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {/* 上下文标签（有选中时显示） */}
          {hasContext && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground/60">上下文:</span>
              {initialContext!.map((item) => (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                    item.type === 'flow'
                      ? 'bg-primary/10 border-primary/20 text-primary'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  }`}
                  key={item.id}
                >
                  {item.type === 'flow' ? 'F' : 'D'}
                  {item.id}
                  <span className="truncate max-w-[100px]">{item.title}</span>
                </span>
              ))}
              <button
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer ml-1"
                onClick={onClearContext}
                type="button"
              >
                <X size={10} />
              </button>
            </div>
          )}

          {/* 输入框 */}
          <div className="flex items-center gap-2">
            {!hasMessages && (
              <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary/10 text-primary shrink-0">
                <MessageCircle size={14} />
              </div>
            )}
            <Input
              ref={inputRef}
              className="flex-1 font-mono"
              disabled={isLoading}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasContext ? '基于选中的上下文提问...' : '在此输入消息，与 AI 助手交流...'}
              type="text"
              value={inputValue}
            />
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

          {/* 底部提示 */}
          {!hasMessages && !hasContext && (
            <p className="text-[10px] text-muted-foreground/40 text-center mt-1.5 font-mono">
              选择 Flow 或文档可将其作为上下文附加到对话中
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export type { BottomChatPanelProps };
