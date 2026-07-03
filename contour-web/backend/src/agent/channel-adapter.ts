/**
 * channel-adapter — 渠道到 Agent 运行时的适配层
 *
 * 职责：将 backend 的 Channel 概念单向转换为 agent 模块认识的 AgentRuntimeConfig。
 * 依赖方向：channel-adapter.ts → channelManager / agent-runtime.ts 的类型
 *          （pi-runtime.ts / agent-runtime.ts 不反向依赖本文件或 channelManager）
 *
 * 设计意图：为将来可能把 agent/ 目录拆成独立 npm 包保持架构隔离。
 */

import { AGENT_COMPATIBLE_PROVIDERS, PROVIDER_DEFAULT_URLS } from "../types.js";
import type { Channel, ChannelModel, ProviderType } from "../types.js";
import {
  normalizeAnthropicBaseUrl,
  normalizeBaseUrl,
} from "../services/channelManager.js";
import type { AgentRuntimeConfig } from "./agent-runtime.js";

/**
 * 判断是否为非版本化路径的 provider
 *
 * 与 channelManager.ts 中 testAnthropicCompatible / fetchAnthropicCompatibleModels
 * 的判断逻辑保持一致：deepseek、kimi-api、kimi-coding 的 API 路径不需要 /v1 后缀。
 */
function isNonVersionedProvider(provider: ProviderType): boolean {
  return (
    provider === "deepseek" ||
    provider === "kimi-api" ||
    provider === "kimi-coding"
  );
}

/**
 * 获取渠道的默认模型 ID
 *
 * 规则：返回 channel.models 中第一个 enabled: true 的模型的 id。
 * 如果没有 enabled 的模型，抛出错误提示用户先配置模型。
 */
function getDefaultModelId(models: ChannelModel[]): string {
  if (!models || models.length === 0) {
    throw new Error(
      "该渠道未配置任何模型，请先在渠道设置中添加模型",
    );
  }
  const defaultModel = models.find((m) => m.enabled);
  if (!defaultModel) {
    throw new Error(
      "该渠道没有已启用的模型，请先在渠道设置中启用至少一个模型",
    );
  }
  return defaultModel.id;
}

/**
 * 将 Channel 转换为 AgentRuntimeConfig
 *
 * @param channel  — 渠道配置对象（来自 channelManager）
 * @param overrides — 可选覆盖项，model / cwd / tools 如果提供则优先使用
 * @returns AgentRuntimeConfig — 可直接传给 AgentRuntime.init() 的配置对象
 *
 * @throws 如果渠道的 provider 不在 AGENT_COMPATIBLE_PROVIDERS 白名单中
 * @throws 如果渠道没有已启用的模型且 overrides.model 也未提供
 */
export function channelToAgentRuntimeConfig(
  channel: Channel,
  overrides?: {
    model?: string;
    cwd?: string;
    tools?: string[];
  },
): AgentRuntimeConfig {
  // ── 1. 校验 provider 兼容性 ─────────────────────────────────────────────
  if (!AGENT_COMPATIBLE_PROVIDERS.has(channel.provider)) {
    throw new Error(
      `渠道 "${channel.name}" 的供应商类型 "${channel.provider}" 不支持 Agent 模式。` +
        `当前支持的供应商：${[...AGENT_COMPATIBLE_PROVIDERS].join(", ")}`,
    );
  }

  // ── 2. 确定 baseUrl（规范化） ───────────────────────────────────────────
  //
  // 优先使用渠道配置的 baseUrl，如果为空则回退到 PROVIDER_DEFAULT_URLS。
  // 规范化逻辑与 channelManager 中的 testChannelDirect / fetchModels 保持一致：
  // - anthropic → normalizeAnthropicBaseUrl（追加 /v1 版本路径）
  // - deepseek / kimi-api / kimi-coding → normalizeBaseUrl（仅去尾部斜杠）
  const rawBaseUrl =
    channel.baseUrl || PROVIDER_DEFAULT_URLS[channel.provider] || "";
  const baseUrl = isNonVersionedProvider(channel.provider)
    ? normalizeBaseUrl(rawBaseUrl)
    : normalizeAnthropicBaseUrl(rawBaseUrl);

  // ── 3. 确定模型 ─────────────────────────────────────────────────────────
  const model = overrides?.model ?? getDefaultModelId(channel.models);

  // ── 4. 确定 cwd 和 tools（与 pi-runtime.ts 默认值保持一致） ──────────────
  const cwd = overrides?.cwd ?? process.cwd();
  const tools = overrides?.tools ?? ["read"];

  return {
    apiKey: channel.apiKey,
    baseUrl,
    model,
    cwd,
    tools,
  };
}
