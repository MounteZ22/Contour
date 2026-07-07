import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import type { ChatMessage, ToolActivity } from '../state/aiApi';

import { TOOL_LABELS } from '../constants/toolLabels';

function getToolPhrase(toolName: string, input?: Record<string, unknown>): { label: string; loadingLabel: string } {
  const label = TOOL_LABELS[toolName] || toolName;

  if (toolName === 'getFlowDetail' && input?.flowId) {
    return { label: `${label} ${input.flowId}`, loadingLabel: `正在${label} ${input.flowId}...` };
  }
  if (toolName === 'searchFlows' && input?.query) {
    return { label: `${label} "${input.query}"`, loadingLabel: `正在${label} "${input.query}"...` };
  }
  if (toolName === 'getDoc' && input?.docId) {
    return { label: `${label} ${input.docId}`, loadingLabel: `正在${label} ${input.docId}...` };
  }
  return { label, loadingLabel: `正在${label}...` };
}

function ToolBlock({ activity, animate = false, index = 0 }: { activity: ToolActivity; animate?: boolean; index?: number }) {
  const [expanded, setExpanded] = useState(false);
  const phrase = getToolPhrase(activity.toolName, activity.input);
  const isCompleted = activity.status === 'done';
  const displayLabel = isCompleted ? phrase.label : phrase.loadingLabel;
  const delay = animate && index < 10 ? `${index * 30}ms` : '0ms';

  return (
    <div
      className={animate ? 'animate-in fade-in slide-in-from-left-1 duration-150 fill-mode-both' : ''}
      style={animate ? { animationDelay: delay } : undefined}
    >
      <button
        className="flex items-center gap-1.5 py-1 text-left w-full group"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        {!isCompleted ? (
          <Loader2 size={14} className="animate-spin text-primary/50 flex-shrink-0" />
        ) : activity.result?.startsWith('{"error"') ? (
          <XCircle size={14} className="text-error/70 flex-shrink-0" />
        ) : (
          <CheckCircle2 size={14} className="text-primary/70 flex-shrink-0" />
        )}
        <Wrench size={12} className="text-on-surface-variant/60 flex-shrink-0" />
        <span className="text-[13px] text-on-surface-variant truncate">{displayLabel}</span>
        <ChevronRight
          size={12}
          className={`flex-shrink-0 text-on-surface-variant/40 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && activity.result && (
        <div className="ml-6 mt-1 mb-2 pl-3 border-l-2 border-outline-variant/30">
          <pre className="text-[11px] text-on-surface-variant font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
            {activity.result}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolActivityList({ activities, isStreaming = false }: { activities: ToolActivity[]; isStreaming?: boolean }) {
  // 合并同一工具的 running/done 事件，保留最新状态
  const merged = useMemo(() => {
    const map = new Map<string, ToolActivity>();
    for (const a of activities) {
      const key = `${a.toolName}-${JSON.stringify(a.input ?? {})}`;
      map.set(key, a);
    }
    return Array.from(map.values());
  }, [activities]);

  if (merged.length === 0) return null;

  return (
    <div className="space-y-0.5 mb-2">
      {merged.map((activity, i) => (
        <ToolBlock key={`${activity.toolName}-${i}`} activity={activity} animate={isStreaming} index={i} />
      ))}
    </div>
  );
}

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function ChatMessageItem({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const avatarClass = useMemo(() => {
    return isUser
      ? 'bg-primary text-on-primary'
      : 'bg-secondary-container text-secondary';
  }, [isUser]);

  const bubbleClass = useMemo(() => {
    return isUser
      ? 'bg-primary-container text-on-primary-container'
      : 'bg-surface-container-high text-on-surface';
  }, [isUser]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${avatarClass}`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="max-w-[85%] flex flex-col gap-1">
        {/* 工具活动指示器 */}
        {!isUser && message.toolActivities && message.toolActivities.length > 0 && (
          <div className="rounded-lg px-3 py-1.5 bg-surface-container-low border border-outline-variant/30">
            <ToolActivityList activities={message.toolActivities} isStreaming={isStreaming} />
          </div>
        )}
        {/* 消息气泡 */}
        <div
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${bubbleClass}`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
