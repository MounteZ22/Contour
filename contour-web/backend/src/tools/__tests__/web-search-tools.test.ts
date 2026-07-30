import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSearchTools,
  fetchContentWithPolicy,
  isUnsafeIpAddress,
  resolvePublicHttpUrl,
} from '../web-search-tools.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('受控网络检索工具', () => {
  it('Given 默认关闭或缺少密钥, When 创建工具, Then 不向 Agent 注入网络能力', () => {
    expect(createWebSearchTools({ enabled: false, tavilyApiKey: 'tvly-secret' })).toEqual([]);
    expect(createWebSearchTools({ enabled: true })).toEqual([]);
  });

  it('Given 启用且配置了密钥, When 创建工具, Then 仅提供受限检索和文本读取工具', () => {
    expect(createWebSearchTools({ enabled: true, tavilyApiKey: 'tvly-secret' }).map((tool) => tool.name))
      .toEqual(['web_search', 'fetch_content']);
  });

  it('Given web_search 的 maxResults 超出限制, When 执行工具, Then 在请求外部服务前拒绝', async () => {
    const [search] = createWebSearchTools({ enabled: true, tavilyApiKey: 'tvly-secret' });
    await expect(search.execute('call-1', { query: 'research', maxResults: 11 } as never))
      .rejects.toThrow('maxResults 必须是 1 到 10 之间的整数');
  });

  it('Given Tavily 返回过多结果或带临时凭据的内容, When 检索, Then 按请求限额并脱敏后交给 Agent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { title: 'token=external-secret', url: 'https://public.example/a?access_token=secret&utm_source=test#fragment', content: 'Bearer external-secret' },
        { title: '第二条', url: 'https://public.example/b', content: '内容二' },
      ],
    }), { headers: { 'content-type': 'application/json' } })));

    const [search] = createWebSearchTools({ enabled: true, tavilyApiKey: 'tvly-local-secret' });
    const result = await search.execute('call-1', { query: 'research', maxResults: 1 } as never);
    const text = result.content[0].text;

    expect(text).not.toContain('tvly-local-secret');
    expect(text).not.toContain('external-secret');
    expect(text).toContain('https://public.example/a?utm_source=test');
    expect(text).not.toContain('第二条');
  });

  it('Given 本机、私网或云元数据地址, When 验证网页地址, Then 一律拒绝', async () => {
    await expect(resolvePublicHttpUrl('http://localhost/private')).rejects.toThrow('不允许访问');
    await expect(resolvePublicHttpUrl('http://169.254.169.254/latest')).rejects.toThrow('不允许访问');
    await expect(resolvePublicHttpUrl('http://example.test/', async () => [{ address: '10.0.0.8', family: 4 }]))
      .rejects.toThrow('不允许访问');
  });

  it('Given 公开网页跳转到私网地址, When fetch_content 跟随跳转, Then 在第二跳前阻断', async () => {
    await expect(fetchContentWithPolicy('https://public.example/start', {
      lookup: publicLookup,
      request: async () => ({
        statusCode: 302,
        headers: { location: 'http://127.0.0.1/internal' },
        body: Buffer.alloc(0),
      }),
    })).rejects.toThrow('该网页地址不允许访问');
  });

  it('Given 整体请求时限已耗尽, When fetch_content 尚未建立连接, Then 不发出网络请求', async () => {
    const request = vi.fn();
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(30_001);

    await expect(fetchContentWithPolicy('https://public.example/', {
      lookup: publicLookup,
      request,
      now,
    })).rejects.toThrow('网页请求超时');
    expect(request).not.toHaveBeenCalled();
  });

  it('Given 网络层暴露内部错误, When fetch_content 失败, Then 工具错误不泄露底层细节', async () => {
    await expect(fetchContentWithPolicy('https://public.example/', {
      lookup: publicLookup,
      request: async () => { throw new Error('connect ECONNREFUSED 10.2.3.4 with token=secret'); },
    })).rejects.toThrow('网页内容获取失败，请稍后重试或换一个公开地址');
  });

  it('Given 附件或压缩响应, When fetch_content 读取, Then 拒绝把下载内容交给 Agent', async () => {
    for (const headers of [
      { 'content-type': 'application/pdf' },
      { 'content-type': 'text/html', 'content-encoding': 'gzip' },
      { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename=data.txt' },
    ]) {
      await expect(fetchContentWithPolicy('https://public.example/', {
        lookup: publicLookup,
        request: async () => ({ statusCode: 200, headers, body: Buffer.from('safe text') }),
      })).rejects.toThrow('该地址不是可安全读取的文本网页');
    }
  });

  it('Given 常见内网 IP, When 判定地址, Then 识别为不安全', () => {
    expect(isUnsafeIpAddress('127.0.0.1')).toBe(true);
    expect(isUnsafeIpAddress('192.168.1.1')).toBe(true);
    expect(isUnsafeIpAddress('fc00::1')).toBe(true);
    expect(isUnsafeIpAddress('::ffff:c0a8:0101')).toBe(true);
    expect(isUnsafeIpAddress('93.184.216.34')).toBe(false);
  });
});
