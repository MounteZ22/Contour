export type FlowStatus = 'in_progress' | 'completed' | 'archived' | 'abandoned';

export interface ProjectDoc {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
}

export interface Claim {
  claimId: string;
  title: string;
  content: string;
  confidence: 'low' | 'medium' | 'high';
  status: 'tentative' | 'active' | 'revised' | 'weakened' | 'superseded' | 'rejected';
  tags: string[];
}

export interface FlowSection {
  id: string;
  title: string;
  filename: string;
  content: string;
}

export interface Flow {
  flowId: string;
  title: string;
  status: FlowStatus;
  type: string;
  created: string;
  updated: string;
  parentFlows: string[];
  linkedClaims: string[];
  tags: string[];
  openUncertainties: string[];
  summary: string;
  sections: FlowSection[];
  position?: { x: number; y: number };
}

export interface ProjectData {
  projectId: string;
  title: string;
  researchGoal: string;
  currentStage: string;
  docs: ProjectDoc[];
  flows: Flow[];
  claims: Claim[];
}

export interface ContourAppData {
  projects: ProjectData[];
}

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

export interface AIContextItem {
  id: string;
  title: string;
  type: 'flow' | 'doc';
}

// AI 聊天响应
export interface ChatResponse {
  message: string;
  role: 'assistant';
  conversationId: string;
}

// ===== 渠道（Channel）配置类型 =====

export type ProviderType =
  | 'anthropic'
  | 'deepseek'
  | 'kimi-api'
  | 'kimi-coding'
  | 'custom';

export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/anthropic',
  'kimi-api': 'https://api.moonshot.cn/anthropic',
  'kimi-coding': 'https://api.kimi.com/coding/v1',
  custom: '',
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  'kimi-api': 'Kimi API (Anthropic 协议)',
  'kimi-coding': 'Kimi Coding Plan',
  custom: '自定义 (Anthropic 兼容)',
};

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

export interface ChannelModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Channel {
  id: string;
  name: string;
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: ChannelModel[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelCreateInput {
  name: string;
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: ChannelModel[];
  enabled: boolean;
}

export interface ChannelUpdateInput {
  name?: string;
  provider?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  models?: ChannelModel[];
  enabled?: boolean;
}

export interface ChannelsConfig {
  version: number;
  channels: Channel[];
}

export interface ChannelTestResult {
  success: boolean;
  message: string;
}

export interface FetchModelsInput {
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
}

export interface FetchModelsResult {
  success: boolean;
  message: string;
  models: ChannelModel[];
}

// 应用设置
export interface AppSettings {
  agentChannelId?: string;
}
