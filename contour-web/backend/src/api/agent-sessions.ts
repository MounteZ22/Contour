/**
 * Agent 会话持久化 API
 *
 * 提供会话列表查询、消息历史获取、会话创建和删除功能。
 * 数据来源为 Pi SDK SessionManager 自动持久化的 JSONL 文件，
 * 存储路径：{dataDir}/projects/{projectId}/sessions/{timestamp}_{sessionId}.jsonl
 */

import { Router } from 'express';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse } from '../types.js';

const router = Router();

// ── 类型定义 ────────────────────────────────────────────────────────────────────

/** 会话列表项 */
interface SessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  messageCount: number;
}

// ── 工具函数 ────────────────────────────────────────────────────────────────────

/**
 * 从会话文件名中提取 sessionId
 * 文件命名格式：{timestamp}_{sessionId}.jsonl
 */
function extractSessionId(filename: string): string | null {
  const match = filename.match(/^\d+_(.+)\.jsonl$/);
  return match?.[1] ?? null;
}

/**
 * 解析 JSONL 文件，返回解析后的 JSON 对象数组
 * 忽略空行和解析失败的行（保证部分损坏的会话文件仍可读取）
 */
async function parseJsonlFile(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const records: Record<string, unknown>[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // 忽略解析失败的行（JSONL 中途损坏不影响前后行）
    }
  }

  return records;
}

/**
 * 从 JSONL 记录数组中提取最后一条有意义的文本内容
 * 倒序遍历，优先匹配已知的 Pi SDK 事件/消息字段
 */
function extractLastMessage(records: Record<string, unknown>[]): string {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];

    // 直接包含 content 字段的记录（如 user message）
    if (typeof r.content === 'string' && r.content.trim()) {
      const text = r.content;
      // content 可能是字符串化的 JSON 数组（Anthropic content block 格式）
      if (text.startsWith('[')) {
        try {
          const blocks = JSON.parse(text);
          if (Array.isArray(blocks)) {
            const textBlock = blocks.find(
              (b: unknown) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text',
            );
            if (textBlock && typeof (textBlock as Record<string, unknown>).text === 'string') {
              return ((textBlock as Record<string, unknown>).text as string).slice(0, 100);
            }
          }
        } catch {
          // 不是 JSON 数组，当作普通文本
        }
      }
      return text.slice(0, 100);
    }

    // Pi SDK message_update.assistantMessageEvent.text_delta 事件（实际 JSONL 格式）
    if (r.type === 'message_update') {
      const sub = r.assistantMessageEvent as Record<string, unknown> | undefined;
      if (sub?.type === 'text_delta' && typeof sub.delta === 'string' && sub.delta.trim()) {
        return (sub.delta as string).slice(0, 100);
      }
    }

    // Pi SDK message_update.text_delta 事件（简化格式，向后兼容）
    if (r.type === 'text_delta' && typeof r.delta === 'string' && r.delta.trim()) {
      return (r.delta as string).slice(0, 100);
    }

    // 带 message 字段的通用记录
    if (typeof r.message === 'string' && r.message.trim()) {
      return (r.message as string).slice(0, 100);
    }
  }
  return '空会话';
}

/**
 * 校验 projectId 格式：仅允许字母、数字、短横线、下划线和中文
 * 防止路径穿越攻击（如 ../ 等）
 */
function validateProjectId(projectId: string): void {
  if (!projectId || !/^[\w\-一-鿿]+$/.test(projectId)) {
    throw new Error(`无效的 projectId: ${projectId}`);
  }
}

/**
 * 获取指定项目的会话目录路径
 * 包含路径穿越防护：白名单校验 + resolve/relative 双重保障
 */
function getSessionsDir(projectId: string): string {
  validateProjectId(projectId);
  const baseDir = path.resolve(CONFIG.DATA_DIR, 'projects');
  const targetDir = path.resolve(baseDir, projectId, 'sessions');
  // 确保解析后的路径仍在 baseDir 之下，防止 ../ 穿越
  if (!targetDir.startsWith(baseDir + path.sep)) {
    throw new Error(`路径穿越检测: ${projectId}`);
  }
  return targetDir;
}

