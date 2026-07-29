import { atom } from 'jotai';
import type { AgentModelSelection } from './agentModelSelection';

export interface FlowSummaryState {
  content: string;
  savedContent: string;
  isLoading: boolean;
  isGenerating: boolean;
  isSaving: boolean;
  isEditing: boolean;
  error: string | null;
}

export const initialFlowSummaryState: FlowSummaryState = {
  content: '',
  savedContent: '',
  isLoading: true,
  isGenerating: false,
  isSaving: false,
  isEditing: false,
  error: null,
};

/** Flow 级临时 UI 状态；不写入 localStorage，摘要文件仍是唯一持久化来源。 */
export const flowSummaryStatesAtom = atom<Record<string, FlowSummaryState>>({});

interface SummaryResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function getResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as SummaryResponse<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.error || fallback);
  }
  return payload.data;
}

export async function fetchFlowSummary(projectId: string, flowId: string): Promise<string> {
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/summary?projectId=${encodeURIComponent(projectId)}`);
  const data = await getResponse<{ content: string }>(response, '读取摘要失败');
  return data.content;
}

/** 草稿请求只发送模型偏好，绝不从浏览器提交 Flow 正文。 */
export async function generateFlowSummaryDraft(
  projectId: string,
  flowId: string,
  selection: AgentModelSelection,
): Promise<{ draft: string; model: string }> {
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/summary/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, channelId: selection.channelId, model: selection.model }),
  });
  return getResponse<{ draft: string; model: string }>(response, '生成摘要草稿失败');
}

export async function saveFlowSummary(projectId: string, flowId: string, content: string): Promise<void> {
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/summary`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, content }),
  });
  await getResponse<null>(response, '保存摘要失败');
}
