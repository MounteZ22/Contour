import { listChannels } from '@contour/core/services';

/** 获取第一个启用的渠道 */
async function getDefaultChannel() {
  const channels = await listChannels();
  return channels.find((c) => c.enabled);
}

/** 测试 LLM 连接 */
export async function testLLMConnection(): Promise<{ success: boolean; message: string }> {
  const channel = await getDefaultChannel();
  if (!channel) {
    return { success: false, message: '未配置可用的 AI 渠道' };
  }

  const { testChannelDirect } = await import('@contour/core/services');
  return testChannelDirect({
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  });
}
