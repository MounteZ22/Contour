import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRequestError, sendChatMessageStream } from './aiApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

const callbacks = () => ({
  onChunk: vi.fn(),
  onComplete: vi.fn(),
  onError: vi.fn(),
});

describe('Agent 结构化错误解析', () => {
  it('HTTP 错误保留后端给出的类型和操作建议', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: {
          code: 'invalid_api_key',
          title: 'API Key 无效',
          message: '请更新 API Key。',
          canRetry: false,
          action: 'open_settings',
        },
      }),
    } as Response));

    const promise = sendChatMessageStream('你好', [], callbacks());
    await expect(promise).rejects.toBeInstanceOf(AgentRequestError);
    await expect(promise).rejects.toMatchObject({
      details: { code: 'invalid_api_key', canRetry: false, action: 'open_settings' },
    });
  });

  it('SSE 错误交给界面时仍是完整对象', async () => {
    const encoded = new TextEncoder().encode(
      'data: {"type":"error","error":{"code":"rate_limited","title":"请求过于频繁","message":"请稍后重试。","canRetry":true}}\n\n',
    );
    let readCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => readCount++ === 0 ? { done: false, value: encoded } : { done: true },
          releaseLock: vi.fn(),
        }),
      },
    } as unknown as Response));
    const handlers = callbacks();

    await sendChatMessageStream('你好', [], handlers);

    expect(handlers.onError).toHaveBeenCalledWith({
      code: 'rate_limited',
      title: '请求过于频繁',
      message: '请稍后重试。',
      canRetry: true,
    });
    expect(handlers.onComplete).not.toHaveBeenCalled();
  });
});
