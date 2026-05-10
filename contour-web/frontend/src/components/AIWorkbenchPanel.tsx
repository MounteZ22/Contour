import { Bot, FileSearch, Highlighter, Lightbulb, Send, ShieldAlert, X } from 'lucide-react';
import type { Claim } from '../types';

export interface AIContextItem {
  id: string;
  title: string;
  type: 'flow' | 'doc';
}

interface AIWorkbenchPanelProps {
  claim?: Claim;
  initialContext?: AIContextItem[];
  onClearContext?: () => void;
}

const suggestedActions = [
  {
    label: '生成 AI 上下文摘要',
    detail: '将当前文档压缩为可复用的摘要层。',
    icon: FileSearch,
  },
  {
    label: '检查过度推断风险',
    detail: '审阅当前措辞是否超越了证据支撑。',
    icon: ShieldAlert,
  },
  {
    label: '提取候选论断',
    detail: '将具体观察转化为可复用的判断草稿。',
    icon: Highlighter,
  },
  {
    label: 'Suggest next Flow',
    detail: '建议能降低不确定性的下一步研究动作。',
    icon: Lightbulb,
  },
];

export function AIWorkbenchPanel({
  claim,
  initialContext,
  onClearContext,
}: AIWorkbenchPanelProps) {
  const hasContext = initialContext && initialContext.length > 0;

  return (
    <aside className="border border-outline-variant bg-surface-container rounded-xl p-5 sticky top-[122px] max-xl:static flex flex-col gap-4">
      {/* 标题区 */}
      <div className="flex items-start justify-between gap-3">
        <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-secondary-container/20 text-secondary">
          <Bot size={18} />
        </div>
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-secondary">AI 工作台</p>
          <h3 className="text-base font-semibold text-on-surface font-headline">{hasContext ? '与 AI 讨论' : '未来协作面板'}</h3>
        </div>
      </div>

      {/* 上下文摘要条 */}
      {hasContext && (
        <div className="rounded-lg p-3 bg-primary/5 border border-primary/15">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[10px] font-mono font-medium uppercase tracking-wider text-primary">当前讨论范围</p>
            <button
              className="text-on-surface-variant hover:text-error transition-colors cursor-pointer"
              onClick={onClearContext}
              title="清除上下文"
              type="button"
            >
              <X size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {initialContext!.map((item) => (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                  item.type === 'flow'
                    ? 'bg-primary-container/15 border-primary/20 text-primary'
                    : 'bg-tertiary-container/15 border-tertiary/20 text-tertiary'
                }`}
                key={item.id}
              >
                {item.type === 'flow' ? 'F' : 'D'}
                {item.id}
                <span className="text-on-surface-variant truncate max-w-[120px]">{item.title}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      {hasContext ? (
        <>
          {/* 聊天占位 */}
          <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-low/50">
            <Bot size={28} className="text-outline-variant" />
            <p className="text-sm text-on-surface-variant text-center px-4">
              AI 对话功能即将上线
            </p>
            <p className="text-xs text-on-surface-variant/60 text-center px-6">
              您可以先在此面板确认选中的研究范围是否正确
            </p>
          </div>

          {/* 输入框占位 */}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono"
              disabled
              placeholder="在此输入消息..."
              type="text"
            />
            <button
              className="w-9 h-9 rounded-lg bg-primary/40 text-on-primary flex items-center justify-center cursor-not-allowed"
              disabled
              type="button"
            >
              <Send size={14} />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">
            当前 shell 为只读模式。该面板已按科研 AI IDE 的预期操作进行布局设计。
          </p>

          <div className="grid gap-3">
            {suggestedActions.map((action) => {
              const Icon = action.icon;
              return (
                <div className="grid grid-cols-[36px_1fr] gap-3 p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/30" key={action.label}>
                  <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
                    <Icon size={16} />
                  </div>
                  <div>
                    <strong className="block text-sm text-on-surface">{action.label}</strong>
                    <p className="text-sm text-on-surface-variant mt-1">{action.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Claim 关联区（向后兼容） */}
      {claim && !hasContext ? (
        <div className="rounded-lg p-4 bg-secondary/5 border border-secondary/15">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">Linked Claim</p>
          <strong className="block text-sm text-on-surface">{claim.claimId}</strong>
          <p className="text-sm text-on-surface-variant mt-1">{claim.content}</p>
          <p className="text-sm text-on-surface-variant mt-2">Recommended wording: {claim.recommendedWording}</p>
        </div>
      ) : null}
    </aside>
  );
}

export type { AIWorkbenchPanelProps };
