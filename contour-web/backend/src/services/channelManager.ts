import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';
import {
  PROVIDER_DEFAULT_URLS,
  AGENT_COMPATIBLE_PROVIDERS,
} from '../types.js';
import type {
  Channel,
  ChannelCreateInput,
  ChannelUpdateInput,
  ChannelsConfig,
  ChannelTestResult,
  ChannelModel,
  FetchModelsInput,
  FetchModelsResult,
  ProviderType,
} from '../types.js';

const CONFIG_VERSION = 1;
const CHANNELS_FILE = path.join(CONFIG.CONFIG_DIR, 'channels.json');

/** 供 Agent 模型选择器使用的安全展示数据，绝不包含渠道凭据。 */
export interface AgentModelOption {
  channelId: string;
  channelName: string;
  modelId: string;
  modelName: string;
}

/** 读取渠道配置文件 */
async function readConfig(): Promise<ChannelsConfig> {
  try {
    const raw = await fs.readFile(CHANNELS_FILE, 'utf-8');
    return JSON.parse(raw) as ChannelsConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: CONFIG_VERSION, channels: [] };
    }
    console.error('[channelManager] 读取配置失败:', error);
    return { version: CONFIG_VERSION, channels: [] };
  }
}

/** 写入渠道配置文件 */
async function writeConfig(config: ChannelsConfig): Promise<void> {
  try {
    if (!existsSync(CONFIG.CONFIG_DIR)) {
      mkdirSync(CONFIG.CONFIG_DIR, { recursive: true });
    }
    await fs.writeFile(CHANNELS_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('[channelManager] 写入配置失败:', error);
    throw new Error('写入渠道配置失败');
  }
}

/** 规范化 Anthropic Base URL */
export function normalizeAnthropicBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '');
  url = url.replace(/\/messages$/, '');
  if (!url.match(/\/v\d+$/)) {
    try {
      const pathname = new URL(url).pathname;
      if (pathname === '/' || pathname === '') {
        url = `${url}/v1`;
      }
    } catch {
      url = `${url}/v1`;
    }
  }
  return url;
}

/** 规范化通用 Base URL */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** 获取测试用的默认模型 */
function getTestModel(provider: ProviderType): string {
  switch (provider) {
    case 'deepseek':
      return 'deepseek-chat';
    case 'kimi-api':
      return 'kimi-latest';
    case 'kimi-coding':
      return 'kimi-for-coding';
    default:
      return 'claude-sonnet-4-7';
  }
}

// ===== 渠道 CRUD =====

export async function listChannels(): Promise<Channel[]> {
  const config = await readConfig();
  return config.channels;
}

export async function getChannelById(id: string): Promise<Channel | undefined> {
  const config = await readConfig();
  return config.channels.find((c) => c.id === id);
}

/** 返回所有可用于 Agent 的已启用模型，不向调用方暴露 API Key 或 Base URL。 */
export async function listAgentModelOptions(): Promise<AgentModelOption[]> {
  const channels = await listChannels();
  return channels.flatMap((channel) => {
    if (!channel.enabled || !AGENT_COMPATIBLE_PROVIDERS.has(channel.provider)) return [];
    return channel.models
      .filter((model) => model.enabled)
      .map((model) => ({
        channelId: channel.id,
        channelName: channel.name,
        modelId: model.id,
        modelName: model.name,
      }));
  });
}

export async function createChannel(input: ChannelCreateInput): Promise<Channel> {
  const config = await readConfig();
  const now = Date.now();

  const channel: Channel = {
    id: randomUUID(),
    name: input.name,
    provider: input.provider,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    models: input.models,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  };

  config.channels.push(channel);
  await writeConfig(config);
  console.log(`[channelManager] 已创建渠道: ${channel.name} (${channel.id})`);
  return channel;
}

export async function updateChannel(id: string, input: ChannelUpdateInput): Promise<Channel> {
  const config = await readConfig();
  const index = config.channels.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new Error(`渠道不存在: ${id}`);
  }

  const existing = config.channels[index]!;
  const updated: Channel = {
    ...existing,
    name: input.name ?? existing.name,
    provider: input.provider ?? existing.provider,
    baseUrl: input.baseUrl ?? existing.baseUrl,
    apiKey: input.apiKey !== undefined ? input.apiKey : existing.apiKey,
    models: input.models ?? existing.models,
    enabled: input.enabled ?? existing.enabled,
    updatedAt: Date.now(),
  };

  config.channels[index] = updated;
  await writeConfig(config);
  console.log(`[channelManager] 已更新渠道: ${updated.name} (${updated.id})`);
  return updated;
}

