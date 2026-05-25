import { CheckCircle2, Loader2, Wrench } from 'lucide-react';
import type { ToolActivity } from '../state/aiApi';

const TOOL_LABELS: Record<string, string> = {
  getFlowDetail: '读取研究脉络',
  searchFlows: '搜索研究脉络',
  getDoc: '读取文档',
};

function formatInput(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  if (toolName === 'getFlowDetail' && input.flowId) return String(input.flowId);
  if (toolName === 'searchFlows' && input.query) return `"${input.query}"`;
  if (toolName === 'getDoc' && input.docId) return String(input.docId);
  return JSON.stringify(input);
}

export function ToolActivityItem({ activity }: { activity: ToolActivity }) {
  const label = TOOL_LABELS[activity.toolName] || activity.toolName;
  const inputStr = formatInput(activity.toolName, activity.input);
  const isRunning = activity.status === 'running';

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs">
      {isRunning ? (
        <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />
      ) : (
        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
      )}
      <Wrench size={12} className="text-on-surface-variant flex-shrink-0" />
      <span className="text-on-surface-variant">
        {isRunning ? '正在' : '已'}{label}
        {inputStr && <span className="font-mono text-primary ml-1">{inputStr}</span>}
      </span>
    </div>
  );
}
