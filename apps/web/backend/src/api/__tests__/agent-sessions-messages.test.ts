import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@contour/shared';

// ── Mock Core 依赖：路由只委托给 messageHistory 服务，不触碰真实数据目录 ─────
const mockMessages = vi.hoisted(() => ({
  readSessionMessages: vi.fn<() => Promise<ChatMessage[] | null>>(),
}));

vi.mock('../../core.js', () => ({
  coreServices: {
    messageHistory: {
      readSessionMessages: mockMessages.readSessionMessages,
    },
  },
}));

const mockSessions = vi.hoisted(() => ({
  listProductSessions: vi.fn(),
}));

vi.mock('@contour/core/agent', async (importOriginal) => {
  const original = await importOriginal<typeof import('@contour/core/agent')>();
  return {
    ...original,
    listProductSessions: mockSessions.listProductSessions,
  };
});

// 使用隔离的临时数据目录，避免触碰真实 ~/.contour-dev
vi.mock('../../config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const testDir = join(tmpdir(), `contour-agent-sessions-test-${Date.now()}`);
  return {
    CONFIG: {
      PORT: 3001,
      VAULTS_DIR: testDir,
      LEGACY_VAULT: testDir,
      CONFIG_DIR: testDir,
      CONFIG_FILE: join(testDir, 'settings.json'),
      IS_DEV: true,
      DATA_DIR: testDir,
      PROJECTS_DIR: join(testDir, 'projects'),
    },
  };
});

const agentSessionsRouter = (await import('../agent-sessions.js')).default;

const app = express();
app.use(express.json());
app.use('/api/agent/sessions', agentSessionsRouter);

afterEach(() => {
  vi.clearAllMocks();
});

function withSessionInRegistry(): void {
  mockSessions.listProductSessions.mockReturnValue([
    { id: 'session-1', title: '测试会话', createdAt: 1, updatedAt: 1 },
  ]);
}

describe('GET /api/agent/sessions/:projectId/:sessionId/messages', () => {
  it('Given 会话存在且有历史, When 请求消息, Then 返回结构化 ChatMessage[]', async () => {
    withSessionInRegistry();
    mockMessages.readSessionMessages.mockResolvedValue([
      { id: 'u1', role: 'user', content: '问题' },
      {
        id: 'a1',
        role: 'assistant',
        content: '回答',
        turnIndex: 1,
        filesChanged: ['a.md'],
        toolActivities: [{ id: 'tool-1', toolName: 'Write', status: 'done', input: { path: 'a.md' } }],
      },
    ]);

    const response = await request(app).get('/api/agent/sessions/project-a/session-1/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [
        { id: 'u1', role: 'user', content: '问题' },
        {
          id: 'a1',
          role: 'assistant',
          content: '回答',
          turnIndex: 1,
          filesChanged: ['a.md'],
          toolActivities: [{ id: 'tool-1', toolName: 'Write', status: 'done', input: { path: 'a.md' } }],
        },
      ],
    });
  });

  it('Given 会话存在但无 Pi 文件, When 请求消息, Then 返回 success + 空数组（前端不回退 localStorage）', async () => {
    withSessionInRegistry();
    mockMessages.readSessionMessages.mockResolvedValue(null);

    const response = await request(app).get('/api/agent/sessions/project-a/session-1/messages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
  });

  it('Given 会话不存在, When 请求消息, Then 返回 404 让前端可区分并降级', async () => {
    mockSessions.listProductSessions.mockReturnValue([]);

    const response = await request(app).get('/api/agent/sessions/project-a/ghost-session/messages');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: '会话不存在' });
  });

  it('Given 读取失败, When 请求消息, Then 返回 400 错误与空会话区分开', async () => {
    withSessionInRegistry();
    mockMessages.readSessionMessages.mockRejectedValue(new Error('磁盘读取失败'));

    const response = await request(app).get('/api/agent/sessions/project-a/session-1/messages');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error: '读取会话消息失败' });
  });
});
