import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

let configDir!: string;

vi.mock('../../config.js', async () => {
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  configDir = join(tmpdir(), `contour-settings-api-${Date.now()}`);
  return { CONFIG: { CONFIG_DIR: configDir } };
});

const settingsRouter = (await import('../settings.js')).default;
const app = express();
app.use(express.json());
app.use('/api/settings', settingsRouter);

beforeEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
  fs.mkdirSync(configDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe('网络检索设置 API', () => {
  it('Given 尚未保存网络检索配置, When 读取状态, Then 默认关闭且未配置密钥', async () => {
    const response = await request(app).get('/api/settings/web-search');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ enabled: false, hasApiKey: false });
  });

  it('Given 保存 Tavily 密钥, When 读取设置, Then 只返回状态而绝不回显密钥', async () => {
    const key = 'tvly-super-secret-key';
    const saved = await request(app).post('/api/settings/web-search').send({ enabled: true, tavilyApiKey: key });
    const webSearch = await request(app).get('/api/settings/web-search');
    const general = await request(app).get('/api/settings');

    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ enabled: true, hasApiKey: true });
    expect(JSON.stringify(webSearch.body)).not.toContain(key);
    expect(JSON.stringify(general.body)).not.toContain(key);
    expect(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf-8')).toContain(key);
  });

  it('Given 错误类型的网络检索设置, When 保存, Then 返回 400 且不写入密钥', async () => {
    const response = await request(app).post('/api/settings/web-search').send({ enabled: 'yes', tavilyApiKey: 'tvly-secret' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('enabled');
    expect(fs.existsSync(path.join(configDir, 'settings.json'))).toBe(false);
  });

  it('Given 没有 API Key, When 直接请求启用或传入未知字段, Then 拒绝无效配置且不落盘', async () => {
    const enable = await request(app).post('/api/settings/web-search').send({ enabled: true });
    const extra = await request(app).post('/api/settings/web-search').send({ enabled: false, unexpected: true });

    expect(enable.status).toBe(400);
    expect(enable.body.error).toContain('API Key');
    expect(extra.status).toBe(400);
    expect(extra.body.error).toContain('unexpected');
    expect(fs.existsSync(path.join(configDir, 'settings.json'))).toBe(false);
  });

  it('Given 已启用网络检索, When 清除 API Key, Then 自动关闭工具并且后续读取不回显密钥', async () => {
    await request(app).post('/api/settings/web-search').send({ enabled: true, tavilyApiKey: 'tvly-secret' });
    const saved = await request(app).post('/api/settings/web-search').send({ tavilyApiKey: '' });

    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ enabled: false, hasApiKey: false });
    expect(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf-8')).not.toContain('tvly-secret');
  });
});
