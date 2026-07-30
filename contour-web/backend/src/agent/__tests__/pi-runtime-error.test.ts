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

  it('工具事件保留参数和结果，同时脱敏并限制展示长度', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    const start = mapEvent({
      type: 'tool_execution_start',
      toolCallId: 'call-1',
      toolName: 'read',
      args: { path: 'notes.md', apiKey: 'should-not-leak' },
    });
    const end = mapEvent({
      type: 'tool_execution_end',
      toolCallId: 'call-1',
      toolName: 'read',
      isError: false,
      result: { token: 'should-not-leak', content: `API_KEY=also-secret\n${'x'.repeat(13_000)}` },
    });

    expect(start).toMatchObject({
      type: 'tool_call_start',
      toolCallId: 'call-1',
      input: { path: 'notes.md', apiKey: '[已隐藏]' },
    });
    expect(end).toMatchObject({
      type: 'tool_call_end',
      toolCallId: 'call-1',
      result: expect.stringContaining('[已隐藏]'),
    });
    const result = (end as { result: string }).result;
    expect(result).not.toContain('also-secret');
    expect(result.length).toBeLessThanOrEqual(12_020);
  });

  it('不会把模型原始 thinking_delta 映射到产品事件', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    expect(mapEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: '模型内部推理' },
    })).toBeNull();
  });

  it('Given Pi 工具返回文本内容, When 映射工具完成事件, Then 前端收到原始文本而非外层包装对象', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    const end = mapEvent({
      type: 'tool_execution_end',
      toolCallId: 'task-1',
      toolName: 'TaskCreate',
      isError: false,
      result: {
        content: [{ type: 'text', text: '{"task":{"id":"1","subject":"核对数据"}}' }],
        details: {},
      },
    });

    expect(end).toMatchObject({
      type: 'tool_call_end',
      result: '{"task":{"id":"1","subject":"核对数据"}}',
    });
  });

  // ── Turn 追踪 ────────────────────────────────────────────────────────────
  it('turn_start 递增序号，turn_end 返回收集到的文件改动列表', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    // 首轮：write 两个文件
    expect(mapEvent({ type: 'turn_start' })).toMatchObject({ type: 'turn_start', turnIndex: 1 });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'w1', toolName: 'write', args: { path: '/a.ts' } });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'w2', toolName: 'write', args: { path: '/b.ts' } });
    expect(mapEvent({ type: 'turn_end' })).toMatchObject({
      type: 'turn_end',
      turnIndex: 1,
      filesChanged: ['/a.ts', '/b.ts'],
    });

    // 第二轮：无文件改动
    expect(mapEvent({ type: 'turn_start' })).toMatchObject({ type: 'turn_start', turnIndex: 2 });
    expect(mapEvent({ type: 'turn_end' })).toMatchObject({
      type: 'turn_end',
      turnIndex: 2,
      filesChanged: [],
    });
  });

  it('同一文件多次 write/edit 只记录一次（去重）', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    mapEvent({ type: 'turn_start' });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'e1', toolName: 'edit', args: { path: '/dup.ts' } });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'w1', toolName: 'write', args: { path: '/dup.ts' } });
    const end = mapEvent({ type: 'turn_end' }) as { type: string; filesChanged: string[] };
    expect(end.filesChanged).toEqual(['/dup.ts']);
  });

  it('非 write/edit 工具不记录文件改动', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    mapEvent({ type: 'turn_start' });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'r1', toolName: 'read', args: { path: '/notes.md' } });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'g1', toolName: 'grep', args: { pattern: 'TODO' } });
    const end = mapEvent({ type: 'turn_end' }) as { type: string; filesChanged: string[] };
    expect(end.filesChanged).toEqual([]);
  });
});
