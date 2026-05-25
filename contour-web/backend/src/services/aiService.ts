import { getChannelById, listChannels } from './channelManager.js';
import type { ProviderType } from '../types.js';

interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
}

/** 获取第一个启用的 Anthropic 兼容渠道 */
function getDefaultChannel() {
  const channels = listChannels();
  return channels.find((c) => c.enabled);
}

/** 规范化 Anthropic Base URL */
function normalizeAnthropicBaseUrl(baseUrl: string): string {
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function getRequestUrl(provider: ProviderType, baseUrl: string): string {
  const isNonVersionedPath =
    provider === 'deepseek' || provider === 'kimi-api' || provider === 'kimi-coding';
  const normalized = isNonVersionedPath
    ? normalizeBaseUrl(baseUrl)
    : normalizeAnthropicBaseUrl(baseUrl);
  return `${normalized}/messages`;
}

function getRequestHeaders(provider: ProviderType, apiKey: string): Record<string, string> {
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

  return headers;
}

export async function sendChatMessage(options: ChatOptions): Promise<string> {
  const channel = getDefaultChannel();
  if (!channel) {
    throw new Error('未配置可用的 AI 渠道，请先在设置中配置模型');
  }

  const model = options.model || channel.models.find((m) => m.enabled)?.id || 'claude-sonnet-4-7';
  const url = getRequestUrl(channel.provider, channel.baseUrl);
  const headers = getRequestHeaders(channel.provider, channel.apiKey);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userMessage }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI 请求失败 (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const textBlocks = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text || '')
    .filter(Boolean);

  return textBlocks.join('');
}

/** 测试 LLM 连接 */
export async function testLLMConnection(): Promise<{ success: boolean; message: string }> {
  const channel = getDefaultChannel();
  if (!channel) {
    return { success: false, message: '未配置可用的 AI 渠道' };
  }

  const { testChannelDirect } = await import('./channelManager.js');
  return testChannelDirect({
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  });
}
