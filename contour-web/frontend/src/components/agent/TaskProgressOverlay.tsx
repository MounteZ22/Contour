import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleAlert, CircleDot, ListTodo, Loader2 } from 'lucide-react';
import type { ToolActivity } from '../../state/aiApi';
import {
  aggregateTaskProgress,
  isTaskFailure,
  isTerminalTaskStatus,
  type TaskProgressItem,
} from './taskProgress';

const DISMISS_DELAY_MS = 4_000;

interface DisplayState {
  items: TaskProgressItem[];
  outcome: 'active' | 'finished' | 'failed';
}

function TaskStatusIcon({ status }: { status: TaskProgressItem['status'] }) {
  if (status === 'in_progress') return <Loader2 size={13} className="animate-spin text-accent-strong" />;
  if (status === 'completed') return <Check size={13} className="text-success" />;
  if (isTaskFailure(status)) return <CircleAlert size={13} className="text-danger" />;
  return <CircleDot size={13} className="text-text-tertiary" />;
}

function taskSignature(activities: ToolActivity[]): string {
  return activities.map((activity) => [
    activity.id ?? '',
    activity.toolName,
    activity.status,
    JSON.stringify(activity.input ?? {}),
    activity.result ?? '',
  ].join('|')).join('||');
}

/** 当前轮任务的轻量浮层，不读写持久化状态。 */
export function TaskProgressOverlay({
  activities,
  isLoading,
  hasError,
}: {
  activities: ToolActivity[];
  isLoading: boolean;
  hasError: boolean;
}) {
  const items = useMemo(() => aggregateTaskProgress(activities), [activities]);
  const signature = useMemo(() => taskSignature(activities), [activities]);
  const [display, setDisplay] = useState<DisplayState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const settledSignatureRef = useRef<string | null>(null);
  const hasUnfinishedTask = items.some((item) => !isTerminalTaskStatus(item.status));

  useEffect(() => {
    if (items.length === 0) {
      settledSignatureRef.current = null;
      setDisplay(null);
      return;
    }

    if (isLoading && hasUnfinishedTask) {
      settledSignatureRef.current = null;
      setDisplay({ items, outcome: 'active' });
      return;
    }

    if (settledSignatureRef.current === signature) return;
    settledSignatureRef.current = signature;
    setDisplay({ items, outcome: hasError ? 'failed' : 'finished' });
    const dismissTimer = window.setTimeout(() => setDisplay(null), DISMISS_DELAY_MS);
    return () => window.clearTimeout(dismissTimer);
  }, [hasError, hasUnfinishedTask, isLoading, items, signature]);

  if (!display) return null;

  const completedCount = display.items.filter((item) => item.status === 'completed').length;
  const failureCount = display.items.filter((item) => isTaskFailure(item.status)).length;
  const primary = display.items.find((item) => item.status === 'in_progress') ?? display.items.at(-1);
  const summary = display.outcome === 'active'
    ? primary?.activeForm ?? primary?.subject ?? '正在处理任务'
    : display.outcome === 'failed' || failureCount > 0
      ? '本轮任务未完全完成'
      : '本轮任务已结束';
  const visibleItems = expanded ? display.items : primary ? [primary] : [];

  return (
    <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center pb-3 pt-6">
      <section className="pointer-events-auto w-full max-w-[520px] rounded-lg bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm" aria-label="任务进度">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {display.outcome === 'active' ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-accent-strong" />
          ) : failureCount > 0 || display.outcome === 'failed' ? (
            <CircleAlert size={14} className="shrink-0 text-danger" />
          ) : (
            <ListTodo size={14} className="shrink-0 text-success" />
          )}
          <span className="min-w-0 flex-1 truncate text-caption text-text-primary">{summary}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">{completedCount}/{display.items.length}</span>
          {expanded ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronUp size={14} className="text-text-tertiary" />}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex min-w-0 items-center gap-2 text-caption">
                <TaskStatusIcon status={item.status} />
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {item.status === 'in_progress' && item.activeForm ? item.activeForm : item.subject}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
