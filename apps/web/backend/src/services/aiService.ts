import { coreServices } from '../core.js';

/** 获取第一个启用的渠道 */
async function getDefaultChannel() {
  const channels = await coreServices.channels.listChannels();
  return channels.find((channel) => channel.enabled);
}

/** 测试 LLM 连接 */
export async function testLLMConnection(): Promise<{ success: boolean; message: string }> {
  const channel = await getDefaultChannel();
  if (!channel) return { success: false, message: '未配置可用的 AI 渠道' };
  return coreServices.channels.testChannelDirect({
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  });
}
