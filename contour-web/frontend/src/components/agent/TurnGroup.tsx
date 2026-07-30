import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import type { ChatMessage } from '../../state/aiApi';
import { ChatMessageItem } from '../ChatMessage';

/**
 * TurnGroup — 可折叠的轮次分组容器
 *
 * 将同一轮（turnIndex 相同）的消息合并展示：
 * - 头部：第 N 轮 + 折叠箭头 + 文件改动摘要
 * - 展开时：显示本轮所有消息 + 文件改动列表
 * - 折叠时：仅显示摘要行
 *
 * 用法：由 SessionChat 按 turnIndex 分组后传入 turnMessages。
 */
export function TurnGroup({
  turnMessages,
  defaultExpanded,
  onAskUserAnswered,
}: {
  /** 本轮的所有消息（至少 1 条 assistant 消息） */
  turnMessages: ChatMessage[];
  /** 是否默认展开（当前轮为 true，历史轮为 false） */
  defaultExpanded: boolean;
  onAskUserAnswered?: (requestId: string, answers: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [wasEverExpanded, setWasEverExpanded] = useState(defaultExpanded);

  // 从第一条消息提取轮次序号
  const turnIndex = turnMessages[0]?.turnIndex;
  const turnLabel = turnIndex != null ? `第 ${turnIndex} 轮` : '对话';

  // 汇总本轮所有文件改动（去重）
  const allFiles = new Set<string>();
  for (const msg of turnMessages) {
    if (msg.filesChanged) {
      for (const f of msg.filesChanged) {
        allFiles.add(f);
      }
    }
  }
  const filesChanged = [...allFiles];

  const handleToggle = () => {
    setExpanded((prev) => !prev);
    if (!wasEverExpanded) setWasEverExpanded(true);
  };

  return (
    <div className="turn-group rounded-lg border border-border overflow-hidden">
      {/* ── 头部：轮次摘要 ── */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left bg-surface-sunken/50 hover:bg-surface-sunken transition-colors cursor-pointer"
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        <ChevronRight
          size={14}
          className={`flex-shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-medium text-text-primary">{turnLabel}</span>

        {/* 折叠时显示文件改动摘要 */}
        {!expanded && filesChanged.length > 0 && (
          <span className="text-xs text-text-tertiary">
            · {filesChanged.length} 个文件改动
          </span>
        )}
      </button>

      {/* ── 展开时：消息列表 + 文件改动 ── */}
      {(expanded || wasEverExpanded) && (
        <div className={expanded ? '' : 'hidden'}>
          <div className="px-4 py-3 flex flex-col gap-3">
            {turnMessages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                isStreaming={false}
                message={msg}
                onAskUserAnswered={onAskUserAnswered}
              />
            ))}
          </div>

          {/* 文件改动列表 */}
          {filesChanged.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 bg-surface-sunken/30">
              <div className="flex items-start gap-2">
                <FileText size={14} className="text-text-tertiary flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">
                    本轮文件改动
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {filesChanged.map((file) => (
                      <code
                        key={file}
                        className="text-[11px] font-mono bg-surface-sunken text-text-secondary px-1.5 py-0.5 rounded"
                      >
                        {file}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
