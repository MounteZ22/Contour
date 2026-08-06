import type { CoreServices } from '@contour/core/services';

/** 测试第一个启用渠道；Core 容器必须由 HTTP host 显式传入。 */
export async function testLLMConnection(coreServices: CoreServices): Promise<{ success: boolean; message: string }> {
  const channels = await coreServices.channels.listChannels();
  const channel = channels.find((item) => item.enabled);
  if (!channel) return { success: false, message: '未配置可用的 AI 渠道' };
  return coreServices.channels.testChannelDirect({
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
  });
}
