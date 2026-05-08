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
    <aside className="panel-card ai-panel">
      <div className="panel-card-header">
        <div className="panel-icon">
          <Bot size={18} />
        </div>
        <div>
          <p className="eyebrow">AI 工作台</p>
          <h3>未来协作面板</h3>
        </div>
      </div>

      <p className="panel-copy">
        当前 shell 为只读模式。该面板已按科研 AI IDE 的预期操作进行布局设计。
      </p>

      <div className="action-list">
        {suggestedActions.map((action) => {
          const Icon = action.icon;
          return (
            <div className="action-item" key={action.label}>
              <div className="action-icon">
                <Icon size={16} />
              </div>
              <div>
                <strong>{action.label}</strong>
                <p>{action.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      {claim ? (
        <div className="claim-callout">
          <p className="eyebrow">Linked Claim</p>
          <strong>{claim.claimId}</strong>
          <p>{claim.content}</p>
          <p className="muted">Recommended wording: {claim.recommendedWording}</p>
        </div>
      ) : null}
    </aside>
  );
}
