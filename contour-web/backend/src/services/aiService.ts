import { getChannelById, listChannels } from './channelManager.js';
import { executeTool } from '../tools/toolRegistry.js';
import type { ToolDefinition } from '../tools/toolRegistry.js';
import type { ProviderType } from '../types.js';

interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
}

/** 流式事件类型 */
export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool'; toolName: string; status: 'running' | 'done'; input?: Record<string, unknown>; result?: string }
  | { type: 'error'; error: string };

interface ChatWithToolsOptions extends ChatOptions {
  tools?: ToolDefinition[];
}

const MAX_TOOL_ROUNDS = 10;

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

/** 流式发送聊天消息，返回 AsyncGenerator 逐块产出文本 */
export async function* sendChatMessageStream(options: ChatOptions): AsyncGenerator<string> {
  const channel = getDefaultChannel();
  if (!channel) {
    throw new Error('未配置可用的 AI 渠道，请先在设置中配置模型');
  }

  const model = options.model || channel.models.find((m) => m.enabled)?.id || 'claude-sonnet-4-7';
  const url = getRequestUrl(channel.provider, channel.baseUrl);
  const headers = getRequestHeaders(channel.provider, channel.apiKey);

  console.log('[SSE] Requesting:', url, 'model:', model, 'provider:', channel.provider);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userMessage }],
      stream: true,
    }),
  });

  console.log('[SSE] Response status:', response.status, 'content-type:', response.headers.get('content-type'));

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[SSE] Error response:', text.slice(0, 500));
    throw new Error(`AI 请求失败 (${response.status}): ${text.slice(0, 300)}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;
  let yieldCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[SSE] Stream done. Chunks:', chunkCount, 'Yields:', yieldCount);
        break;
      }

      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Log first few raw lines for debugging
        if (chunkCount <= 3 && line.trim()) {
          console.log('[SSE] Raw line:', line.slice(0, 200));
        }

        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const event = JSON.parse(data) as {
            type: string;
            delta?: { type?: string; text?: string; stop_reason?: string };
          };

          if (event.type === 'content_block_delta' && event.delta?.text) {
            yieldCount++;
            yield event.delta.text;
          }

          if (event.type === 'message_delta' && event.delta?.stop_reason) {
            console.log('[SSE] Stream stopped:', event.delta.stop_reason);
            return;
          }

          if (event.type === 'message_stop') {
            console.log('[SSE] Message stop received');
            return;
          }
        } catch {
          // ignore unparseable SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 带 Tool Use 的流式聊天
 *
 * 当 LLM 返回 tool_use 块时，自动执行工具并将结果发回，
 * 循环直到 LLM 给出文本回复或达到最大轮数。
 */
export async function* sendChatMessageWithTools(
  options: ChatWithToolsOptions,
): AsyncGenerator<StreamEvent> {
  const channel = getDefaultChannel();
  if (!channel) {
    throw new Error('未配置可用的 AI 渠道，请先在设置中配置模型');
  }

  const model = options.model || channel.models.find((m) => m.enabled)?.id || 'claude-sonnet-4-7';
  const url = getRequestUrl(channel.provider, channel.baseUrl);
  const headers = getRequestHeaders(channel.provider, channel.apiKey);

  // 消息历史（多轮 tool use 需要累积）
  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'user', content: options.userMessage },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      system: options.systemPrompt,
      messages,
      stream: true,
    };

    // 第一轮传入工具定义
    if (options.tools && options.tools.length > 0 && round === 1) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`AI 请求失败 (${response.status}): ${text.slice(0, 300)}`);
    }

    // 解析 SSE 流
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // 本轮收集的数据
    let textContent = '';
    const toolCalls: Array<{ id: string; name: string; inputJson: string }> = [];
    let currentToolCall: { id: string; name: string; inputJson: string } | null = null;
    let stopReason = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as {
              type: string;
              index?: number;
              content_block?: { type: string; id?: string; name?: string };
              delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
            };

            // 文本增量
            if (event.type === 'content_block_delta' && event.delta?.text) {
              textContent += event.delta.text;
              yield { type: 'text', content: event.delta.text };
            }

            // tool_use 块开始
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              currentToolCall = {
                id: event.content_block.id || '',
                name: event.content_block.name || '',
                inputJson: '',
              };
            }

            // tool_use 参数增量
            if (event.type === 'content_block_delta' && event.delta?.partial_json && currentToolCall) {
              currentToolCall.inputJson += event.delta.partial_json;
            }

            // tool_use 块结束
            if (event.type === 'content_block_stop' && currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }

            // 停止原因
            if (event.type === 'message_delta' && event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
          } catch {
            // ignore unparseable SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 如果没有 tool_use 或者不是因为 tool_use 停止，结束循环
    if (toolCalls.length === 0 || stopReason !== 'tool_use') {
      return;
    }

    // 构造 assistant 消息（含 text + tool_use 块）
    const assistantContent: Array<Record<string, unknown>> = [];
    if (textContent) {
      assistantContent.push({ type: 'text', text: textContent });
    }
    for (const tc of toolCalls) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = tc.inputJson ? JSON.parse(tc.inputJson) : {};
      } catch {
        // malformed JSON
      }
      assistantContent.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: parsedInput,
      });
    }
    messages.push({ role: 'assistant', content: assistantContent });

    // 执行工具并构造 tool_result
    const toolResults: Array<Record<string, unknown>> = [];
    for (const tc of toolCalls) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = tc.inputJson ? JSON.parse(tc.inputJson) : {};
      } catch {
        // malformed JSON
      }

      yield { type: 'tool', toolName: tc.name, status: 'running', input: parsedInput };

      let result: string;
      try {
        result = await executeTool(tc.name, parsedInput);
      } catch (err) {
        result = JSON.stringify({ error: err instanceof Error ? err.message : '工具执行失败' });
      }

      yield { type: 'tool', toolName: tc.name, status: 'done', input: parsedInput, result };

      toolResults.push({
        type: 'tool_result',
        tool_use_id: tc.id,
        content: result,
      });
    }

    // tool_result 作为 user 消息发回（Anthropic 协议）
    messages.push({ role: 'user', content: toolResults });
    // 继续循环，让 LLM 基于工具结果生成回复
  }

  // 达到最大轮数
  yield { type: 'error', error: `工具调用轮数超过上限 (${MAX_TOOL_ROUNDS})` };
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
