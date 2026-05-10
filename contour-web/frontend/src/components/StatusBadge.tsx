import type { FlowStatus } from '../types';

const statusLabels: Record<FlowStatus, string> = {
  in_progress: '进行',
  completed: '完成',
  archived: '归档',
  abandoned: '放弃',
};

const statusStyles: Record<FlowStatus, { wrapper: string; dot: string }> = {
  completed: {
    wrapper: 'text-tertiary-container bg-tertiary-container/10 border-tertiary-container/20',
    dot: 'bg-tertiary-container',
  },
  in_progress: {
    wrapper: 'text-primary bg-primary/10 border-primary/20',
    dot: 'bg-primary',
  },
  archived: {
    wrapper: 'text-secondary bg-secondary/10 border-secondary/20',
    dot: 'bg-secondary',
  },
  abandoned: {
    wrapper: 'text-error bg-error/10 border-error/20',
    dot: 'bg-error',
  },
};

export function StatusBadge({ status }: { status: FlowStatus }) {
  const style = statusStyles[status];
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-semibold border ${style.wrapper}`}
    >
      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
      {statusLabels[status]}
    </span>
  );
}
