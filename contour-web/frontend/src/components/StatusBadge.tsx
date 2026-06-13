import type { FlowStatus } from '../types';
import { Badge } from './ui/badge';

const statusLabels: Record<FlowStatus, string> = {
  in_progress: '进行',
  completed: '完成',
  archived: '归档',
  abandoned: '放弃',
};

const statusStyles: Record<FlowStatus, string> = {
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  in_progress: 'bg-primary/10 text-primary border-primary/20',
  archived: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20',
  abandoned: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function StatusBadge({ status }: { status: FlowStatus }) {
  return (
    <Badge className={`${statusStyles[status]} gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'completed' ? 'bg-emerald-500' :
        status === 'in_progress' ? 'bg-primary' :
        status === 'archived' ? 'bg-violet-500' :
        'bg-destructive'
      }`} />
      {statusLabels[status]}
    </Badge>
  );
}
