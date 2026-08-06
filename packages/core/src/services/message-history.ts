/**
 * 消息历史恢复服务
 *
 * 将 Pi SDK 的会话 JSONL（v3 最终格式）转换为前端可直接渲染的
 * @contour/shared ChatMessage[]。只消费最终 `message` 记录，
 * 不依赖 text_delta / turn_end 等流式事件；未知或损坏记录容错跳过。
 *
 * 转换要点：
 * - user / assistant 的 text 块拼接为 content
 * - assistant 的 toolCall 块映射为 ToolActivity.input
 * - 后续 role=toolResult 的记录按 toolCallId 回填 result 与 error 状态
 * - Write / Edit 的 arguments.path | arguments.file_path 推导 filesChanged（去重）
 * - 以 user 消息为边界推导一致的 1-based turnIndex（仅 assistant 消息携带，
 *   与前端 TurnGroup 分组语义一致）
 * - 不展示 thinking / system 内容
 */

import { readFile, stat } from 'node:fs/promises';
import type { CoreRuntimeConfig } from '../runtime/config.js';
import type { ChatMessage, ToolActivity } from '@contour/shared';
import { findPiSessionFile } from '../agent/session-storage.js';

/** 单条 JSONL 记录的松散类型（只读取我们关心的字段） */
interface JsonlRecord {
  type?: unknown;
  message?: unknown;
  id?: unknown;
}

/** 内容块：text / toolCall（其余如 thinking 一律忽略） */
interface ContentBlock {
  type: string;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  arguments?: unknown;
}

interface ToolResultPayload {
  role?: unknown;
  toolCallId?: unknown;
  isError?: unknown;
  content?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 提取内容块中的文本（跳过 thinking 等不可展示块） */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is ContentBlock => isRecord(block))
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}

/** 提取 assistant 内容块中的 toolCall 列表 */
function extractToolCalls(content: unknown): ContentBlock[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is ContentBlock => isRecord(block))
    .filter((block) => block.type === 'toolCall' && typeof block.name === 'string');
}

/** 从 Write/Edit 参数推导被修改的文件路径（path 或 file_path 兼容） */
function filesChangedFromToolCalls(toolCalls: ContentBlock[]): string[] | undefined {
  const files = new Set<string>();
  for (const toolCall of toolCalls) {
    if (toolCall.name !== 'Write' && toolCall.name !== 'Edit') continue;
    const args = isRecord(toolCall.arguments) ? toolCall.arguments : undefined;
    const filePath = args?.path ?? args?.file_path;
    if (typeof filePath === 'string' && filePath) files.add(filePath);
  }
  return files.size > 0 ? [...files] : undefined;
}

/** 逐行读取 JSONL，跳过空行与损坏行，产出可解析的记录 */
export function* iterJsonlRecords(content: string): Generator<JsonlRecord, void, unknown> {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as unknown;
      if (isRecord(record)) yield record as JsonlRecord;
    } catch {
      // 损坏行直接跳过，保证部分损坏的会话仍可恢复
    }
  }
}

/**
 * 将 Pi v3 会话 JSONL 转换为 ChatMessage[]
 *
 * 纯函数，方便单测；service 层负责从文件读取。
 */
export function parseSessionJsonl(content: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  // toolCallId → 已生成的 ToolActivity（跨多条 assistant 记录跟踪，用于回填）
  const pendingActivities = new Map<string, ToolActivity>();
  // 以 user 消息为边界递增；assistant 消息沿用当前轮次
  let turnCounter = 0;
  let messageIndex = 0;

  for (const record of iterJsonlRecords(content)) {
    if (record.type !== 'message' || !isRecord(record.message)) continue;
    const message = record.message;

    if (message.role === 'user') {
      turnCounter += 1;
      messages.push({
        id: typeof record.id === 'string' ? record.id : `hist_${messageIndex++}`,
        role: 'user',
        content: extractText(message.content),
      });
      continue;
    }

    if (message.role === 'assistant') {
      const text = extractText(message.content);
      const toolCalls = extractToolCalls(message.content);
      const turnIndex = turnCounter > 0 ? turnCounter : 1;

      const toolActivities: ToolActivity[] = toolCalls.map((toolCall) => {
        const activity: ToolActivity = {
          id: typeof toolCall.id === 'string' ? toolCall.id : undefined,
          toolName: toolCall.name as string,
          status: 'running',
          input: isRecord(toolCall.arguments) ? toolCall.arguments : undefined,
        };
        if (activity.id) pendingActivities.set(activity.id, activity);
        return activity;
      });

      messages.push({
        id: typeof record.id === 'string' ? record.id : `hist_${messageIndex++}`,
        role: 'assistant',
        // 纯工具调用轮也必须生成消息，前端会展示 toolActivities；无文本时 content 为空串
        content: text,
        turnIndex,
        filesChanged: filesChangedFromToolCalls(toolCalls),
        toolActivities: toolActivities.length > 0 ? toolActivities : undefined,
      });
      continue;
    }

    if (message.role === 'toolResult') {
      const payload = message as ToolResultPayload;
      const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined;
      if (!toolCallId) continue;
      const activity = pendingActivities.get(toolCallId);
      if (!activity) continue; // 找不到对应 toolCall（记录被裁剪等），跳过
      activity.status = payload.isError ? 'error' : 'done';
      const resultText = extractText(payload.content).trim();
      activity.result = resultText || (payload.isError ? '工具执行出错' : undefined);
      continue;
    }

    // 其他 role（system / thinking 等）不展示，直接跳过
  }

  return messages;
}

// ── 进程内缓存 ────────────────────────────────────────────────────────────────

interface MessageHistoryCacheEntry {
  mtimeMs: number;
  size: number;
  messages: ChatMessage[];
}

/**
 * 创建消息历史服务。
 *
 * 缓存按文件绝对路径为 key，以 mtimeMs + size 作为失效条件；
 * 缓存 Map 随每次 createMessageHistoryService 新建，天然不跨 Core container 共享。
 */
export function createMessageHistoryService(config: CoreRuntimeConfig) {
  const cache = new Map<string, MessageHistoryCacheEntry>();

  async function readSessionMessages(
    projectId: string,
    productSessionId: string,
  ): Promise<ChatMessage[] | null> {
    const filePath = findPiSessionFile(config.dataDir, projectId, productSessionId);
    if (!filePath) return null;

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      // 文件在注册后被删除，视为无会话文件
      cache.delete(filePath);
      return null;
    }

    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      return cached.messages;
    }

    const content = await readFile(filePath, 'utf-8');
    const messages = parseSessionJsonl(content);
    cache.set(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, messages });
    return messages;
  }

  function invalidateCache(filePath?: string): void {
    if (filePath) {
      cache.delete(filePath);
    } else {
      cache.clear();
    }
  }

  return Object.freeze({
    parse: parseSessionJsonl,
    readSessionMessages,
    invalidateCache,
  });
}

export type MessageHistoryService = ReturnType<typeof createMessageHistoryService>;
