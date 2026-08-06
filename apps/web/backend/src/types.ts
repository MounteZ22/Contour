/**
 * 后端类型定义
 *
 * 与前端完全一致的领域类型和渠道配置类型已迁至 @contour/shared，
 * 此处 re-export 以保持向后兼容；仅后端使用的类型保留在下方。
 */
import type {
  AIContextItem,
  Channel,
  ProviderType,
} from '@contour/shared';

export {
  type FlowStatus,
  type ProjectDoc,
  type Claim,
  type FlowSection,
  type FlowLink,
  type Flow,
  type ProjectData,
  type ContourAppData,
  type AIContextItem,
  type ProviderType,
  PROVIDER_DEFAULT_URLS,
  PROVIDER_LABELS,
  type ChannelModel,
  type Channel,
  type ChannelCreateInput,
  type ChannelUpdateInput,
  type ChannelTestResult,
  type FetchModelsResult,
  type AppSettings,
} from '@contour/shared';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// AI 聊天接口
export interface ChatRequestBody {
  message: string;
  contextItems: AIContextItem[];
  conversationId?: string;
}

// AI 聊天响应
export interface ChatResponse {
  message: string;
  role: 'assistant';
  conversationId: string;
}

/** 兼容 Agent 模式的供应商 */
export const AGENT_COMPATIBLE_PROVIDERS: ReadonlySet<ProviderType> = new Set([
  'anthropic',
  'deepseek',
  'kimi-api',
  'kimi-coding',
]);

export function isAgentCompatibleProvider(provider: ProviderType): boolean {
  return AGENT_COMPATIBLE_PROVIDERS.has(provider);
}

export interface ChannelsConfig {
  version: number;
  channels: Channel[];
}

export interface FetchModelsInput {
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
}

/**
 * 返回给前端的网络检索配置状态。Tavily 密钥是仅后端可读的凭据，绝不放在此类型中。
 */
export interface WebSearchSettingsStatus {
  enabled: boolean;
  hasApiKey: boolean;
}
