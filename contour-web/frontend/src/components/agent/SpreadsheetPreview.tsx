import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import readXlsxFile, { type CellValue, type Sheet } from 'read-excel-file/browser';
import { Button } from '../ui/button';

const MAX_SHEETS = 20;
const MAX_ROWS = 250;
const MAX_COLUMNS = 80;
const MAX_VISIBLE_CELLS = MAX_ROWS * MAX_COLUMNS;

interface SpreadsheetPreviewProps {
  contentUrl: string;
  onOpenWithSystem: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'XLSX 无法解析';
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function formatCell(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleString();
  const text = String(value);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

export function SpreadsheetPreview({ contentUrl, onOpenWithSystem }: SpreadsheetPreviewProps) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setSheets([]);
    setSheetIndex(0);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(contentUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`读取 XLSX 失败（${response.status}）`);
        const parsed = await readXlsxFile(await response.blob());
        if (!disposed) setSheets(parsed);
      } catch (loadError) {
        if (!disposed) setError(messageFrom(loadError));
      }
    };

    void load();
    return () => { disposed = true; };
  }, [contentUrl]);

  const visibleSheets = useMemo(() => sheets.slice(0, MAX_SHEETS), [sheets]);
  const selectedSheet = visibleSheets[Math.min(sheetIndex, Math.max(visibleSheets.length - 1, 0))];
  const visibleRows = useMemo(
    () => selectedSheet?.data.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS)) ?? [],
    [selectedSheet],
  );
  const columnCount = Math.min(MAX_COLUMNS, visibleRows.reduce((largest, row) => Math.max(largest, row.length), 0));
  const wasTrimmed = Boolean(
    sheets.length > MAX_SHEETS ||
    (selectedSheet && (selectedSheet.data.length > MAX_ROWS || selectedSheet.data.some((row) => row.length > MAX_COLUMNS))),
  );

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-error">无法在 Contour 中预览此 XLSX：{error}</p>
        <Button onClick={onOpenWithSystem} size="sm" type="button" variant="outline">用系统程序打开</Button>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="animate-spin" size={16} /> 正在加载工作表
      </div>
    );
  }

  return (
    <section aria-label="XLSX 预览" className="flex min-h-full flex-col gap-3">
      <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-border pb-1" role="tablist" aria-label="工作表">
        {visibleSheets.map((sheet, index) => (
          <button
            aria-selected={index === sheetIndex}
            className={index === sheetIndex
              ? 'h-8 shrink-0 rounded-md bg-accent-subtle-bg px-3 text-xs font-medium text-accent-strong'
              : 'h-8 shrink-0 rounded-md px-3 text-xs text-text-secondary hover:bg-surface-raised hover:text-text-primary'}
            key={sheet.sheet}
            onClick={() => setSheetIndex(index)}
            role="tab"
            type="button"
          >{sheet.sheet || `工作表 ${index + 1}`}</button>
        ))}
      </div>
      {wasTrimmed && (
        <p className="text-xs text-text-secondary">为保持页面稳定，当前仅显示前 {MAX_SHEETS} 个工作表、每表前 {MAX_ROWS} 行和前 {MAX_COLUMNS} 列（最多 {MAX_VISIBLE_CELLS.toLocaleString()} 个单元格）。</p>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-md bg-surface-raised shadow-sm">
        <table className="min-w-max border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-surface-sunken text-text-secondary">
            <tr>
              <th className="sticky left-0 z-[2] min-w-10 border-b border-r border-border bg-surface-sunken px-2 py-1.5 text-right font-mono font-normal">#</th>
              {Array.from({ length: columnCount }, (_, index) => <th className="min-w-32 border-b border-r border-border px-2 py-1.5 font-mono font-normal" key={index}>{columnLabel(index)}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr className="hover:bg-surface-sunken/70" key={rowIndex}>
                <th className="sticky left-0 z-[1] border-b border-r border-border bg-surface-raised px-2 py-1.5 text-right font-mono font-normal text-text-secondary">{rowIndex + 1}</th>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td className="max-w-96 border-b border-r border-border px-2 py-1.5 align-top whitespace-pre-wrap break-words text-text-primary" key={columnIndex}>{formatCell(row[columnIndex])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
