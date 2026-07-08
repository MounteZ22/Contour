import { MessageCircle, X } from 'lucide-react';

interface ContextActionBarProps {
  selectedFlowCount: number;
  selectedDocCount: number;
  selectedClaimCount: number;
  onClear: () => void;
  onDiscuss?: () => void;
}

export function ContextActionBar({
  selectedFlowCount,
  selectedDocCount,
  selectedClaimCount,
  onClear,
  onDiscuss,
}: ContextActionBarProps) {
  const hasSelection = selectedFlowCount > 0 || selectedDocCount > 0 || selectedClaimCount > 0;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-4 px-5 py-3 rounded-xl border border-border bg-surface-sunken/95 backdrop-blur shadow-lg">
        <span className="text-sm text-text-primary whitespace-nowrap">
          已选择{' '}
          <strong className="text-accent-strong">{selectedFlowCount}</strong>{' '}
          个 Flow ·{' '}
          <strong className="text-accent-strong">{selectedDocCount}</strong>{' '}
          个文档 ·{' '}
          <strong className="text-accent-strong">{selectedClaimCount}</strong>{' '}
          个 Claims
        </span>
        <div className="w-px h-5 bg-border" />
        <button
          className="text-xs text-text-secondary hover:text-danger transition-colors"
          onClick={onClear}
          type="button"
        >
          全部清除
        </button>
        {onDiscuss && (
          <button
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-accent-strong text-accent-on text-caption font-medium disabled:opacity-40 cursor-pointer transition-opacity"
            disabled={!hasSelection}
            onClick={onDiscuss}
            title={hasSelection ? '' : '至少选择一个 Flow 或文档'}
            type="button"
          >
            <MessageCircle size={14} />
            与 AI 讨论
          </button>
        )}
      </div>
    </div>
  );
}
