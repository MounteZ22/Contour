/**
 * 前端类型定义
 *
 * 与后端完全一致的领域类型和渠道配置类型已迁至 @contour/shared，
 * 此处 re-export 以保持向后兼容；仅前端使用的类型保留在下方。
 */
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

// 项目允许 Agent 访问的本地路径
export interface ProjectPathEntry {
  path: string;
  available: boolean;
}

export interface ProjectConfig {
  projectDir: string;
  attachedDirectories: ProjectPathEntry[];
  attachedFiles: ProjectPathEntry[];
}
