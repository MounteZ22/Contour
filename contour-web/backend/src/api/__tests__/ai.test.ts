import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import aiRouter from '../ai.js';

const app = express();
app.use(express.json());
app.use('/api/ai', aiRouter);

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
