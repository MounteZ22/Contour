import { ArrowRight, GitBranch, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Flow } from '@contour/shared';
import { StatusBadge } from './StatusBadge';
import { Card } from './ui/card';
import { Button } from './ui/button';

export function FlowCard({ flow, projectId, onDelete }: { flow: Flow; projectId: string; onDelete?: () => void }) {
  return (
    <Card className="transition-all hover:border-primary/25 hover:shadow-md">
      <Link
        className="block p-4"
        to={`/project/${projectId}/flows/${flow.flowId}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">{flow.flowId}</p>
            <h3 className="text-base font-semibold text-foreground font-headline">{flow.title}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={flow.status} />
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{flow.summary}</p>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono mb-3">
          <span>{flow.type.replace('_', ' ')}</span>
          <span>{flow.tags.join(' · ')}</span>
        </div>

        <div className="flex items-center justify-between pt-2.5 border-t border-border text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground font-mono">
            <GitBranch size={14} />
            {flow.parentFlows.length === 0 ? 'Root' : `Depends on ${flow.parentFlows.join(', ')}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-primary font-mono">
            Open workspace
            <ArrowRight size={14} />
          </span>
        </div>
      </Link>
    </Card>
  );
}
