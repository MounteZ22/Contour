import { listChannels } from './channelManager.js';

/** 获取第一个启用的渠道 */
function getDefaultChannel() {
  const channels = listChannels();
  return channels.find((c) => c.enabled);
}

/** 测试 LLM 连接 */
export async function testLLMConnection(): Promise<{ success: boolean; message: string }> {
  const channel = getDefaultChannel();
  if (!channel) {
    return { success: false, message: '未配置可用的 AI 渠道' };
  }

  const { testChannelDirect } = await import('./channelManager.js');
  return testChannelDirect({
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  });
}
