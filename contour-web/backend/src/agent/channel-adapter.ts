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
import type { Channel, ChannelModel } from "../types.js";
import {
  listChannels,
  normalizeBaseUrl,
} from "../services/channelManager.js";
import type { AgentRuntimeConfig } from "./agent-runtime.js";

/** readonly 模式下开放的内置工具（全部只读） */
const READONLY_BUILTIN_TOOLS = ["read", "grep", "find", "ls"];

/** yolo/review 模式下开放的内置工具（含写入/执行类） */
const FULL_BUILTIN_TOOLS = [
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "find",
  "ls",
];

/**
 * 查找默认的 Agent 兼容渠道
 *
 * 规则：从所有渠道中取第一个 enabled 且 provider 在 AGENT_COMPATIBLE_PROVIDERS
 * 白名单内的。用于 /pi-chat 路由在不显式传 channelId 时的回退，与旧 /chat
 * 路由的 getDefaultChannel() 行为对齐（但额外过滤了 agent 不兼容的 provider）。
 *
 * @returns 第一个可用的 agent 兼容渠道，没有则返回 undefined
 */
export async function findDefaultAgentChannel(): Promise<Channel | undefined> {
  const channels = await listChannels();
  return channels.find(
    (c) => c.enabled && AGENT_COMPATIBLE_PROVIDERS.has(c.provider),
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
 * @param overrides — 可选覆盖项，model / cwd / projectDir / dataDir / tools 如果提供则优先使用
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
    /** 应用数据目录，透传给 AgentRuntimeConfig.dataDir */
    dataDir?: string;
    /** 项目内容目录，透传给 AgentRuntimeConfig.projectDir。不传时回退到 cwd */
    projectDir?: string;
    tools?: string[];
    /** 业务上下文 system prompt（如 Flow/Doc 注入），透传给 PiRuntime */
    systemPrompt?: string;
    /** 自定义工具定义数组（Pi ToolDefinition[]），透传给 PiRuntime */
    customTools?: unknown[];
    /** 权限模式，决定内置工具白名单 + 是否挂权限钩子，缺省 readonly */
    permissionMode?: "readonly" | "review" | "yolo";
    /** 项目 ID（可选），用于数据隔离。不传时回退到 projectDir 的 basename */
    projectId?: string;
    /** 会话 ID（可选），传此值可恢复已有会话的对话历史 */
    sessionId?: string;
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
  // 仅做基础规范化（去尾部斜杠 + 去 /v\d+ 和 /messages 后缀），
  // 不追加版本路径。Pi SDK 内部通过 ModelRegistry.registerProvider()
  // 自行处理版本路径拼接，如果这里预先追加 /v1 会导致双版本路径（如
  // /v1/v1/messages）→ 404。
  const rawBaseUrl =
    channel.baseUrl || PROVIDER_DEFAULT_URLS[channel.provider] || "";
  const baseUrl = normalizeBaseUrl(rawBaseUrl)
    .replace(/\/v\d+$/, "")
    .replace(/\/messages$/, "");

  // ── 3. 确定模型 ─────────────────────────────────────────────────────────
  const model = overrides?.model ?? getDefaultModelId(channel.models);

  // ── 4. 确定 provider ───────────────────────────────────────────────────
  // channel.provider 已在步骤 1 校验过属于 AGENT_COMPATIBLE_PROVIDERS。
  // 透传给 AgentRuntimeConfig，PiRuntime 据此调用 Pi SDK 的 registerProvider /
  // setRuntimeApiKey / find，避免硬编码 "anthropic" 导致非 anthropic 渠道
  // 模型查找失败。
  const provider = channel.provider;

  // ── 5. 确定权限模式 + 内置工具白名单 ────────────────────────────────────
  //
  // readonly：只开只读工具（read/grep/find/ls），写工具根本不进白名单，
  //   Agent 调不到，最安全。
  // yolo/review：开全部内置工具（含 write/edit/bash）。review 模式下由
  //   PiRuntime 挂 tool_call 钩子拦截写操作；yolo 全放行。
  const permissionMode = overrides?.permissionMode ?? "readonly";
  const builtinTools =
    permissionMode === "readonly" ? READONLY_BUILTIN_TOOLS : FULL_BUILTIN_TOOLS;

  // ── 6. 确定 cwd、projectDir、dataDir 和 tools ───────────────────────────
  const cwd = overrides?.cwd ?? process.cwd();
  const projectDir = overrides?.projectDir ?? cwd;
  const dataDir = overrides?.dataDir ?? "";
  const tools = overrides?.tools ?? builtinTools;

  return {
    apiKey: channel.apiKey,
    baseUrl,
    model,
    provider,
    systemPrompt: overrides?.systemPrompt,
    customTools: overrides?.customTools,
    permissionMode,
    dataDir,
    projectDir,
    cwd: projectDir,
    tools,
    sessionId: overrides?.sessionId,
    projectId: overrides?.projectId,
  };
}
