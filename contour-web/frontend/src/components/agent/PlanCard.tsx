import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ClipboardList, Check, FilePen, Send, X } from 'lucide-react';
import { useState } from 'react';

interface PlanCardProps {
  /** Markdown 格式的计划内容 */
  content: string;
  /** 计划生成、待审批或已批准后的展示状态。 */
  status: 'active' | 'complete' | 'approved';
  /** 批准并执行 */
  onApprove: () => void;
  /** 修改计划（传入反馈文本） */
  onModify: (feedback: string) => void;
}

/**
 * PlanCard — Plan Mode 下显示 Agent 产出的执行计划。
 *
 * 在对话流中渲染 Markdown 格式的计划内容，底部提供"批准并执行"和"修改计划"
 * 两个操作按钮。仅在 Plan Mode 开启时显示。
 */
export function PlanCard({ content, status, onApprove, onModify }: PlanCardProps) {
  const [showModifyInput, setShowModifyInput] = useState(false);
  const [modifyFeedback, setModifyFeedback] = useState('');

  if (!content) return null;

  const handleModifySubmit = () => {
    onModify(modifyFeedback);
    setShowModifyInput(false);
    setModifyFeedback('');
  };

  const handleModifyCancel = () => {
    setShowModifyInput(false);
    setModifyFeedback('');
  };

  return (
    <div className="rounded-[10px] border-2 border-accent-strong/20 bg-accent-subtle-bg/50 overflow-hidden my-3 animate-fade-slide-in">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-accent-strong/10 bg-accent-subtle-bg/80">
        <ClipboardList size={16} className="text-accent-strong" />
        <span className="text-sm font-medium text-accent-strong">📋 执行计划</span>
        {status === 'active' && (
          <span className="text-xs text-text-tertiary ml-auto">正在生成...</span>
        )}
        {status === 'approved' && (
          <span className="text-xs text-success ml-auto">已批准，正在执行</span>
        )}
      </div>

      {/* 计划内容 */}
      <div className="px-4 py-3 text-body leading-[1.65] text-text-primary
        [&_p]:mb-2.5 [&_p:last-child]:mb-0
        [&_strong]:font-semibold
        [&_code]:font-mono [&_code]:text-[13px] [&_code]:bg-surface-sunken [&_code]:text-text-secondary
        [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
        [&_ul]:pl-[18px] [&_ol]:pl-[18px] [&_li]:mb-1
        [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2
        [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1.5
        [&_hr]:my-3 [&_hr]:border-border
        [&_blockquote]:border-l-2 [&_blockquote]:border-accent-strong/30 [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>

      {/* 操作按钮 / 修改反馈输入 */}
       {status === 'complete' && !showModifyInput && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-accent-strong/10 bg-surface/50">
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent-strong text-accent-on
              hover:bg-accent-hover active:scale-[0.97] transition-all duration-150 text-sm font-medium cursor-pointer"
          >
            <Check size={14} />
            批准并执行
          </button>
          <button
            type="button"
            onClick={() => setShowModifyInput(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface
              text-text-secondary hover:text-text-primary hover:border-accent-strong/30
              active:scale-[0.97] transition-all duration-150 text-sm cursor-pointer"
          >
            <FilePen size={14} />
            修改计划
          </button>
        </div>
      )}

       {status === 'complete' && showModifyInput && (
        <div className="px-4 py-2.5 border-t border-accent-strong/10 bg-surface/50">
          <textarea
            autoFocus
            rows={2}
            value={modifyFeedback}
            onChange={(e) => setModifyFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleModifySubmit();
              }
              if (e.key === 'Escape') handleModifyCancel();
            }}
            placeholder="输入修改意见，Agent 将据此重新规划..."
            className="w-full px-3 py-2 text-sm text-text-primary bg-background border border-border
              rounded-md resize-none outline-none
              focus:border-accent-strong focus:ring-[2px] focus:ring-accent-subtle-bg
              placeholder:text-text-tertiary"
          />
          <div className="flex items-center gap-2 mt-2 justify-end">
            <button
              type="button"
              onClick={handleModifyCancel}
              className="h-7 px-2.5 rounded text-xs text-text-secondary hover:text-text-primary cursor-pointer"
            >
              <X size={12} className="inline mr-1" />
              取消
            </button>
            <button
              type="button"
              onClick={handleModifySubmit}
              className="inline-flex items-center gap-1 h-7 px-3 rounded bg-accent-strong text-accent-on
                hover:bg-accent-hover active:scale-[0.97] transition-all duration-150 text-xs font-medium cursor-pointer"
            >
              <Send size={11} />
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlanCard;
