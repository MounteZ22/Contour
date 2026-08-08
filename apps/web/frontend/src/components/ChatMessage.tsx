import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Brain, ChevronRight, Copy, Loader2, Check, XCircle, Wrench, Square } from 'lucide-react';
import type { ChatMessage, ProcessActivity, ToolActivity } from '@contour/shared';
import { toolPhrase } from '../lib/toolPhrase';
import { AskUserCard } from './agent/AskUserCard';

function ToolActivityRow({ activity, animate = false, index = 0 }: { activity: ToolActivity; animate?: boolean; index?: number }) {
  const [expanded, setExpanded] = useState(false);
  const phrase = toolPhrase(activity.toolName, activity.input);
  const isCompleted = activity.status !== 'running';
  const isError = activity.status === 'error';
  const delay = animate && index < 10 ? `${index * 30}ms` : '0ms';

  return (
    <div
      className={animate ? 'animate-in slide-in-from-left-1 duration-150 fill-mode-both' : ''}
      style={animate ? { animationDelay: delay } : undefined}
    >
      <button
        type="button"
        className="flex items-center gap-2 py-0.5 text-left w-full group cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {!isCompleted ? (
          <Loader2 size={14} className="animate-spin text-text-secondary flex-shrink-0" />
        ) : isError ? (
          <XCircle size={14} className="text-danger/70 flex-shrink-0" />
        ) : (
          <Check size={14} className="text-accent-strong/70 flex-shrink-0" />
        )}
        <Wrench size={13} className="text-text-tertiary flex-shrink-0" />
        <span className="text-caption font-mono text-text-secondary truncate">{phrase}</span>
        <ChevronRight
          size={12}
          className={`flex-shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (activity.input || activity.result) && (
        <div className="ml-6 pl-3 border-l-2 border-border text-[11px] font-mono text-text-secondary">
          {activity.input && (
            <div className="py-1.5">
              <p className="font-sans text-[11px] text-text-tertiary">参数</p>
              <pre className="whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto py-0.5">
                {JSON.stringify(activity.input, null, 2)}
              </pre>
            </div>
          )}
          {activity.result && (
            <div className="py-1.5">
              <p className="font-sans text-[11px] text-text-tertiary">结果</p>
              <pre className="whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto py-0.5">
                {activity.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolActivityList({ activities, isStreaming = false }: { activities: ToolActivity[]; isStreaming?: boolean }) {
  const merged = useMemo(() => {
    const map = new Map<string, ToolActivity>();
    for (const a of activities) {
      const key = a.id ?? `${a.toolName}-${JSON.stringify(a.input ?? {})}`;
      map.set(key, a);
    }
    return Array.from(map.values());
  }, [activities]);

  if (merged.length === 0) return null;

  return (
    <div className="mb-2">
      {merged.map((activity, i) => (
        <ToolActivityRow key={activity.id ?? `${activity.toolName}-${i}`} activity={activity} animate={isStreaming} index={i} />
      ))}
    </div>
  );
}

function ProcessActivityList({ activities }: { activities: ProcessActivity[] }) {
  const [expanded, setExpanded] = useState(false);

  if (activities.length === 0) return null;

  return (
    <div className="mb-2 text-text-secondary">
      <button
        type="button"
        className="flex w-full items-center gap-2 py-0.5 text-left cursor-pointer"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <Brain size={14} className="text-text-tertiary" />
        <span className="text-caption">思考过程</span>
        <ChevronRight
          size={12}
          className={`text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="ml-6 mt-1 border-l-2 border-border pl-3 text-[11px]">
          <p className="mb-1.5 text-text-tertiary">仅展示可观察的执行状态，不展示模型原始推理。</p>
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center gap-1.5 py-0.5">
              {activity.status === 'active' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : activity.status === 'error' ? (
                <XCircle size={12} className="text-danger/70" />
              ) : (
                <Check size={12} className="text-accent-strong/70" />
              )}
              <span>{activity.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onAskUserAnswered?: (requestId: string, answers: Record<string, string>) => void;
}

export function ChatMessageItem({ message, isStreaming = false, onAskUserAnswered }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // 浏览器拒绝剪贴板权限时保持静默，避免打断阅读。
    }
  };

  return (
    <div
      className={`flex gap-2.5 animate-fade-slide-in ${isUser ? 'flex-row-reverse items-end' : ''}`}
    >
      {/* 头像 */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? 'bg-accent-subtle-bg text-accent-subtle-text'
            : 'bg-surface-sunken text-text-secondary'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* 消息体 */}
      <div className="max-w-[82%] flex flex-col gap-1.5">
        {!isUser && message.processActivities && message.processActivities.length > 0 && (
          <ProcessActivityList activities={message.processActivities} />
        )}
        {/* 工具活动指示器（仅 AI 消息） */}
        {!isUser && message.toolActivities && message.toolActivities.length > 0 && (
          <ToolActivityList activities={message.toolActivities} isStreaming={isStreaming} />
        )}

        {/* AskUser 交互问答（仅 AI 消息） */}
        {!isUser && message.askUserRequest && (
          <AskUserCard
            askUserRequest={message.askUserRequest}
            onAnswered={(answers) => onAskUserAnswered?.(message.askUserRequest!.requestId, answers)}
          />
        )}

        {/* 消息气泡 */}
        {(isUser || message.content) && (
          <div className="group relative">
            <div
              className={`rounded-[10px] px-4 py-2.5 pr-10 text-body leading-[1.65] ${
                isUser
                  ? 'bg-accent-subtle-bg text-text-primary'
                  : 'bg-surface text-text-primary'
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="[&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_strong]:font-semibold
                  [&_code]:font-mono [&_code]:text-[13px] [&_code]:bg-surface-sunken [&_code]:text-text-secondary
                  [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                  [&_ul]:pl-[18px] [&_ol]:pl-[18px] [&_li]:mb-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void handleCopy(); }}
              className="absolute right-2 top-2 rounded-[4px] p-1 text-text-secondary opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
              title={copied ? '已复制' : '复制消息'}
              aria-label={copied ? '已复制消息' : '复制消息'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
        {!isUser && message.status === 'stopped' && (
          <span className="inline-flex items-center gap-1 px-1 text-[11px] text-text-tertiary">
            <Square size={9} fill="currentColor" />
            已停止
          </span>
        )}
      </div>
    </div>
  );
}
