import type { FlowStatus } from '../types';

const statusLabels: Record<FlowStatus, string> = {
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  archived: '已归档',
  abandoned: '已放弃',
};

export function StatusBadge({ status }: { status: FlowStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}
