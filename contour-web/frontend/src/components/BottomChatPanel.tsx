import { useRef, useEffect } from 'react';
import { Bot, Loader2, Send, X, ChevronDown, MessageCircle } from 'lucide-react';
import type { ChatMessage } from '../state/aiApi';
import { ChatMessageItem } from './ChatMessage';
import { useSmoothStream } from '../hooks/useSmoothStream';
import { useChat } from '../hooks/useChat';

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
        <div className="flex-1 overflow-y-auto bg-surface-container/95 backdrop-blur border-t border-outline-variant/50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
            {/* 头部工具栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md inline-flex items-center justify-center bg-secondary-container/20 text-secondary">
                  <Bot size={14} />
                </div>
                <span className="text-xs font-mono font-medium text-secondary">AI 助手</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-[11px] text-on-surface-variant hover:text-error transition-colors cursor-pointer px-2 py-1 rounded hover:bg-error/5"
                  onClick={clearMessages}
                  type="button"
                >
                  清空对话
                </button>
                <button
                  className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer p-1 rounded hover:bg-surface-container-high"
                  onClick={() => {
                    // 收起但不清空：通过清空消息来收起
                    clearMessages();
                  }}
                  title="收起"
                  type="button"
                >
                  <ChevronDown size={16} />
                </button>
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
              <div className="flex items-center gap-2 text-on-surface-variant px-2">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">AI 正在思考...</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg p-3 bg-error-container/30 border border-error/20 text-error text-xs mx-2">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* 底部输入栏（始终显示） */}
      <div className="bg-surface-container border-t border-outline-variant/60 shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {/* 上下文标签（有选中时显示） */}
          {hasContext && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] font-mono text-on-surface-variant/60">上下文:</span>
              {initialContext!.map((item) => (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                    item.type === 'flow'
                      ? 'bg-primary-container/15 border-primary/20 text-primary'
                      : 'bg-tertiary-container/15 border-tertiary/20 text-tertiary'
                  }`}
                  key={item.id}
                >
                  {item.type === 'flow' ? 'F' : 'D'}
                  {item.id}
                  <span className="truncate max-w-[100px]">{item.title}</span>
                </span>
              ))}
              <button
                className="text-[10px] text-on-surface-variant hover:text-error transition-colors cursor-pointer ml-1"
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
              <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-secondary-container/20 text-secondary shrink-0">
                <MessageCircle size={14} />
              </div>
            )}
            <input
              ref={inputRef}
              className="flex-1 px-3 py-2.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono disabled:opacity-50 transition-colors"
              disabled={isLoading}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasContext ? '基于选中的上下文提问...' : '在此输入消息，与 AI 助手交流...'}
              type="text"
              value={inputValue}
            />
            <button
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isLoading || !inputValue.trim()
                  ? 'bg-primary/40 text-on-primary cursor-not-allowed'
                  : 'bg-primary text-on-primary hover:bg-primary/90'
              }`}
              disabled={isLoading || !inputValue.trim()}
              onClick={handleSend}
              type="button"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>

          {/* 底部提示 */}
          {!hasMessages && !hasContext && (
            <p className="text-[10px] text-on-surface-variant/40 text-center mt-1.5 font-mono">
              选择 Flow 或文档可将其作为上下文附加到对话中
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export type { BottomChatPanelProps };
