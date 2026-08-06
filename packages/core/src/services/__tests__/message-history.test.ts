import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMessageHistoryService, parseSessionJsonl, parseSessionJsonlStream } from '../message-history.js';

// ── 测试用 fixture（仓库内联构造，不含真实用户数据）────────────────────────────

/** 构造一条 Pi v3 最终 message 记录（简化到测试关注字段） */
function messageRecord(id: string, message: Record<string, unknown>): string {
  return JSON.stringify({ type: 'message', id, message });
}

const SESSION_HEADER = JSON.stringify({ type: 'session', version: 3, id: 'sdk-session-1' });

function textBlock(text: string): Record<string, unknown> {
  return { type: 'text', text };
}

function toolCallBlock(id: string, name: string, args: Record<string, unknown>): Record<string, unknown> {
  return { type: 'toolCall', id, name, arguments: args };
}

function textContent(text: string): Record<string, unknown> {
  return { role: 'user', content: [textBlock(text)] };
}

function toolResultRecord(id: string, toolCallId: string, toolName: string, text: string, isError = false): string {
  return messageRecord(id, {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [textBlock(text)],
    isError,
  });
}

const tmpRoot = path.join(os.tmpdir(), `contour-message-history-${Date.now()}`);

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ── 解析器：纯文本 ──────────────────────────────────────────────────────────────

