import type { ProjectConfig } from '../types';

type AttachedPathKind = 'folders' | 'files';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || fallbackMessage);
  }
  return result.data;
}

function projectConfigUrl(projectId: string, kind?: AttachedPathKind): string {
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  return kind ? `${base}/${kind}` : `${base}/config`;
}

export async function getProjectConfig(projectId: string): Promise<ProjectConfig> {
  const response = await fetch(projectConfigUrl(projectId));
  return readResponse<ProjectConfig>(response, '获取项目文件设置失败');
}

async function changeAttachedPath(
  projectId: string,
  kind: AttachedPathKind,
  path: string,
  method: 'POST' | 'DELETE',
): Promise<ProjectConfig> {
  const response = await fetch(projectConfigUrl(projectId, kind), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return readResponse<ProjectConfig>(
    response,
    method === 'POST' ? '添加路径失败' : '移除路径失败',
  );
}

export function addAttachedDirectory(projectId: string, path: string): Promise<ProjectConfig> {
  return changeAttachedPath(projectId, 'folders', path, 'POST');
}

export function removeAttachedDirectory(projectId: string, path: string): Promise<ProjectConfig> {
  return changeAttachedPath(projectId, 'folders', path, 'DELETE');
}

export function addAttachedFile(projectId: string, path: string): Promise<ProjectConfig> {
  return changeAttachedPath(projectId, 'files', path, 'POST');
}

export function removeAttachedFile(projectId: string, path: string): Promise<ProjectConfig> {
  return changeAttachedPath(projectId, 'files', path, 'DELETE');
}
