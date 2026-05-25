import type { Channel, ChannelCreateInput, ChannelUpdateInput, ChannelTestResult, FetchModelsResult, ProviderType } from '../types';

export async function listChannels(): Promise<Channel[]> {
  const res = await fetch('/api/channels');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '获取渠道失败');
  return data.data.channels;
}

export async function createChannel(input: ChannelCreateInput): Promise<Channel> {
  const res = await fetch('/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '创建渠道失败');
  return data.data.channel;
}

export async function updateChannel(id: string, input: ChannelUpdateInput): Promise<Channel> {
  const res = await fetch(`/api/channels/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '更新渠道失败');
  return data.data.channel;
}

export async function deleteChannel(id: string): Promise<void> {
  const res = await fetch(`/api/channels/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '删除渠道失败');
}

export async function testChannelDirect(
  provider: ProviderType,
  baseUrl: string,
  apiKey: string,
): Promise<ChannelTestResult> {
  const res = await fetch('/api/channels/test-direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, baseUrl, apiKey }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '测试失败');
  return data.data;
}

export async function fetchModels(
  provider: ProviderType,
  baseUrl: string,
  apiKey: string,
): Promise<FetchModelsResult> {
  const res = await fetch('/api/channels/fetch-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, baseUrl, apiKey }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '拉取模型失败');
  return data.data;
}
