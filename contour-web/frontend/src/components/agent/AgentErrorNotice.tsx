import { AlertCircle, RefreshCw, Settings } from 'lucide-react';
import type { AgentErrorInfo } from '../../state/aiApi';
import { Button } from '../ui/button';

interface AgentErrorNoticeProps {
  error: AgentErrorInfo;
  onRetry: () => void;
  onOpenSettings: () => void;
}

export function AgentErrorNotice({ error, onRetry, onOpenSettings }: AgentErrorNoticeProps) {
  return (
    <div role="alert" className="mx-2 rounded-md bg-surface-sunken px-4 py-3 text-text-primary shadow-sm">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger/80" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{error.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{error.message}</p>
          {(error.canRetry || error.action === 'open_settings') && (
            <div className="mt-3 flex flex-wrap gap-2">
              {error.canRetry && (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw size={13} />
                  重试
                </Button>
              )}
              {error.action === 'open_settings' && (
                <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
                  <Settings size={13} />
                  打开设置
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
