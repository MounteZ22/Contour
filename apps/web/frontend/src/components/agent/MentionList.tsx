import { useEffect, useRef } from 'react';
import { FileText, FolderTree, File } from 'lucide-react';

/** @ 提及建议项 */
export interface MentionItem {
  type: 'file' | 'flow' | 'doc';
  name: string;
  path: string;
  title?: string;
}

interface MentionListProps {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  /** 弹窗定位（相对于输入框容器） */
  position: { top: number; left: number };
}

/** 按类型返回图标 */
function mentionIcon(type: MentionItem['type']) {
  const cls = 'shrink-0';
  switch (type) {
    case 'flow':
      return <FolderTree size={14} className={cls} />;
    case 'doc':
      return <FileText size={14} className={cls} />;
    case 'file':
      return <File size={14} className={cls} />;
  }
}

/** 类型标签颜色 */
function typeBadge(type: MentionItem['type']) {
  switch (type) {
    case 'flow':
      return 'bg-accent-subtle-bg text-accent-subtle-text';
    case 'doc':
      return 'bg-success/10 text-success';
    case 'file':
    default:
      return 'bg-surface-sunken text-text-secondary';
  }
}

export function MentionList({ items, selectedIndex, onSelect, onClose, position }: MentionListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // 自动滚动选中项到可见区域
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const selected = el.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="提及建议"
      className="absolute z-50 w-72 max-h-52 overflow-y-auto rounded-lg border border-border bg-surface-raised shadow-lg py-1"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {items.map((item, index) => (
        <button
          key={`${item.type}:${item.path}`}
          role="option"
          aria-selected={index === selectedIndex}
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
            index === selectedIndex
              ? 'bg-accent-subtle-bg text-accent-subtle-text'
              : 'text-text-primary hover:bg-surface-sunken'
          }`}
          onMouseDown={(e) => {
            // 阻止默认行为防止输入框失焦
            e.preventDefault();
            onSelect(item);
          }}
        >
          {mentionIcon(item.type)}
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <span className={`shrink-0 text-[10px] px-1 rounded-xs font-mono ${typeBadge(item.type)}`}>
            {item.type === 'flow' ? 'F' : item.type === 'doc' ? 'D' : '文件'}
          </span>
        </button>
      ))}
      {items.length === 0 && (
        <div className="px-3 py-3 text-xs text-text-tertiary text-center">未找到匹配项</div>
      )}
    </div>
  );
}
