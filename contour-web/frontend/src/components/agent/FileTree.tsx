import { useState, type MouseEvent } from 'react';
import {
  ChevronRight,
  ExternalLink,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { useSetAtom } from 'jotai';
import { previewFileAtom } from '../../state/chat';
import {
  getFileOpenStrategy,
  openFile,
  previewFile,
  revealFile,
} from '../../state/fileBrowser';
import { showToast } from '../Toast';
import { cn } from '@/lib/utils';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  kind: 'directory' | 'file';
  available?: boolean;
  flowId?: string;
  lazy?: boolean;
  defaultExpanded?: boolean;
  children?: FileTreeNode[];
  loadType?: 'directory' | 'flow' | 'vault';
  actions?: boolean;
  flowAttachments?: string[];
  flowLinks?: Array<{ path: string; label: string }>;
}

interface FileTreeProps {
  nodes: FileTreeNode[];
  emptyText: string;
  projectId: string;
  loadChildren: (node: FileTreeNode) => Promise<FileTreeNode[]>;
}

function isImage(filePath: string): boolean {
  return /\.(?:png|jpe?g|gif|svg|webp)$/i.test(filePath);
}

function TreeNode({
  node,
  level,
  projectId,
  loadChildren,
}: {
  node: FileTreeNode;
  level: number;
  projectId: string;
  loadChildren: FileTreeProps['loadChildren'];
}) {
  const setPreviewFile = useSetAtom(previewFileAtom);
  const [expanded, setExpanded] = useState(Boolean(node.defaultExpanded));
  const [children, setChildren] = useState(node.children);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const available = node.available !== false;
  const actionsEnabled = node.actions !== false;
  const isDirectory = node.kind === 'directory';

  const loadDirectory = async () => {
    if (!node.lazy || children !== undefined || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      setChildren(await loadChildren(node));
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取目录失败';
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!available) return;
    if (isDirectory) {
      const nextExpanded = !expanded;
      setExpanded(nextExpanded);
      if (nextExpanded) await loadDirectory();
      return;
    }

    try {
      if (getFileOpenStrategy(node.path) === 'system') {
        await openFile(projectId, node.path, node.flowId);
        return;
      }
      const preview = await previewFile(projectId, node.path, node.flowId);
      if (preview.kind === 'external') {
        await openFile(projectId, node.path, node.flowId);
        return;
      }
      setPreviewFile({
        ...preview,
        name: node.name,
        projectId,
        flowId: node.flowId,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开文件失败', 'error');
    }
  };

  const runMenuAction = async (action: 'open' | 'reveal') => {
    setMenuOpen(false);
    try {
      if (action === 'open') await openFile(projectId, node.path, node.flowId);
      else await revealFile(projectId, node.path, node.flowId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '文件操作失败', 'error');
    }
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (!available || !actionsEnabled) return;
    event.preventDefault();
    setMenuOpen(true);
  };

  const label = available ? node.name : `${node.name}（不可用）`;

  return (
    <div>
      <div className="group relative flex min-w-0 items-center" onContextMenu={handleContextMenu}>
        <button
          aria-label={label}
          className={cn(
            'h-8 min-w-0 flex-1 rounded-[4px] inline-flex items-center gap-2 text-left text-xs transition-colors',
            available
              ? 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
              : 'cursor-not-allowed text-text-tertiary opacity-60',
            isDirectory && available && 'text-text-primary',
          )}
          disabled={!available}
          onClick={handlePrimaryAction}
          style={{ paddingLeft: `${8 + level * 14}px`, paddingRight: '30px' }}
          title={available ? node.path : `${node.path}（当前不可用）`}
          type="button"
        >
          {isDirectory ? (
            loading
              ? <Loader2 size={13} className="shrink-0 animate-spin" />
              : <ChevronRight size={13} className={cn('shrink-0 transition-transform', expanded && 'rotate-90')} />
          ) : (
            <span className="w-[13px] shrink-0" />
          )}
          {isDirectory
            ? <Folder size={14} className="shrink-0 text-text-tertiary" />
            : isImage(node.path)
              ? <FileImage size={14} className="shrink-0" />
              : <FileText size={14} className="shrink-0" />}
          <span className="truncate">{node.name}</span>
          {!available && <span className="ml-auto shrink-0 text-[10px]">离线</span>}
        </button>

        {available && actionsEnabled && (
          <button
            aria-label={`${node.name} 文件操作`}
            className="absolute right-1 h-6 w-6 items-center justify-center rounded-[4px] text-text-tertiary hover:bg-surface-raised hover:text-text-primary hidden group-hover:flex focus:flex"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
            title="文件操作"
            type="button"
          >
            <MoreHorizontal size={14} />
          </button>
        )}

        {menuOpen && (
          <div className="absolute right-1 top-7 z-20 min-w-44 rounded-[6px] bg-surface-raised p-1 shadow-lg">
            {!isDirectory && (
              <button
                className="flex h-8 w-full items-center gap-2 rounded-[4px] px-2 text-xs text-text-primary hover:bg-surface-sunken"
                onClick={() => runMenuAction('open')}
                type="button"
              >
                <ExternalLink size={14} />
                用默认程序打开
              </button>
            )}
            <button
              className="flex h-8 w-full items-center gap-2 rounded-[4px] px-2 text-xs text-text-primary hover:bg-surface-sunken"
              onClick={() => runMenuAction('reveal')}
              type="button"
            >
              <FolderOpen size={14} />
              在文件管理器中显示
            </button>
          </div>
        )}
      </div>

      {isDirectory && expanded && (
        <div>
          {loadError && (
            <p className="py-1 pr-2 text-[11px] text-error" style={{ paddingLeft: `${24 + level * 14}px` }}>
              {loadError}
            </p>
          )}
          {!loading && !loadError && children?.length === 0 && (
            <p className="py-1 pr-2 text-[11px] text-text-tertiary" style={{ paddingLeft: `${24 + level * 14}px` }}>
              空文件夹
            </p>
          )}
          {children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              projectId={projectId}
              loadChildren={loadChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ nodes, emptyText, projectId, loadChildren }: FileTreeProps) {
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
        <TreeNode
          key={node.id}
          node={node}
          level={0}
          projectId={projectId}
          loadChildren={loadChildren}
        />
      ))}
    </div>
  );
}
