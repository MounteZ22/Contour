import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createAiRouter, type AiRouterTestHandle } from '../ai.js';
import { AskUserRequestManager } from '@contour/core/agent';
import { createTestHostContext } from './test-host.js';
import path from 'node:path';
import os from 'node:os';

const testHandle = {} as AiRouterTestHandle;
const app = express();
app.use(express.json());
app.use('/api/ai', createAiRouter(
  createTestHostContext({ dataDir: path.join(os.tmpdir(), `contour-ai-api-${Date.now()}`) }),
  testHandle,
));

afterEach(() => {
  testHandle.clear();
});

function createPendingAskUser(): {
  manager: AskUserRequestManager;
  requestId: string;
  answer: Promise<{ answers: Record<string, string> }>;
} {
  const events: Array<{ requestId: string }> = [];
  const manager = new AskUserRequestManager();
  manager.beginPrompt((event) => events.push(event as { requestId: string }));
  const answer = manager.request([{ header: 'choice', question: '请选择' }]);
  return { manager, requestId: events[0]!.requestId, answer };
}

describe('POST /api/ai/pi-chat 错误协议', () => {
  it('消息为空时返回前端可直接展示的结构化错误', async () => {
    const response = await request(app).post('/api/ai/pi-chat').send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'unknown',
        title: '消息不能为空',
        canRetry: false,
      },
    });
    expect(response.body.error.message).not.toBe('');
  });

  it('Given 非法权限模式, When 发起对话, Then 在加载渠道前返回 400', async () => {
    const response = await request(app).post('/api/ai/pi-chat').send({
      message: 'test',
      projectId: 'PRJ_001',
      sessionId: 'session-1',
      permissionMode: 'anything',
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { title: '权限模式无效', canRetry: false },
    });
  });
});

describe('POST /api/ai/ask-user-response', () => {
  it('Given 已登记的 AskUser requestId, When 用户提交答案, Then 正确交给所属 manager 并返回 success', async () => {
    const pending = createPendingAskUser();
    testHandle.register(pending.requestId, pending.manager);

    const response = await request(app).post('/api/ai/ask-user-response').send({
      requestId: pending.requestId,
      answers: { choice: '方案 A' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    await expect(pending.answer).resolves.toEqual({ answers: { choice: '方案 A' } });
  });

  it('Given 过期或未知 requestId, When 用户提交答案, Then 返回 404', async () => {
    const response = await request(app).post('/api/ai/ask-user-response').send({
      requestId: 'expired-request',
      answers: { choice: '方案 A' },
    });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: '问答请求不存在或已过期' });
  });

  it('Given 两个 manager 的并发请求, When 分别提交各自 requestId, Then 答案不会串到另一个 manager', async () => {
    const first = createPendingAskUser();
    const second = createPendingAskUser();
    testHandle.register(first.requestId, first.manager);
    testHandle.register(second.requestId, second.manager);

    const firstResponse = await request(app).post('/api/ai/ask-user-response').send({
      requestId: first.requestId,
      answers: { choice: '第一个答案' },
    });
    expect(firstResponse.status).toBe(200);
    await expect(first.answer).resolves.toEqual({ answers: { choice: '第一个答案' } });

    const secondResponse = await request(app).post('/api/ai/ask-user-response').send({
      requestId: second.requestId,
      answers: { choice: '第二个答案' },
    });
    expect(secondResponse.status).toBe(200);
    await expect(second.answer).resolves.toEqual({ answers: { choice: '第二个答案' } });
  });
});
