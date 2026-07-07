import { Copy, X } from 'lucide-react';
import { useAtom } from 'jotai';
import { MarkdownArticle } from '../MarkdownArticle';
import { Button } from '../ui/button';
import { previewFileAtom } from '../../state/chat';
import { showToast } from '../Toast';

export function FilePreview() {
  const [previewFile, setPreviewFile] = useAtom(previewFileAtom);

  if (!previewFile) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewFile.content);
      showToast('已复制文件内容', 'success');
    } catch (err) {
      showToast(`复制失败：${(err as Error).message}`, 'error');
    }
  };

  return (
    <section className="h-full min-w-0 border-l border-border bg-surface flex flex-col">
      <header className="h-12 shrink-0 border-b border-border px-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-headline text-[14px] font-semibold truncate text-text-primary">{previewFile.name}</h2>
          <p className="text-[11px] text-text-secondary font-mono truncate">{previewFile.path}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="复制内容" type="button">
            <Copy size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewFile(null)} title="关闭预览" type="button">
            <X size={14} />
          </Button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <MarkdownArticle content={previewFile.content} />
      </div>
    </section>
  );
}
