export type FileOpenStrategy = 'preview' | 'system';

export interface FileEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
}

export type FilePreviewData =
  | { kind: 'text'; path: string; content: string }
  | { kind: 'image'; path: string; dataUrl: string }
  | { kind: 'external'; path: string };

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const PREVIEW_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.tsv', '.py', '.r', '.js', '.ts', '.tsx', '.jsx',
  '.css', '.html', '.xml', '.toml', '.ini', '.log', '.tex', '.bib', '.sh', '.ps1',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
]);

function extensionOf(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? '';
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error || fallbackMessage);
  }
  return result.data;
}

async function runAction(
  action: 'open' | 'reveal',
  projectId: string,
  filePath: string,
  flowId?: string,
): Promise<void> {
  const response = await fetch(`/api/files/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, path: filePath, ...(flowId ? { flowId } : {}) }),
  });
  const result = await response.json() as ApiResponse<unknown>;
  if (!response.ok || !result.success) {
    throw new Error(result.error || (action === 'open' ? '打开文件失败' : '定位文件失败'));
  }
}

export function getFileOpenStrategy(filePath: string): FileOpenStrategy {
  return PREVIEW_EXTENSIONS.has(extensionOf(filePath)) ? 'preview' : 'system';
}

export async function listDirectory(projectId: string, directoryPath: string, flowId?: string): Promise<FileEntry[]> {
  const query = new URLSearchParams({ projectId, path: directoryPath });
  if (flowId) query.set('flowId', flowId);
  const response = await fetch(`/api/files/list?${query.toString()}`);
  return readResponse<FileEntry[]>(response, '读取目录失败');
}

export async function previewFile(projectId: string, filePath: string, flowId?: string): Promise<FilePreviewData> {
  const query = new URLSearchParams({ projectId, path: filePath });
  if (flowId) query.set('flowId', flowId);
  const response = await fetch(`/api/files/preview?${query.toString()}`);
  return readResponse<FilePreviewData>(response, '预览文件失败');
}

export function openFile(projectId: string, filePath: string, flowId?: string): Promise<void> {
  return runAction('open', projectId, filePath, flowId);
}

export function revealFile(projectId: string, filePath: string, flowId?: string): Promise<void> {
  return runAction('reveal', projectId, filePath, flowId);
}

/** 精确匹配 F001、F001_xxx 或旧 F001.md，避免把 F0010 当成 F001。 */
export function findFlowEntry(entries: FileEntry[], flowId: string): FileEntry | undefined {
  const escapedId = flowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedId}(?:_|\\.md$|$)`, 'i');
  return entries.find((entry) => pattern.test(entry.name));
}

export function joinHostPath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${child.replace(/^[\\/]+/, '')}`;
}

export function hostBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}