// ── GET /api/agent/sessions/:projectId ──────────────────────────────────────────
// 列出项目下所有会话（返回 id, title, lastMessage, updatedAt, messageCount）

router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const sessionsDir = getSessionsDir(projectId);

    // 读取目录下所有 .jsonl 文件
    let files: string[];
    try {
      files = (await readdir(sessionsDir)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      // 目录不存在（项目尚无会话）→ 返回空列表
      const response: ApiResponse<SessionSummary[]> = { success: true, data: [] };
      res.json(response);
      return;
    }

    // 并行解析所有会话文件，构建摘要列表
    const sessions: SessionSummary[] = await Promise.all(
      files.map(async (filename) => {
        const sessionId = extractSessionId(filename);
        if (!sessionId) return null;

        const filePath = path.join(sessionsDir, filename);
        let records: Record<string, unknown>[];
        try {
          records = await parseJsonlFile(filePath);
        } catch {
          // 文件读取失败 → 跳过该文件
          return null;
        }

        // 使用 fs.stat 获取文件实际修改时间（mtime），
        // 解决文件名创建后永不更新导致 updatedAt 不准确的问题
        let updatedAt: number;
        try {
          const fileStat = await stat(filePath);
          updatedAt = fileStat.mtimeMs;
        } catch {
          // stat 失败时降级使用文件名时间戳
          const timestampMatch = filename.match(/^(\d+)_/);
          updatedAt = timestampMatch ? parseInt(timestampMatch[1], 10) : 0;
        }

        return {
          id: sessionId,
          title: `会话 ${sessionId.slice(0, 8)}`,
          lastMessage: extractLastMessage(records),
          updatedAt,
          messageCount: records.length,
        } satisfies SessionSummary;
      }),
    );

    // 过滤 null 项并按更新时间降序排列
    const validSessions = sessions
      .filter((s): s is SessionSummary => s !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const response: ApiResponse<SessionSummary[]> = { success: true, data: validSessions };
    res.json(response);
  } catch (err) {
    console.error(`[GET /api/agent/sessions/:projectId]`, err);
    res.status(500).json({ success: false, error: '获取会话列表失败' });
  }
});

// ── POST /api/agent/sessions/:projectId ─────────────────────────────────────────
// 创建新会话文件（写入一条元数据记录，后续 Pi SDK SessionManager 可 open 追加）

