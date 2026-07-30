import { describe, expect, it } from 'vitest';
import { createPlanModeTools, PiRuntime } from '../pi-runtime.js';

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
  it('turn_start 递增序号，turn_end 返回成功写入的文件改动列表', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    // 首轮：write 两个文件
    expect(mapEvent({ type: 'turn_start' })).toMatchObject({ type: 'turn_start', turnIndex: 1 });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'w1', toolName: 'write', args: { path: '/a.ts' } });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'w2', toolName: 'write', args: { path: '/b.ts' } });
    mapEvent({ type: 'tool_execution_end', toolCallId: 'w1', toolName: 'write', isError: false, result: {} });
    mapEvent({ type: 'tool_execution_end', toolCallId: 'w2', toolName: 'write', isError: false, result: {} });
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
    mapEvent({ type: 'tool_execution_end', toolCallId: 'e1', toolName: 'edit', isError: false, result: {} });
    mapEvent({ type: 'tool_execution_end', toolCallId: 'w1', toolName: 'write', isError: false, result: {} });
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

  it('Given write 执行失败, When 轮次结束, Then 不把暂存路径算作文件改动', () => {
    const runtime = new PiRuntime();
    const mapEvent = (runtime as unknown as {
      mapEvent: (event: unknown) => unknown;
    }).mapEvent.bind(runtime);

    mapEvent({ type: 'turn_start' });
    mapEvent({ type: 'tool_execution_start', toolCallId: 'failed-write', toolName: 'write', args: { path: '/not-written.ts' } });
    mapEvent({ type: 'tool_execution_end', toolCallId: 'failed-write', toolName: 'write', isError: true, result: { error: '磁盘不可写' } });

    expect(mapEvent({ type: 'turn_end' })).toMatchObject({
      type: 'turn_end',
      filesChanged: [],
    });
  });

  it('Given Plan Mode 工具, When 构建运行时工具集, Then 注册 EnterPlanMode 和 ExitPlanMode 且不执行副作用', async () => {
    const tools = createPlanModeTools();

    expect(tools.map((tool) => tool.name)).toEqual(['EnterPlanMode', 'ExitPlanMode']);
    await expect(tools[0]!.execute('enter-1', {})).resolves.toMatchObject({
      content: [{ type: 'text', text: expect.stringContaining('已进入计划模式') }],
    });
    await expect(tools[1]!.execute('exit-1', {})).resolves.toMatchObject({
      content: [{ type: 'text', text: expect.stringContaining('已退出计划模式') }],
    });
  });

  it('Given 同一运行时旧 prompt 延迟结束, When 新 prompt 已创建 AskUser, Then 旧收尾不影响新请求', async () => {
    const runtime = new PiRuntime();
    const promptResolvers: Array<() => void> = [];
    const fakeSession = {
      subscribe: () => () => {},
      prompt: () => new Promise<void>((resolve) => promptResolvers.push(resolve)),
    };
    (runtime as unknown as { session: typeof fakeSession }).session = fakeSession;

    runtime.prompt('旧请求');
    const newStream = runtime.prompt('新请求');
    const manager = (runtime as unknown as {
      askUserManager: {
        request: (questions: Array<{ header: string; question: string }>) => Promise<unknown>;
        resolve: (requestId: string, answers: Record<string, string>) => boolean;
      };
    }).askUserManager;

    const answer = manager.request([{ header: 'new', question: '新问题' }]);
    const iterator = newStream[Symbol.asyncIterator]();
    const firstEvent = await iterator.next();
    expect(firstEvent.value).toMatchObject({ type: 'ask_user', questions: [{ header: 'new' }] });
    const requestId = (firstEvent.value as { requestId: string }).requestId;

    promptResolvers[0]!();
    await Promise.resolve();
    await Promise.resolve();

    const laterAnswer = manager.request([{ header: 'later', question: '旧轮次收尾后的问题' }]);
    const secondEvent = await iterator.next();
    expect(secondEvent.value).toMatchObject({ type: 'ask_user', questions: [{ header: 'later' }] });
    const laterRequestId = (secondEvent.value as { requestId: string }).requestId;

    expect(manager.resolve(requestId, { new: '新答案' })).toBe(true);
    expect(manager.resolve(laterRequestId, { later: '仍在新流' })).toBe(true);
    await expect(answer).resolves.toEqual({ answers: { new: '新答案' } });
    await expect(laterAnswer).resolves.toEqual({ answers: { later: '仍在新流' } });
  });
});
