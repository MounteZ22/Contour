import { useState } from 'react';
import { X } from 'lucide-react';

export interface TagEditorProps {
  /** 当前标签列表 */
  tags: string[];
  /** 标签变更回调 */
  onTagsChange: (tags: string[]) => void;
  /** 输入框占位文字 */
  placeholder?: string;
}

/**
 * 标签编辑器 — 共享组件
 *
 * ProjectDocPage 和 ProjectClaimPage 中的标签编辑 UI 完全相同，
 * 提取为此组件以消除重复。
 */
export function TagEditor({ tags, onTagsChange, placeholder = '添加标签' }: TagEditorProps) {
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    onTagsChange([...tags, trimmed]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="grid gap-1">
      <span className="text-caption font-mono text-text-secondary">Tags</span>
      <div className="flex items-center gap-1.5">
        <input
          className="w-28 rounded-md border border-border/60 bg-surface-raised px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-strong/40"
          placeholder={placeholder}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <button
          className="px-2 py-1.5 rounded-md bg-accent-subtle-bg text-accent-subtle-text text-caption font-mono cursor-pointer hover:bg-accent-strong/10 transition-colors"
          onClick={addTag}
          type="button"
        >
          添加
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-caption font-mono text-text-secondary bg-surface border border-border/40"
            >
              {tag}
              <button
                className="cursor-pointer hover:text-danger transition-colors"
                onClick={() => removeTag(tag)}
                type="button"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
