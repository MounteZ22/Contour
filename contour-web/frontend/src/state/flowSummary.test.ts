import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFlowSummaryDraft, saveFlowSummary } from './flowSummary';

afterEach(() => vi.restoreAllMocks());

describe('Flow 摘要 API 调用', () => {
  it('Given 生成草稿, When 请求后端, Then 只发送项目、Flow 路径和模型偏好而不发送正文', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { draft: '草稿', model: 'm1' },
    }), { status: 200 }));

    await expect(generateFlowSummaryDraft('P001', 'F001', { channelId: 'c1', model: 'm1' })).resolves.toEqual({ draft: '草稿', model: 'm1' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ projectId: 'P001', channelId: 'c1', model: 'm1' });
  });

  it('Given 保存用户确认的草稿, When 请求后端, Then 摘要正文只出现在保存请求中', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true, data: null,
    }), { status: 200 }));

    await expect(saveFlowSummary('P001', 'F001', '确认后的摘要')).resolves.toBeUndefined();

    const [, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ projectId: 'P001', content: '确认后的摘要' });
  });
});
