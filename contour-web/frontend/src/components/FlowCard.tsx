import { ArrowRight, GitBranch, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Flow } from '../types';
import { StatusBadge } from './StatusBadge';

export function FlowCard({ flow, projectId, onDelete }: { flow: Flow; projectId: string; onDelete?: () => void }) {
  return (
    <Link
      className="block border border-outline-variant bg-surface-container rounded-lg p-4 transition-all hover:border-primary/25"
      to={`/project/${projectId}/flows/${flow.flowId}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">{flow.flowId}</p>
          <h3 className="text-base font-semibold text-on-surface font-headline">{flow.title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={flow.status} />
          {onDelete && (
            <button
              className="w-6 h-6 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors hover:bg-error/15 hover:border-error/25 hover:text-error"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm(`确定要删除 Flow "${flow.title}" 吗？此操作不可撤销。`)) {
                  onDelete();
                }
              }}
              title="删除 Flow"
              type="button"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-on-surface-variant line-clamp-2 mb-3 leading-relaxed">{flow.summary}</p>

      <div className="flex flex-wrap gap-2 text-xs text-on-surface-variant font-mono mb-3">
        <span>{flow.type.replace('_', ' ')}</span>
        <span>{flow.tags.join(' · ')}</span>
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-outline-variant text-xs">
        <span className="inline-flex items-center gap-1.5 text-on-surface-variant font-mono">
          <GitBranch size={14} />
          {flow.parentFlows.length === 0 ? 'Root' : `Depends on ${flow.parentFlows.join(', ')}`}
        </span>
        <span className="inline-flex items-center gap-1.5 text-primary font-mono">
          Open workspace
          <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}
