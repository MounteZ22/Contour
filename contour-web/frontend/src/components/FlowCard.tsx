import { ArrowRight, GitBranch, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Flow } from '../types';
import { StatusBadge } from './StatusBadge';

export function FlowCard({ flow, projectId, onDelete }: { flow: Flow; projectId: string; onDelete?: () => void }) {
  return (
    <Link className="flow-card" to={`/project/${projectId}/flows/${flow.flowId}`}>
      <div className="flow-card-header">
        <div>
          <p className="eyebrow">{flow.flowId}</p>
          <h3>{flow.title}</h3>
        </div>
        <div className="flow-card-actions">
          <StatusBadge status={flow.status} />
          {onDelete && (
            <button
              className="delete-btn"
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
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <p className="flow-summary">{flow.summary}</p>

      <div className="flow-card-meta">
        <span>{flow.type.replace('_', ' ')}</span>
        <span>{flow.tags.join(' · ')}</span>
      </div>

      <div className="flow-card-footer">
        <span className="flow-link-line">
          <GitBranch size={16} />
          {flow.parentFlows.length === 0 ? 'Root' : `Depends on ${flow.parentFlows.join(', ')}`}
        </span>
        <span className="open-link">
          Open workspace
          <ArrowRight size={16} />
        </span>
      </div>
    </Link>
  );
}