export async function deleteChannel(id: string): Promise<void> {
  const config = await readConfig();
  const index = config.channels.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new Error(`渠道不存在: ${id}`);
  }

  const removed = config.channels.splice(index, 1)[0]!;
  await writeConfig(config);
  console.log(`[channelManager] 已删除渠道: ${removed.name} (${removed.id})`);
}

// ===== 测试连接 =====

export async function testChannelDirect(
  input: FetchModelsInput,
): Promise<ChannelTestResult> {
  try {
    if (!AGENT_COMPATIBLE_PROVIDERS.has(input.provider)) {
      return { success: false, message: `不支持的供应商: ${input.provider}` };
    }
    return await testAnthropicCompatible(input.baseUrl, input.apiKey, input.provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return { success: false, message: `连接测试失败: ${message}` };
  }
}

export async function testChannelById(channelId: string): Promise<ChannelTestResult> {
  const channel = await getChannelById(channelId);
  if (!channel) {
    return { success: false, message: '渠道不存在' };
  }
  return testChannelDirect({
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  });
}

/** 测试 Anthropic 兼容 API */
async function testAnthropicCompatible(
  baseUrl: string,
  apiKey: string,
  provider: ProviderType,
): Promise<ChannelTestResult> {
  const isNonVersionedPath =
    provider === 'deepseek' || provider === 'kimi-api' || provider === 'kimi-coding';
  const url = isNonVersionedPath
    ? normalizeBaseUrl(baseUrl)
    : normalizeAnthropicBaseUrl(baseUrl);

  const testModel = getTestModel(provider);

  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };

  if (provider === 'kimi-coding') {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['User-Agent'] = 'KimiCLI/1.3';
  } else {
    headers['x-api-key'] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${url}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: testModel,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });

  if (response.ok) {
    return { success: true, message: '连接成功' };
  }

  if (response.status === 401) {
    const text = await response.text().catch(() => '');
    return { success: false, message: `API Key 无效${text ? `: ${text.slice(0, 150)}` : ''}` };
  }

  if (response.status === 404) {
    return { success: false, message: '端点不存在，请检查 Base URL (404)' };
  }

  const text = await response.text().catch(() => '');
  return { success: false, message: `请求失败 (${response.status}): ${text.slice(0, 200)}` };
}

// ===== 拉取模型列表 =====

export async function fetchModels(
  input: FetchModelsInput,
): Promise<FetchModelsResult> {
  try {
    if (!AGENT_COMPATIBLE_PROVIDERS.has(input.provider)) {
      return { success: false, message: `不支持的供应商: ${input.provider}`, models: [] };
    }
    return await fetchAnthropicCompatibleModels(input.baseUrl, input.apiKey, input.provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return { success: false, message: `拉取模型失败: ${message}`, models: [] };
  }
}

interface AnthropicModelItem {
  id: string;
  display_name?: string;
}

async function fetchAnthropicCompatibleModels(
  baseUrl: string,
  apiKey: string,
  provider: ProviderType,
): Promise<FetchModelsResult> {
  const isNonVersionedPath =
    provider === 'deepseek' || provider === 'kimi-api' || provider === 'kimi-coding';
  const url = isNonVersionedPath
    ? normalizeBaseUrl(baseUrl)
    : normalizeAnthropicBaseUrl(baseUrl);

  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
  };

  if (provider === 'kimi-coding') {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['User-Agent'] = 'KimiCLI/1.3';
  } else {
    headers['x-api-key'] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${url}/models`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    const text = await response.text().catch(() => '');
    return { success: false, message: `API Key 无效${text ? `: ${text.slice(0, 150)}` : ''}`, models: [] };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { success: false, message: `请求失败 (${response.status}): ${text.slice(0, 200)}`, models: [] };
  }

  const data = (await response.json()) as { data?: AnthropicModelItem[] };
  const items = data.data ?? [];

  const models: ChannelModel[] = items.map((item) => ({
    id: item.id,
    name: item.display_name || item.id,
    enabled: true,
  }));

  return {
    success: true,
    message: `成功获取 ${models.length} 个模型`,
    models,
  };
}