describe('parseSessionJsonl 纯文本恢复', () => {
  it('Given 仅有 user 与 assistant 的 text 块, When 解析, Then 输出对应的 ChatMessage 且 turnIndex 从 1 递增', () => {
    const jsonl = [
      SESSION_HEADER,
      messageRecord('u1', textContent('第一个问题')),
      messageRecord('a1', { role: 'assistant', content: [textBlock('第一个回答')] }),
      messageRecord('u2', textContent('第二个问题')),
      messageRecord('a2', { role: 'assistant', content: [textBlock('第二个回答')] }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages).toHaveLength(4);
    expect(messages[0]).toMatchObject({ id: 'u1', role: 'user', content: '第一个问题' });
    expect(messages[1]).toMatchObject({ id: 'a1', role: 'assistant', content: '第一个回答', turnIndex: 1 });
    expect(messages[2]).toMatchObject({ id: 'u2', role: 'user', content: '第二个问题' });
    expect(messages[3]).toMatchObject({ id: 'a2', role: 'assistant', content: '第二个回答', turnIndex: 2 });
  });

  it('Given assistant 的 content 是纯字符串, When 解析, Then 兼容旧格式直接采用', () => {
    const jsonl = [
      messageRecord('u1', textContent('问题')),
      messageRecord('a1', { role: 'assistant', content: '直接字符串回答' }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);
    expect(messages[1]?.content).toBe('直接字符串回答');
  });
});

// ── 解析器：工具调用与结果回填 ─────────────────────────────────────────────────

describe('parseSessionJsonl 工具活动', () => {
  it('Given assistant 同时发起多个 toolCall, When 后续 toolResult 按 toolCallId 回填, Then 并行活动结果与状态正确', () => {
    const jsonl = [
      messageRecord('u1', textContent('并行探索')),
      messageRecord('a1', {
        role: 'assistant',
        content: [
          textBlock('我来并行查看'),
          toolCallBlock('tool-A', 'ls', { path: 'src' }),
          toolCallBlock('tool-B', 'grep', { pattern: 'TODO' }),
        ],
      }),
      toolResultRecord('r1', 'tool-A', 'ls', 'src/index.ts'),
      toolResultRecord('r2', 'tool-B', 'grep', '2 处 TODO'),
      messageRecord('a2', { role: 'assistant', content: [textBlock('结论')] }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages).toHaveLength(3);
    const assistant = messages[1]!;
    expect(assistant.content).toBe('我来并行查看');
    expect(assistant.toolActivities).toHaveLength(2);
    expect(assistant.toolActivities![0]).toEqual({
      id: 'tool-A',
      toolName: 'ls',
      status: 'done',
      input: { path: 'src' },
      result: 'src/index.ts',
    });
    expect(assistant.toolActivities![1]).toEqual({
      id: 'tool-B',
      toolName: 'grep',
      status: 'done',
      input: { pattern: 'TODO' },
      result: '2 处 TODO',
    });
  });

  it('Given assistant 仅有 toolCall 没有文本, When 解析, Then 仍生成 content 为空串的 ChatMessage', () => {
    const jsonl = [
      messageRecord('u1', textContent('工具轮')),
      messageRecord('a1', {
        role: 'assistant',
        content: [toolCallBlock('tool-C', 'read', { path: 'a.md' })],
      }),
      toolResultRecord('r1', 'tool-C', 'read', '内容'),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages[1]).toMatchObject({ role: 'assistant', content: '', turnIndex: 1 });
    expect(messages[1]!.toolActivities).toHaveLength(1);
  });

  it('Given toolResult 标记 isError, When 回填, Then 活动状态为 error 且保留错误文本', () => {
    const jsonl = [
      messageRecord('u1', textContent('失败调用')),
      messageRecord('a1', {
        role: 'assistant',
        content: [toolCallBlock('tool-D', 'read', { path: 'missing.md' })],
      }),
      toolResultRecord('r1', 'tool-D', 'read', 'ENOENT: 文件不存在', true),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages[1]!.toolActivities![0]).toMatchObject({
      id: 'tool-D',
      status: 'error',
      result: 'ENOENT: 文件不存在',
    });
  });

  it('Given 错误 toolResult 无文本, When 回填, Then result 使用兜底文案', () => {
    const jsonl = [
      messageRecord('u1', textContent('失败调用')),
      messageRecord('a1', {
        role: 'assistant',
        content: [toolCallBlock('tool-E', 'bash', { command: 'false' })],
      }),
      messageRecord('r1', { role: 'toolResult', toolCallId: 'tool-E', toolName: 'bash', content: [], isError: true }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages[1]!.toolActivities![0]).toMatchObject({ status: 'error', result: '工具执行出错' });
  });
});

// ── 解析器：filesChanged 推导 ─────────────────────────────────────────────────

describe('parseSessionJsonl filesChanged', () => {
  it('Given Write/Edit 的 arguments 含 path 或 file_path, When 解析, Then 去重后写入 filesChanged', () => {
    const jsonl = [
      messageRecord('u1', textContent('改文件')),
      messageRecord('a1', {
        role: 'assistant',
        content: [
          textBlock('开始修改'),
          toolCallBlock('tool-W1', 'Write', { path: 'a.md' }),
          toolCallBlock('tool-W2', 'Write', { path: 'a.md' }),
          toolCallBlock('tool-E1', 'Edit', { file_path: 'b.ts' }),
        ],
      }),
      toolResultRecord('r1', 'tool-W1', 'Write', 'ok'),
      toolResultRecord('r2', 'tool-W2', 'Write', 'ok'),
      toolResultRecord('r3', 'tool-E1', 'Edit', 'ok'),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages[1]!.filesChanged).toEqual(['a.md', 'b.ts']);
  });

  it('Given 非 Write/Edit 工具, When 解析, Then 不产生 filesChanged', () => {
    const jsonl = [
      messageRecord('u1', textContent('查询')),
      messageRecord('a1', {
        role: 'assistant',
        content: [toolCallBlock('tool-L', 'ls', { path: '.' })],
      }),
      toolResultRecord('r1', 'tool-L', 'ls', 'files'),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);
    expect(messages[1]!.filesChanged).toBeUndefined();
  });
});

// ── 解析器：容错 ───────────────────────────────────────────────────────────────

describe('parseSessionJsonl 容错', () => {
  it('Given JSONL 中含损坏行与非 message 记录, When 解析, Then 跳过且不影响其余消息', () => {
    const jsonl = [
      '{ not valid json',
      JSON.stringify({ type: 'session_info', title: '会话信息' }),
      messageRecord('u1', textContent('问题')),
      '{"type":"message","message":{"role":"assistant","content":[{broken',
      messageRecord('a1', { role: 'assistant', content: [textBlock('正常回答')] }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ id: 'u1', role: 'user', content: '问题' });
    expect(messages[1]).toMatchObject({ id: 'a1', role: 'assistant', content: '正常回答' });
  });

  it('Given system/thinking 内容与未知 role, When 解析, Then 不展示并跳过', () => {
    const jsonl = [
      messageRecord('u1', textContent('问题')),
      messageRecord('sys1', { role: 'system', content: [textBlock('系统提示')] }),
      messageRecord('th1', { role: 'thinking', content: [{ type: 'thinking', thinking: '推理过程' }] }),
      messageRecord('a1', {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '内部推理' },
          textBlock('可见回答'),
        ],
      }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ role: 'assistant', content: '可见回答' });
  });
});

// ── 解析器：fallback id 唯一性 ─────────────────────────────────────────────────

describe('parseSessionJsonl fallback id', () => {
  it('Given 多条记录缺 id 且与带 id 记录混排, When 解析, Then 兜底 id 全局唯一', () => {
    const noId = (message: Record<string, unknown>): string =>
      JSON.stringify({ type: 'message', message });
    const jsonl = [
      noId(textContent('问题一')),
      messageRecord('a1', { role: 'assistant', content: [textBlock('回答一')] }),
      noId(textContent('问题二')),
      noId({ role: 'assistant', content: [textBlock('回答二')] }),
      messageRecord('a3', { role: 'assistant', content: [textBlock('回答三')] }),
      noId({ role: 'assistant', content: [textBlock('回答四')] }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);
    const ids = messages.map((message) => message.id);

    expect(ids).toHaveLength(6);
    // 带 id 的记录保留原始 id；缺 id 记录使用 hist_N 且互不重复
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('hist_')).sort()).toEqual(['hist_0', 'hist_1', 'hist_2', 'hist_3']);
  });

  it('Given 全部记录缺 id, When 解析, Then 兜底 id 从 0 开始递增且唯一', () => {
    const noId = (message: Record<string, unknown>): string =>
      JSON.stringify({ type: 'message', message });
    const jsonl = [
      noId(textContent('问题一')),
      noId({ role: 'assistant', content: [textBlock('回答一')] }),
      noId(textContent('问题二')),
      noId({ role: 'assistant', content: [textBlock('回答二')] }),
    ].join('\n');

    const messages = parseSessionJsonl(jsonl);
    const ids = messages.map((message) => message.id);

    expect(ids).toEqual(['hist_0', 'hist_1', 'hist_2', 'hist_3']);
  });
});

// ── 服务：文件读取 + 缓存 ──────────────────────────────────────────────────────

describe('createMessageHistoryService 缓存', () => {
  function runtimeDir(name: string) {
    return path.join(tmpRoot, name);
  }

  async function writeSession(dataDir: string, projectId: string, sdkSessionId: string, jsonl: string): Promise<void> {
    const projectDir = path.join(dataDir, 'projects', projectId, 'sessions');
    const sessionDir = path.join(projectDir, 'session-1');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'index.json'), JSON.stringify([
      { id: 'session-1', title: '测试会话', createdAt: 1, updatedAt: 1, sdkSessionId },
    ]), 'utf-8');
    // 文件放在产品会话工作区内，且首行 session header id 与 sdkSessionId 一致，
    // 供 findPiSessionFile 按 readSdkSessionId 匹配
    const fileName = `${sdkSessionId}.jsonl`;
    const header = JSON.stringify({ type: 'session', version: 3, id: sdkSessionId });
    // 每行必须以换行结尾，模拟真实 JSONL 追加语义
    await fs.writeFile(path.join(sessionDir, fileName), `${header}\n${jsonl}\n`, 'utf-8');
  }

  function configFor(dir: string) {
    return {
      dataDir: dir,
      projectsDir: path.join(dir, 'projects'),
      vaultsDir: path.join(dir, 'vaults'),
      legacyVault: path.join(dir, 'legacy'),
      isDevelopment: true,
    };
  }

  it('Given 文件未变化, When 连续读取, Then 命中缓存并返回相同结果', async () => {
    const dir = runtimeDir('cache-hit');
    const sdkSessionId = 'sdk-cache-hit';
    const jsonl = [
      SESSION_HEADER,
      messageRecord('u1', textContent('问题')),
      messageRecord('a1', { role: 'assistant', content: [textBlock('回答')] }),
    ].join('\n');
    await writeSession(dir, 'project-a', sdkSessionId, jsonl);

    const service = createMessageHistoryService(configFor(dir));
    const first = await service.readSessionMessages('project-a', 'session-1');
    const second = await service.readSessionMessages('project-a', 'session-1');

    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it('Given 文件 mtime+size 变化, When 再次读取, Then 缓存失效并返回新内容', async () => {
    const dir = runtimeDir('cache-invalidate');
    const sdkSessionId = 'sdk-cache-invalidate';
    const sessionDir = path.join(dir, 'projects', 'project-a', 'sessions', 'session-1');
    await writeSession(dir, 'project-a', sdkSessionId, [
      SESSION_HEADER,
      messageRecord('u1', textContent('旧问题')),
      messageRecord('a1', { role: 'assistant', content: [textBlock('旧回答')] }),
    ].join('\n'));

    const service = createMessageHistoryService(configFor(dir));
    const first = await service.readSessionMessages('project-a', 'session-1');
    expect(first).toHaveLength(2);

    // 追加一条新消息（size 变化必然触发失效）
    const append = `${messageRecord('u2', textContent('新问题'))}\n${messageRecord('a2', { role: 'assistant', content: [textBlock('新回答')] })}\n`;
    await fs.appendFile(path.join(sessionDir, `${sdkSessionId}.jsonl`), append, 'utf-8');

    const second = await service.readSessionMessages('project-a', 'session-1');
    expect(second).toHaveLength(4);
    expect(second!.at(-1)).toMatchObject({ role: 'assistant', content: '新回答' });
  });

  it('Given 两个独立 Core container, When 左容器失效自身缓存, Then 右容器不受影响且各自结果一致', async () => {
    const dir = runtimeDir('container-isolation');
    const sdkSessionId = 'sdk-isolated';
    const sessionDir = path.join(dir, 'projects', 'project-a', 'sessions', 'session-1');
    await writeSession(dir, 'project-a', sdkSessionId, [
      messageRecord('u1', textContent('初始问题')),
      messageRecord('a1', { role: 'assistant', content: [textBlock('初始回答')] }),
    ].join('\n'));

    const left = createMessageHistoryService(configFor(dir));
    const right = createMessageHistoryService(configFor(dir));
    const leftFirst = await left.readSessionMessages('project-a', 'session-1');
    const rightFirst = await right.readSessionMessages('project-a', 'session-1');
    expect(leftFirst).toHaveLength(2);
    expect(rightFirst).toEqual(leftFirst);

    // 左容器主动清空自己的缓存，不应影响右容器已构建的缓存
    left.invalidateCache();
    const rightAgain = await right.readSessionMessages('project-a', 'session-1');
    expect(rightAgain).toHaveLength(2);

    // 文件更新后，右容器（独立缓存）能读到新内容
    await fs.appendFile(
      path.join(sessionDir, `${sdkSessionId}.jsonl`),
      `${messageRecord('u2', textContent('追加问题'))}\n`,
      'utf-8',
    );
    const rightFresh = await right.readSessionMessages('project-a', 'session-1');
    expect(rightFresh).toHaveLength(3);
    expect(rightFresh!.at(-1)).toMatchObject({ id: 'u2', role: 'user', content: '追加问题' });
  });

  it('Given 注册存在但无 Pi 会话文件, When 读取, Then 返回 null（前端按空会话处理）', async () => {
    const dir = runtimeDir('no-file');
    const projectDir = path.join(dir, 'projects', 'project-a', 'sessions');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'index.json'), JSON.stringify([
      { id: 'session-1', title: '空会话', createdAt: 1, updatedAt: 1 },
    ]), 'utf-8');

    const service = createMessageHistoryService(configFor(dir));
    const result = await service.readSessionMessages('project-a', 'session-1');

    expect(result).toBeNull();
  });
});

