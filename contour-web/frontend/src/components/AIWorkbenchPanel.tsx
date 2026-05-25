import { useCallback, useRef, useState } from 'react';
import { Bot, FileSearch, Highlighter, Lightbulb, Loader2, Send, ShieldAlert, X } from 'lucide-react';
import type { Claim } from '../types';
import { sendChatMessage } from '../state/aiApi';
import type { ChatMessage } from '../state/aiApi';
import { ChatMessageItem } from './ChatMessage';

export interface AIContextItem {
  id: string;
  title: string;
  type: 'flow' | 'doc';
}

interface AIWorkbenchPanelProps {
  claim?: Claim;
  initialContext?: AIContextItem[];
  onClearContext?: () => void;
}

const suggestedActions = [
  {
    label: '生成 AI 上下文摘要',
    detail: '将当前文档压缩为可复用的摘要层。',
    icon: FileSearch,
  },
  {
    label: '检查过度推断风险',
    detail: '审阅当前措辞是否超越了证据支撑。',
    icon: ShieldAlert,
  },
  {
    label: '提取候选论断',
    detail: '将具体观察转化为可复用的判断草稿。',
    icon: Highlighter,
  },
  {
    label: 'Suggest next Flow',
    detail: '建议能降低不确定性的下一步研究动作。',
    icon: Lightbulb,
  },
];

export function AIWorkbenchPanel({
  claim,
  initialContext,
  onClearContext,
}: AIWorkbenchPanelProps) {
  const hasContext = initialContext && initialContext.length > 0;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const assistantMessage = await sendChatMessage(
        trimmed,
        initialContext || [],
      );
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送失败，请重试';
      setError(msg);
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
      // 延迟滚动确保内容已渲染
      setTimeout(scrollToBottom, 50);
    }
  }, [inputValue, isLoading, initialContext, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <aside className="border border-outline-variant bg-surface-container rounded-xl p-5 sticky top-[122px] max-xl:static flex flex-col gap-4 max-h-[calc(100vh-140px)]">
      {/* 标题区 */}
      <div className="flex items-start justify-between gap-3">
        <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-secondary-container/20 text-secondary">
          <Bot size={18} />
        </div>
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-secondary">AI 工作台</p>
          <h3 className="text-base font-semibold text-on-surface font-headline">{hasContext ? '与 AI 讨论' : '未来协作面板'}</h3>
        </div>
      </div>

      {/* 上下文摘要条 */}
      {hasContext && (
        <div className="rounded-lg p-3 bg-primary/5 border border-primary/15">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[10px] font-mono font-medium uppercase tracking-wider text-primary">当前讨论范围</p>
            <button
              className="text-on-surface-variant hover:text-error transition-colors cursor-pointer"
              onClick={onClearContext}
              title="清除上下文"
              type="button"
            >
              <X size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {initialContext!.map((item) => (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                  item.type === 'flow'
                    ? 'bg-primary-container/15 border-primary/20 text-primary'
                    : 'bg-tertiary-container/15 border-tertiary/20 text-tertiary'
                }`}
                key={item.id}
              >
                {item.type === 'flow' ? 'F' : 'D'}
                {item.id}
                <span className="text-on-surface-variant truncate max-w-[120px]">{item.title}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      {hasContext ? (
        <>
          {/* 消息列表 */}
          <div className="flex-1 min-h-[200px] max-h-[50vh] overflow-y-auto flex flex-col gap-4 rounded-lg border border-outline-variant/40 bg-surface-container-low/50 p-3">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Bot size={28} className="text-outline-variant" />
                <p className="text-sm text-on-surface-variant text-center px-4">
                  开始与 AI 讨论选中的研究内容
                </p>
                <p className="text-xs text-on-surface-variant/60 text-center px-6">
                  您可以询问关于这些 Flow 或文档的问题
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessageItem key={msg.id} message={msg} />
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">AI 正在思考...</span>
                  </div>
                )}
                {error && (
                  <div className="rounded-lg p-3 bg-error-container/30 border border-error/20 text-error text-xs">
                    {error}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入框 */}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono disabled:opacity-50"
              disabled={isLoading}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在此输入消息..."
              type="text"
              value={inputValue}
            />
            <button
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
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
        </>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">
            当前 shell 为只读模式。该面板已按科研 AI IDE 的预期操作进行布局设计。
          </p>

          <div className="grid gap-3">
            {suggestedActions.map((action) => {
              const Icon = action.icon;
              return (
                <div className="grid grid-cols-[36px_1fr] gap-3 p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/30" key={action.label}>
                  <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
                    <Icon size={16} />
                  </div>
                  <div>
                    <strong className="block text-sm text-on-surface">{action.label}</strong>
                    <p className="text-sm text-on-surface-variant mt-1">{action.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Claim 关联区（向后兼容） */}
      {claim && !hasContext ? (
        <div className="rounded-lg p-4 bg-secondary/5 border border-secondary/15">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">Linked Claim</p>
          <strong className="block text-sm text-on-surface">{claim.claimId}</strong>
          <p className="text-sm text-on-surface-variant mt-1">{claim.content}</p>
          <p className="text-sm text-on-surface-variant mt-2">Recommended wording: {claim.recommendedWording}</p>
        </div>
      ) : null}
    </aside>
  );
}

export type { AIWorkbenchPanelProps };
