import { useState } from 'react';
import { ChevronRight, FileText, Folder } from 'lucide-react';
import { useSetAtom } from 'jotai';
import { previewFileAtom } from '../../state/chat';
import { cn } from '@/lib/utils';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  content?: string;
  children?: FileTreeNode[];
}

function TreeNode({ node, level }: { node: FileTreeNode; level: number }) {
  const setPreviewFile = useSetAtom(previewFileAtom);
  const [expanded, setExpanded] = useState(level < 1);
  const hasChildren = Boolean(node.children?.length);

  const handleClick = () => {
    if (hasChildren) {
      setExpanded((value) => !value);
      return;
    }
    setPreviewFile({
      path: node.path,
      name: node.name,
      content: node.content ?? '',
    });
  };

  return (
    <div>
      <button
        className={cn(
          'w-full h-8 rounded-[4px] px-2 inline-flex items-center gap-2 text-left text-xs transition-colors hover:bg-surface-sunken hover:text-text-primary',
          hasChildren ? 'text-text-primary' : 'text-text-secondary',
        )}
        onClick={handleClick}
        style={{ paddingLeft: `${8 + level * 14}px` }}
        title={node.path}
        type="button"
      >
        {hasChildren ? (
          <ChevronRight size={13} className={cn('shrink-0 transition-transform', expanded && 'rotate-90')} />
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        {hasChildren ? <Folder size={14} className="shrink-0 text-text-tertiary" /> : <FileText size={14} className="shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ nodes, emptyText }: { nodes: FileTreeNode[]; emptyText: string }) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-xs text-text-secondary leading-relaxed">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-0.5">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} level={0} />
      ))}
    </div>
  );
}
