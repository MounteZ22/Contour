import { describe, expect, it } from 'vitest';
import { PiRuntime } from '../pi-runtime.js';

describe('PiRuntime 错误事件', () => {
  it('Pi 返回失败消息时输出结构化错误事件', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    const event = mapEvent({
      type: 'agent_end',
      messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'invalid api key' }],
      willRetry: false,
    });

    expect(event).toMatchObject({
      type: 'error',
      error: {
        code: 'invalid_api_key',
        title: 'API Key 无效',
        canRetry: false,
        action: 'open_settings',
      },
    });
  });
});