// ── 流式解析：与纯函数映射一致，且不依赖整文件读入 ─────────────────────────────

describe('parseSessionJsonlStream 流式读取', () => {
  it('Given 包含文本/多工具/错误结果/损坏行的会话文件, When 流式解析, Then 与 parseSessionJsonl 纯函数结果完全一致', async () => {
    const dir = path.join(tmpRoot, 'stream-equivalence');
    const sessionDir = path.join(dir, 'projects', 'project-a', 'sessions', 'session-1');
    await fs.mkdir(sessionDir, { recursive: true });

    const jsonl = [
      JSON.stringify({ type: 'session', version: 3, id: 'sdk-stream' }),
      messageRecord('u1', textContent('并行探索')),
      messageRecord('a1', {
        role: 'assistant',
        content: [
          textBlock('我来查看'),
          toolCallBlock('tool-S1', 'ls', { path: 'src' }),
          toolCallBlock('tool-S2', 'grep', { pattern: 'TODO' }),
        ],
      }),
      toolResultRecord('r1', 'tool-S1', 'ls', 'src/index.ts'),
      toolResultRecord('r2', 'tool-S2', 'grep', 'ENOENT: 失败', true),
      messageRecord('a2', { role: 'assistant', content: [textBlock('结论')] }),
      '{ not valid json',
      messageRecord('u2', textContent('再来一轮')),
    ].join('\n');
    const filePath = path.join(sessionDir, 'stream.jsonl');
    await fs.writeFile(filePath, jsonl, 'utf-8');

    const streamed = await parseSessionJsonlStream(filePath);
    const pure = parseSessionJsonl(jsonl);

    expect(streamed).toEqual(pure);
    expect(streamed).toHaveLength(4);
    expect(streamed[1]!.toolActivities).toHaveLength(2);
    expect(streamed[1]!.toolActivities![0]).toMatchObject({ id: 'tool-S1', status: 'done', result: 'src/index.ts' });
    expect(streamed[1]!.toolActivities![1]).toMatchObject({ id: 'tool-S2', status: 'error', result: 'ENOENT: 失败' });
  });

  it('Given 文件中存在缺 id 记录, When 流式解析, Then 兜底 id 与纯函数一致且唯一', async () => {
    const dir = path.join(tmpRoot, 'stream-fallback-id');
    const sessionDir = path.join(dir, 'projects', 'project-a', 'sessions', 'session-1');
    await fs.mkdir(sessionDir, { recursive: true });

    const noId = (message: Record<string, unknown>): string =>
      JSON.stringify({ type: 'message', message });
    const jsonl = [
      JSON.stringify({ type: 'session', version: 3, id: 'sdk-stream-fb' }),
      noId(textContent('问题')),
      noId({ role: 'assistant', content: [textBlock('回答')] }),
    ].join('\n');
    const filePath = path.join(sessionDir, 'stream.jsonl');
    await fs.writeFile(filePath, jsonl, 'utf-8');

    const streamed = await parseSessionJsonlStream(filePath);
    const ids = streamed.map((message) => message.id);

    expect(ids).toEqual(['hist_0', 'hist_1']);
  });

  it('Given 文件不存在, When 流式解析, Then 拒绝并带清晰的底层错误', async () => {
    const filePath = path.join(tmpRoot, 'stream-missing', 'nope.jsonl');
    await expect(parseSessionJsonlStream(filePath)).rejects.toThrow();
  });
});
