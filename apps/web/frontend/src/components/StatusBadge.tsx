import type { FlowStatus } from '@contour/shared';
import { Badge } from './ui/badge';

const statusLabels: Record<FlowStatus, string> = {
  in_progress: '进行',
  completed: '完成',
  archived: '归档',
  abandoned: '放弃',
};

const statusStyles: Record<FlowStatus, string> = {
  completed: 'bg-success/10 text-success border-success/20',
  in_progress: 'bg-accent-subtle-bg text-accent-subtle-text border-accent-strong/20',
  archived: 'bg-surface-sunken text-text-secondary border-border',
  abandoned: 'bg-danger-subtle-bg text-danger border-danger/20',
};

export function StatusBadge({ status }: { status: FlowStatus }) {
  return (
    <Badge className={`${statusStyles[status]} gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'completed' ? 'bg-success' :
        status === 'in_progress' ? 'bg-accent-strong' :
        status === 'archived' ? 'bg-text-tertiary' :
        'bg-danger'
      }`} />
      {statusLabels[status]}
    </Badge>
  );
}
