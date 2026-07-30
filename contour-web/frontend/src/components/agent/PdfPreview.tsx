import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from '../ui/button';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPreviewProps {
  contentUrl: string;
  onOpenWithSystem: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'PDF 无法解析';
}

export function PdfPreview({ contentUrl, onOpenWithSystem }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    setDocumentProxy(null);
    setPageNumber(1);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(contentUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`读取 PDF 失败（${response.status}）`);
        const loadingTask = getDocument({ data: await response.arrayBuffer() });
        const nextDocument = await loadingTask.promise;
        if (disposed) {
          await nextDocument.destroy();
          return;
        }
        loadedDocument = nextDocument;
        setDocumentProxy(nextDocument);
      } catch (loadError) {
        if (!disposed) setError(messageFrom(loadError));
      }
    };

    void load();
    return () => {
      disposed = true;
      if (loadedDocument) void loadedDocument.destroy();
    };
  }, [contentUrl]);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null;

    const render = async () => {
      try {
        const page = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: zoom / 100 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('当前浏览器无法绘制 PDF');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (renderError) {
        if (!cancelled && !(renderError instanceof Error && renderError.name === 'RenderingCancelledException')) {
          setError(messageFrom(renderError));
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, zoom]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-error">无法在 Contour 中预览此 PDF：{error}</p>
        <Button onClick={onOpenWithSystem} size="sm" type="button" variant="outline">用系统程序打开</Button>
      </div>
    );
  }

  if (!documentProxy) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="animate-spin" size={16} /> 正在加载 PDF
      </div>
    );
  }

  return (
    <section aria-label="PDF 预览" className="flex min-h-full flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-1 rounded-md bg-surface-raised px-2 py-1.5 shadow-sm">
        <Button
          aria-label="上一页"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          size="icon"
          title="上一页"
          type="button"
          variant="ghost"
        ><ChevronLeft size={16} /></Button>
        <span className="min-w-20 text-center font-mono text-xs text-text-secondary">{pageNumber} / {documentProxy.numPages}</span>
        <Button
          aria-label="下一页"
          disabled={pageNumber >= documentProxy.numPages}
          onClick={() => setPageNumber((page) => Math.min(documentProxy.numPages, page + 1))}
          size="icon"
          title="下一页"
          type="button"
          variant="ghost"
        ><ChevronRight size={16} /></Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button aria-label="缩小" disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 25))} size="icon" title="缩小" type="button" variant="ghost"><Minus size={14} /></Button>
        <span className="min-w-10 text-center font-mono text-xs text-text-secondary">{zoom}%</span>
        <Button aria-label="放大" disabled={zoom >= 200} onClick={() => setZoom((value) => Math.min(200, value + 25))} size="icon" title="放大" type="button" variant="ghost"><Plus size={14} /></Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-surface-sunken p-3">
        <canvas className="h-auto max-w-none bg-white shadow-md" ref={canvasRef} />
      </div>
    </section>
  );
}
