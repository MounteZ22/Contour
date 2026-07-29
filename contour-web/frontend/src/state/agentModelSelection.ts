import { useCallback, useEffect } from 'react';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface AgentModelOption {
  channelId: string;
  channelName: string;
  modelId: string;
  modelName: string;
}

export interface AgentModelSelection {
  channelId: string;
  model: string;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 每个会话独立保存模型偏好，切换只会影响其后续消息。 */
export const sessionModelSelectionsAtom = atomWithStorage<Record<string, AgentModelSelection>>(
  'contour:agent-model-selections',
  {},
);

const agentModelOptionsAtom = atom<AgentModelOption[]>([]);
const agentModelOptionsStatusAtom = atom<LoadStatus>('idle');

async function fetchAgentModelOptions(): Promise<AgentModelOption[]> {
  const response = await fetch('/api/channels/agent-models');
  if (!response.ok) throw new Error('获取可用模型失败');
  const payload = await response.json() as { success?: boolean; data?: { models?: AgentModelOption[] } };
  if (!payload.success || !Array.isArray(payload.data?.models)) {
    throw new Error('获取可用模型失败');
  }
  return payload.data.models;
}

/**
 * 管理当前会话的模型选择。列表加载失败时不传 channelId/model，后端会继续使用默认渠道。
 */
export function useSessionModelSelection(sessionId: string) {
  const [selections, setSelections] = useAtom(sessionModelSelectionsAtom);
  const [options, setOptions] = useAtom(agentModelOptionsAtom);
  const [status, setStatus] = useAtom(agentModelOptionsStatusAtom);

  useEffect(() => {
    if (status !== 'idle') return;
    let cancelled = false;
    setStatus('loading');
    fetchAgentModelOptions()
      .then((nextOptions) => {
        if (cancelled) return;
        setOptions(nextOptions);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [setOptions, setStatus, status]);

  const storedSelection = selections[sessionId];
  const selectedOption = storedSelection
    ? options.find((option) => option.channelId === storedSelection.channelId && option.modelId === storedSelection.model)
    : undefined;
  const effectiveOption = selectedOption ?? options[0];

  const selectModel = (option: AgentModelOption) => {
    setSelections((current) => ({
      ...current,
      [sessionId]: { channelId: option.channelId, model: option.modelId },
    }));
  };

  /** 首条消息创建真实会话后，把起始页的选择交给新会话。 */
  const transferTo = useCallback((targetSessionId: string) => {
    const current = selections[sessionId];
    if (!current || targetSessionId === sessionId) return;
    setSelections((previous) => ({
      ...previous,
      [targetSessionId]: current,
    }));
  }, [selections, sessionId, setSelections]);

  return {
    options,
    status,
    selectedOption: effectiveOption,
    selection: effectiveOption
      ? { channelId: effectiveOption.channelId, model: effectiveOption.modelId }
      : undefined,
    selectModel,
    transferTo,
  };
}
