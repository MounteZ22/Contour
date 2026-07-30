import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRequestError, sendChatMessageStream } from './aiApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const callbacks = () => ({
  onChunk: vi.fn(),
  onComplete: vi.fn(),
  onError: vi.fn(),
  onAborted: vi.fn(),
});

describe('Agent 结构化错误解析', () => {
  it('传递已脱敏的工具参数和结果，但忽略模型原始推理片段', async () => {
    const encoded = new TextEncoder().encode([
      'data: {"type":"agent_start"}',
      'data: {"type":"thinking_delta","delta":"不应展示的模型原始推理"}',
      'data: {"type":"tool_call_start","toolCallId":"call-1","toolName":"read","input":{"path":"notes.md","token":"[已隐藏]"}}',
      'data: {"type":"tool_call_end","toolCallId":"call-1","toolName":"read","isError":false,"result":"{\\n  \\"content\\": \\"ok\\"\\n}"}',
      'data: {"type":"done"}',
      '',
    ].join('\n\n'));
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
    const handlers = {
      ...callbacks(),
      onToolActivity: vi.fn(),
      onProcessActivity: vi.fn(),
    };

    await sendChatMessageStream('读取文件', [], handlers);

    expect(handlers.onToolActivity).toHaveBeenNthCalledWith(1, {
      id: 'call-1',
      toolName: 'read',
      status: 'running',
      input: { path: 'notes.md', token: '[已隐藏]' },
    });
    expect(handlers.onToolActivity).toHaveBeenNthCalledWith(2, {
      id: 'call-1',
      toolName: 'read',
      status: 'done',
      result: '{\n  "content": "ok"\n}',
    });
    expect(handlers.onProcessActivity).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-start',
      label: '正在准备回答',
    }));
    expect(handlers.onProcessActivity).not.toHaveBeenCalledWith(expect.objectContaining({
      label: '不应展示的模型原始推理',
    }));
  });

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
    }, '');
    expect(handlers.onComplete).not.toHaveBeenCalled();
  });

  it('SSE 出错时将已收到的文本交给重试逻辑', async () => {
    const encoded = new TextEncoder().encode(
      'data: {"type":"text_delta","delta":"已经生成的内容"}\n\ndata: {"type":"error","message":"服务中断"}\n\n',
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

    expect(handlers.onChunk).toHaveBeenCalledWith('已经生成的内容');
    expect(handlers.onError).toHaveBeenCalledWith(expect.any(Object), '已经生成的内容');
  });

  it('超过 120 秒未收到 SSE 数据时中止请求并报告可重试错误', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    )));
    const handlers = callbacks();
    const promise = sendChatMessageStream('你好', [], handlers);

    await vi.advanceTimersByTimeAsync(120_000);
    await promise;

    expect(handlers.onError).toHaveBeenCalledWith({
      code: 'network_error',
      title: '生成超时',
      message: '超过 120 秒未收到生成数据，请检查网络后重试。',
      canRetry: true,
    }, '');
    expect(handlers.onAborted).not.toHaveBeenCalled();
  });

  it('turn_start / turn_end 事件应触发对应回调并传递轮次与文件改动', async () => {
    const encoded = new TextEncoder().encode([
      'data: {"type":"turn_start","turnIndex":1}',
      'data: {"type":"text_delta","delta":"我来修改几个文件。"}',
      'data: {"type":"turn_end","turnIndex":1,"filesChanged":[]}',
      'data: {"type":"turn_start","turnIndex":2}',
      'data: {"type":"tool_call_start","toolCallId":"w1","toolName":"write","input":{"path":"/a.ts"}}',
      'data: {"type":"tool_call_end","toolCallId":"w1","toolName":"write","isError":false,"result":"ok"}',
      'data: {"type":"turn_end","turnIndex":2,"filesChanged":["/a.ts"]}',
      'data: {"type":"done"}',
      '',
    ].join('\n\n'));
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
    const onTurnStart = vi.fn();
    const onTurnEnd = vi.fn();
    const handlers = { ...callbacks(), onTurnStart, onTurnEnd };

    await sendChatMessageStream('修改文件', [], handlers);

    expect(onTurnStart).toHaveBeenCalledTimes(2);
    expect(onTurnStart).toHaveBeenNthCalledWith(1, 1);
    expect(onTurnStart).toHaveBeenNthCalledWith(2, 2);
    expect(onTurnEnd).toHaveBeenCalledTimes(2);
    expect(onTurnEnd).toHaveBeenNthCalledWith(1, 1, []);
    expect(onTurnEnd).toHaveBeenNthCalledWith(2, 2, ['/a.ts']);
    expect(handlers.onChunk).toHaveBeenCalledWith('我来修改几个文件。');
    expect(handlers.onComplete).toHaveBeenCalledWith('我来修改几个文件。');
  });
});
