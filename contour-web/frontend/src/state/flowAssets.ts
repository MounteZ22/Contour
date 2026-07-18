import { atom, type PrimitiveAtom } from 'jotai';
import type { FlowLink } from '../types';

export const MAX_FLOW_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export interface FlowAssetsState {
  attachments: string[];
  links: FlowLink[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const assetAtoms = new Map<string, PrimitiveAtom<FlowAssetsState>>();

export function getFlowAssetsAtom(projectId: string, flowId: string): PrimitiveAtom<FlowAssetsState> {
  const key = `${projectId}:${flowId}`;
  let assetAtom = assetAtoms.get(key);
  if (!assetAtom) {
    assetAtom = atom<FlowAssetsState>({ attachments: [], links: [] });
    assetAtoms.set(key, assetAtom);
  }
  return assetAtom;
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error || fallbackMessage);
  }
  return result.data;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取附件失败'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('读取附件失败'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadFlowAttachment(
  projectId: string,
  flowId: string,
  file: File,
): Promise<string[]> {
  if (file.size > MAX_FLOW_ATTACHMENT_BYTES) {
    throw new Error('附件不能超过 3 MiB');
  }
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      filename: file.name,
      contentBase64: await fileToBase64(file),
    }),
  });
  const data = await readResponse<{ attachments: string[] }>(response, '上传附件失败');
  return data.attachments;
}

export async function deleteFlowAttachment(
  projectId: string,
  flowId: string,
  filename: string,
): Promise<string[]> {
  const query = new URLSearchParams({ projectId });
  const response = await fetch(
    `/api/flows/${encodeURIComponent(flowId)}/attachments/${encodeURIComponent(filename)}?${query.toString()}`,
    { method: 'DELETE' },
  );
  const data = await readResponse<{ attachments: string[] }>(response, '删除附件失败');
  return data.attachments;
}

export async function addFlowLink(
  projectId: string,
  flowId: string,
  path: string,
  label: string,
): Promise<FlowLink[]> {
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, path, label }),
  });
  const data = await readResponse<{ links: FlowLink[] }>(response, '添加链接失败');
  return data.links;
}

export async function removeFlowLink(
  projectId: string,
  flowId: string,
  path: string,
): Promise<FlowLink[]> {
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/links`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, path }),
  });
  const data = await readResponse<{ links: FlowLink[] }>(response, '移除链接失败');
  return data.links;
}