router.post('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sessionId, title } = req.body as { sessionId?: string; title?: string };

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: '缺少 sessionId 参数' });
      return;
    }

    const sessionsDir = getSessionsDir(projectId);
    await mkdir(sessionsDir, { recursive: true });

    // 检查是否已存在同名会话文件（按 sessionId 匹配）
    let existingFiles: string[];
    try {
      existingFiles = await readdir(sessionsDir);
    } catch {
      existingFiles = [];
    }
    const existingFile = existingFiles.find((f) => extractSessionId(f) === sessionId);
    if (existingFile) {
      // 会话文件已存在，直接返回现有摘要
      const filePath = path.join(sessionsDir, existingFile);
      const records = await parseJsonlFile(filePath);

      let updatedAt: number;
      try {
        const fileStat = await stat(filePath);
        updatedAt = fileStat.mtimeMs;
      } catch {
        const timestampMatch = existingFile.match(/^(\d+)_/);
        updatedAt = timestampMatch ? parseInt(timestampMatch[1], 10) : Date.now();
      }

      const session: SessionSummary = {
        id: sessionId,
        title: title || `会话 ${sessionId.slice(0, 8)}`,
        lastMessage: extractLastMessage(records),
        updatedAt,
        messageCount: records.length,
      };
      res.json({ success: true, data: session });
      return;
    }

    // 创建新的会话文件（使用 wx 标志原子创建，避免 TOCTOU 竞态条件）
    const timestamp = Date.now();
    const filename = `${timestamp}_${sessionId}.jsonl`;
    const filePath = path.join(sessionsDir, filename);

    const metadataLine = JSON.stringify({
      type: 'session_created',
      sessionId,
      title: title || `会话 ${sessionId.slice(0, 8)}`,
      createdAt: timestamp,
    }) + '\n';

    // 使用 wx 标志：文件不存在时创建，已存在则抛出 EEXIST
    try {
      await writeFile(filePath, metadataLine, { flag: 'wx', encoding: 'utf-8' });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // 文件已被并发请求创建，返回已存在的会话摘要
        const records = await parseJsonlFile(filePath);
        const session: SessionSummary = {
          id: sessionId,
          title: title || `会话 ${sessionId.slice(0, 8)}`,
          lastMessage: extractLastMessage(records),
          updatedAt: timestamp,
          messageCount: records.length,
        };
        res.json({ success: true, data: session });
        return;
      }
      throw err;
    }

    // 二次检查：防止同一 sessionId 不同时间戳的竞态（两个并发请求的
    // Date.now() 可能返回不同毫秒值，wx 标志无法阻止不同文件名同时创建）
    const postCreateFiles = await readdir(sessionsDir);
    const duplicate = postCreateFiles.find(
      (f) => f !== filename && extractSessionId(f) === sessionId,
    );
    if (duplicate) {
      // 已有更早创建的会话文件，删除刚创建的，返回已有的
      await unlink(filePath);
      const existingPath = path.join(sessionsDir, duplicate);
      const records = await parseJsonlFile(existingPath);
      const dupTimestampMatch = duplicate.match(/^(\d+)_/);
      const dupTimestamp = dupTimestampMatch ? parseInt(dupTimestampMatch[1], 10) : timestamp;

      const session: SessionSummary = {
        id: sessionId,
        title: title || `会话 ${sessionId.slice(0, 8)}`,
        lastMessage: extractLastMessage(records),
        updatedAt: dupTimestamp,
        messageCount: records.length,
      };
      res.json({ success: true, data: session });
      return;
    }

    const session: SessionSummary = {
      id: sessionId,
      title: title || `会话 ${sessionId.slice(0, 8)}`,
      lastMessage: '空会话',
      updatedAt: timestamp,
      messageCount: 1,
    };

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    console.error(`[POST /api/agent/sessions/:projectId]`, err);
    res.status(500).json({ success: false, error: '创建会话失败' });
  }
});

// ── GET /api/agent/sessions/:projectId/:sessionId ───────────────────────────────
// 获取单个会话的完整消息历史（解析 JSONL 返回消息数组）

router.get('/:projectId/:sessionId', async (req, res) => {
  try {
    const { projectId, sessionId } = req.params;
    const sessionsDir = getSessionsDir(projectId);

    // 列出目录文件，按 sessionId 匹配
    let files: string[];
    try {
      files = await readdir(sessionsDir);
    } catch {
      res.status(404).json({ success: false, error: '项目会话目录不存在' });
      return;
    }

    const matchFile = files.find((f) => extractSessionId(f) === sessionId);
    if (!matchFile) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }

    const filePath = path.join(sessionsDir, matchFile);
    const records = await parseJsonlFile(filePath);

    const response: ApiResponse<Record<string, unknown>[]> = { success: true, data: records };
    res.json(response);
  } catch (err) {
    console.error(`[GET /api/agent/sessions/:projectId/:sessionId]`, err);
    res.status(500).json({ success: false, error: '获取会话消息失败' });
  }
});

// ── DELETE /api/agent/sessions/:projectId/:sessionId ────────────────────────────
// 删除指定会话文件

router.delete('/:projectId/:sessionId', async (req, res) => {
  try {
    const { projectId, sessionId } = req.params;
    const sessionsDir = getSessionsDir(projectId);

    let files: string[];
    try {
      files = await readdir(sessionsDir);
    } catch {
      res.status(404).json({ success: false, error: '项目会话目录不存在' });
      return;
    }

    const matchFile = files.find((f) => extractSessionId(f) === sessionId);
    if (!matchFile) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }

    const filePath = path.join(sessionsDir, matchFile);
    await unlink(filePath);

    res.json({ success: true });
  } catch (err) {
    console.error(`[DELETE /api/agent/sessions/:projectId/:sessionId]`, err);
    res.status(500).json({ success: false, error: '删除会话失败' });
  }
});

export default router;
