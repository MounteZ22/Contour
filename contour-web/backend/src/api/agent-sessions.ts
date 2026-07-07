/**
 * Agent 会话持久化 API
 *
 * 提供会话列表查询、消息历史获取和会话删除功能。
 * 数据来源为 Pi SDK SessionManager 自动持久化的 JSONL 文件，
 * 存储路径：{dataDir}/projects/{projectId}/sessions/{timestamp}_{sessionId}.jsonl
 */

import { Router } from 'express';
import { readFile, readdir, unlink } from 'fs/promises';
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

    // Pi SDK message_update.text_delta 事件
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
 * 获取指定项目的会话目录路径
 */
function getSessionsDir(projectId: string): string {
  return path.join(CONFIG.DATA_DIR, 'projects', projectId, 'sessions');
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

        // 从文件名提取时间戳（毫秒级 Unix 时间）
        const timestampMatch = filename.match(/^(\d+)_/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1], 10) : 0;

        return {
          id: sessionId,
          title: `会话 ${sessionId.slice(0, 8)}`,
          lastMessage: extractLastMessage(records),
          updatedAt: timestamp,
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
