import { Bot, FileSearch, Highlighter, Lightbulb, ShieldAlert } from 'lucide-react';
import type { Claim } from '../types';

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

export function AIWorkbenchPanel({ claim }: { claim?: Claim }) {
  return (
    <aside className="border border-outline-variant bg-surface-container rounded-xl p-5 sticky top-[122px] max-xl:static">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-secondary-container/20 text-secondary">
          <Bot size={18} />
        </div>
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-secondary">AI 工作台</p>
          <h3 className="text-base font-semibold text-on-surface font-headline">未来协作面板</h3>
        </div>
      </div>

      <p className="text-sm text-on-surface-variant mt-3">
        当前 shell 为只读模式。该面板已按科研 AI IDE 的预期操作进行布局设计。
      </p>

      <div className="grid gap-3 mt-4">
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

      {claim ? (
        <div className="mt-4 rounded-lg p-4 bg-secondary/5 border border-secondary/15">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">Linked Claim</p>
          <strong className="block text-sm text-on-surface">{claim.claimId}</strong>
          <p className="text-sm text-on-surface-variant mt-1">{claim.content}</p>
          <p className="text-sm text-on-surface-variant mt-2">Recommended wording: {claim.recommendedWording}</p>
        </div>
      ) : null}
    </aside>
  );
}
