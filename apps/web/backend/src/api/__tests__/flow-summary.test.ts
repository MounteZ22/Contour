import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';

let testDir: string;
let vaultsDir: string;
let legacyDir: string;

vi.mock('../../config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  testDir = join(tmpdir(), `contour-flow-summary-test-${Date.now()}`);
  vaultsDir = join(testDir, 'vaults');
  legacyDir = join(testDir, 'legacy-vault');
  return {
    CONFIG: {
      PORT: 3001,
      VAULTS_DIR: vaultsDir,
      LEGACY_VAULT: legacyDir,
      CONFIG_DIR: testDir,
      CONFIG_FILE: path.join(testDir, 'settings.json'),
      IS_DEV: true,
      DATA_DIR: testDir,
      PROJECTS_DIR: path.join(testDir, 'projects'),
    },
  };
});

const testChannels = [
  { id: 'summary-channel', name: '摘要渠道', provider: 'anthropic', baseUrl: 'https://summary.example.test/v1', apiKey: 'test-key', enabled: true, models: [{ id: 'summary-model', name: '摘要模型', enabled: true }], createdAt: 0, updatedAt: 0 },
  { id: 'kimi-channel', name: 'Kimi Coding', provider: 'kimi-coding', baseUrl: 'https://api.kimi.com/coding/v1', apiKey: 'test-key', enabled: true, models: [{ id: 'kimi-for-coding', name: 'Kimi', enabled: true }], createdAt: 0, updatedAt: 0 },
  { id: 'deepseek-channel', name: 'DeepSeek', provider: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', apiKey: 'test-key', enabled: true, models: [{ id: 'deepseek-chat', name: 'DeepSeek', enabled: true }], createdAt: 0, updatedAt: 0 },
];

const flowsRouter = (await import('../flows.js')).default;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/flows', flowsRouter);

async function createFlow(projectId: string, flowId: string, title: string): Promise<string> {
  const flowDir = path.join(vaultsDir, projectId, 'flows', `${flowId}_summary-test`);
  await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });
  await fs.writeFile(path.join(flowDir, 'flow.md'), `---\nflow_id: ${flowId}\ntitle: ${title}\nstatus: in_progress\nstage: analysis\ncreated: "2024-01-01"\nupdated: "2024-01-02"\n---\n# ${title}\n\n来自磁盘的 Flow 概览。\n`);
  await fs.writeFile(path.join(flowDir, 'sections', 'flow.md'), '# 主 Section\n\n来自磁盘的完整 Section 正文。\n');
  await fs.writeFile(path.join(flowDir, 'flow_summary.md'), '# Flow Summary\n\n原有摘要，不应被生成草稿覆盖。\n');
  return flowDir;
}

