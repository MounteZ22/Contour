import type { Channel, ProviderType } from "@contour/shared";

export type { AIContextItem, Channel, ChannelModel, ProjectData, ProviderType } from "@contour/shared";
export { PROVIDER_DEFAULT_URLS } from "@contour/shared";

export const AGENT_COMPATIBLE_PROVIDERS: ReadonlySet<ProviderType> = new Set([
  "anthropic", "deepseek", "kimi-api", "kimi-coding",
]);
export interface ChannelsConfig { version: number; channels: Channel[]; }
export interface FetchModelsInput { provider: ProviderType; baseUrl: string; apiKey: string; }
export interface WebSearchSettingsStatus { enabled: boolean; hasApiKey: boolean; }
