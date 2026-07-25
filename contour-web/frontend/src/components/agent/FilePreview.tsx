import { Copy, ExternalLink, FolderOpen, X } from 'lucide-react';
import { useAtom } from 'jotai';
import { MarkdownArticle } from '../MarkdownArticle';
import { Button } from '../ui/button';
import { previewFileAtom } from '../../state/chat';
import { openFile, revealFile } from '../../state/fileBrowser';
import { showToast } from '../Toast';

function isMarkdown(filePath: string): boolean {
  return /\.(?:md|markdown)$/i.test(filePath);
}

export function FilePreview() {
  const [previewFile, setPreviewFile] = useAtom(previewFileAtom);

  if (!previewFile) return null;

  const handleCopy = async () => {
    if (!previewFile.content) return;
    try {
      await navigator.clipboard.writeText(previewFile.content);
      showToast('已复制文件内容', 'success');
    } catch (error) {
      showToast(`复制失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  };

  const runHostAction = async (action: 'open' | 'reveal') => {
    try {
      if (action === 'open') {
        await openFile(previewFile.projectId, previewFile.path, previewFile.flowId);
      } else {
        await revealFile(previewFile.projectId, previewFile.path, previewFile.flowId);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '文件操作失败', 'error');
    }
  };

  return (
    <section className="h-full min-w-0 bg-surface flex flex-col shadow-lg">
      <header className="h-12 shrink-0 border-b border-border px-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-headline text-[14px] font-semibold truncate text-text-primary">{previewFile.name}</h2>
          <p className="text-[11px] text-text-secondary font-mono truncate" title={previewFile.path}>{previewFile.path}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {previewFile.kind === 'text' && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="复制内容" type="button">
              <Copy size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => runHostAction('open')}
            title="用默认程序打开"
            type="button"
          >
            <ExternalLink size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => runHostAction('reveal')}
            title="在文件管理器中显示"
            type="button"
          >
            <FolderOpen size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewFile(null)} title="关闭预览" type="button">
            <X size={14} />
          </Button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        {previewFile.kind === 'image' ? (
          <div className="flex min-h-full items-start justify-center">
            <img
              alt={previewFile.name}
              className="block max-h-full max-w-full rounded-[6px] object-contain shadow-sm"
              src={previewFile.dataUrl}
            />
          </div>
        ) : isMarkdown(previewFile.path) ? (
          <MarkdownArticle content={previewFile.content ?? ''} />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-text-primary">
            {previewFile.content}
          </pre>
        )}
      </div>
    </section>
  );
}