beforeAll(async () => {
  await fs.mkdir(testDir, { recursive: true });
  await fs.writeFile(path.join(testDir, 'channels.json'), JSON.stringify({ version: 1, channels: testChannels }));
  await createFlow('summary-project', 'F001', '服务端摘要测试');
  await fs.mkdir(path.join(vaultsDir, 'other-project', 'flows'), { recursive: true });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Flow summary API', () => {
  it('Given 浏览器携带伪造正文, When 生成草稿, Then 服务端重读完整 Flow 且不覆盖已保存摘要', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: '模型生成的摘要草稿。' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/flows/F001/summary/draft').send({
      projectId: 'summary-project',
      channelId: 'summary-channel',
      model: 'summary-model',
      content: '恶意的浏览器正文，绝不能成为摘要输入。',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { draft: '模型生成的摘要草稿。', model: 'summary-model' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody.messages[0].content).toContain('来自磁盘的 Flow 概览');
    expect(requestBody.messages[0].content).toContain('来自磁盘的完整 Section 正文');
    expect(requestBody.messages[0].content).not.toContain('恶意的浏览器正文');
    expect(requestBody.max_tokens).toBe(1200);

    const existing = await fs.readFile(path.join(vaultsDir, 'summary-project', 'flows', 'F001_summary-test', 'flow_summary.md'), 'utf-8');
    expect(existing).toContain('原有摘要，不应被生成草稿覆盖。');
  });

  it('Given 缺失或错误的项目授权, When 请求草稿或保存, Then 服务器拒绝而不猜测同名 Flow', async () => {
    const missingProject = await request(app).post('/api/flows/F001/summary/draft').send({
      channelId: 'summary-channel', model: 'summary-model',
    });
    const otherProject = await request(app).put('/api/flows/F001/summary').send({
      projectId: 'other-project', content: '不应写入其他项目',
    });

    expect(missingProject.status).toBe(400);
    expect(otherProject.status).toBe(404);
    const original = await fs.readFile(path.join(vaultsDir, 'summary-project', 'flows', 'F001_summary-test', 'flow_summary.md'), 'utf-8');
    expect(original).toContain('原有摘要，不应被生成草稿覆盖。');
  });

  it('Given 用户确认并保存草稿, When 随后读取该摘要, Then 新内容可见且 Flow 更新时间同步写入', async () => {
    const save = await request(app).put('/api/flows/F001/summary').send({
      projectId: 'summary-project', content: '用户编辑后的摘要。\n\n- 保留关键结论',
    });
    const read = await request(app).get('/api/flows/F001/summary').query({ projectId: 'summary-project' });

    expect(save.status).toBe(200);
    expect(read.status).toBe(200);
    expect(read.body.data.content).toContain('用户编辑后的摘要。');
    expect(read.body.data.content).toContain('- 保留关键结论');
    const flowMarkdown = await fs.readFile(path.join(vaultsDir, 'summary-project', 'flows', 'F001_summary-test', 'flow.md'), 'utf-8');
    expect(flowMarkdown).toContain(`updated: "${new Date().toISOString().split('T')[0]}"`);
  });

  it('Given Flow 正文超过输入上限, When 生成草稿, Then 在调用模型前拒绝请求', async () => {
    const largeFlowDir = await createFlow('summary-project', 'F002', '过长 Flow');
    await fs.writeFile(path.join(largeFlowDir, 'sections', 'flow.md'), 'x'.repeat(32_100));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/flows/F002/summary/draft').send({
      projectId: 'summary-project', channelId: 'summary-channel', model: 'summary-model',
    });

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given Kimi Coding 渠道的完整 v1 Base URL, When 生成草稿, Then 保留版本路径并设置请求超时', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Kimi 草稿。' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/flows/F001/summary/draft').send({
      projectId: 'summary-project', channelId: 'kimi-channel', model: 'kimi-for-coding',
    });

    expect(response.status).toBe(200);
    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.kimi.com/coding/v1/messages');
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);
  });

  it('Given DeepSeek 渠道, When 生成草稿, Then 使用 Bearer token 鉴权', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'DeepSeek 草稿。' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/flows/F001/summary/draft').send({
      projectId: 'summary-project', channelId: 'deepseek-channel', model: 'deepseek-chat',
    });

    expect(response.status).toBe(200);
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = requestInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('Given 上游服务返回敏感正文或超时, When 生成草稿, Then 只返回可重试的通用中文错误', async () => {
    const responseBody = 'provider secret: do-not-expose';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(responseBody, { status: 503 })));
    const unavailable = await request(app).post('/api/flows/F001/summary/draft').send({
      projectId: 'summary-project', channelId: 'summary-channel', model: 'summary-model',
    });

    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('internal request timeout');
      error.name = 'TimeoutError';
      throw error;
    }));
    const timeout = await request(app).post('/api/flows/F001/summary/draft').send({
      projectId: 'summary-project', channelId: 'summary-channel', model: 'summary-model',
    });

    expect(unavailable.status).toBe(502);
    expect(unavailable.body.error).toBe('模型服务暂时不可用，请稍后重试。');
    expect(JSON.stringify(unavailable.body)).not.toContain(responseBody);
    expect(timeout.status).toBe(504);
    expect(timeout.body.error).toBe('模型服务响应超时，请稍后重试。');
    expect(JSON.stringify(timeout.body)).not.toContain('internal request timeout');
  });
});
