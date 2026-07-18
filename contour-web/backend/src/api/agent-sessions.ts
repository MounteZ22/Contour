/**
 * Agent 会话持久化 API
 *
 * Pi SessionManager 是 JSONL 格式和会话身份的唯一真相源。Contour 只负责
 * 项目级列表、读取和删除，不再手工拼装 SDK 私有格式。
 */

import { Router } from 'express';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { CONFIG } from '../config.js';
import type { ApiResponse } from '../types.js';
import {
  deleteProductSession,
  ensureProductSession,
  findPiSessionFile,
  listProductSessions,
} from '../agent/session-storage.js';

const router = Router();

interface SessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  messageCount: number;
}

async function parseJsonlFile(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await readFile(filePath, 'utf-8');
  const records: Record<string, unknown>[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // 保留其他有效记录，让部分损坏的会话仍可检查和导出。
    }
  }
  return records;
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === 'object')
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}

function extractLastMessage(records: Record<string, unknown>[]): string {
  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index];
    if (record.type === 'message' && record.message && typeof record.message === 'object') {
      const message = record.message as Record<string, unknown>;
      const text = textFromContent(message.content).trim();
      if (text) return text.slice(0, 100);
    }

    // 兼容 Contour 早期记录格式。
    const legacyText = textFromContent(record.content).trim();
    if (legacyText) return legacyText.slice(0, 100);
  }
  return '空会话';
}

function getSessionTitle(manager: SessionManager, sessionId: string): string {
  return manager.getSessionName()?.trim() || `会话 ${sessionId.slice(0, 8)}`;
}

router.get('/:projectId', async (req, res) => {
  try {
    const productSessions = listProductSessions(CONFIG.DATA_DIR, req.params.projectId);
    const summaries = await Promise.all(productSessions.map(async (meta): Promise<SessionSummary> => {
      const filePath = findPiSessionFile(CONFIG.DATA_DIR, req.params.projectId, meta.id);
      if (!filePath) {
        return {
          id: meta.id,
          title: meta.title,
          lastMessage: '空会话',
          updatedAt: meta.updatedAt,
          messageCount: 0,
        };
      }
      try {
        const manager = SessionManager.open(filePath, path.dirname(filePath));
        const records = await parseJsonlFile(filePath);
        const fileStat = await stat(filePath);
        return {
          id: meta.id,
          title: meta.title || getSessionTitle(manager, meta.id),
          lastMessage: extractLastMessage(records),
          updatedAt: fileStat.mtimeMs,
          messageCount: manager.getEntries().filter((entry) => entry.type === 'message').length,
        };
      } catch (error) {
        console.warn(`[AgentSessions] Pi 历史不可用，保留产品会话: ${filePath}`, error);
        return {
          id: meta.id,
          title: meta.title,
          lastMessage: '历史暂不可用',
          updatedAt: meta.updatedAt,
          messageCount: 0,
        };
      }
    }));

    const data = summaries
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const response: ApiResponse<SessionSummary[]> = { success: true, data };
    res.json(response);
  } catch (error) {
    console.error('[GET /api/agent/sessions/:projectId]', error);
    res.status(400).json({ success: false, error: '无效的项目或会话目录' });
  }
});

router.post('/:projectId', async (req, res) => {
  try {
    const { sessionId, title } = req.body as { sessionId?: string; title?: string };
    if (!sessionId) {
      res.status(400).json({ success: false, error: '缺少 sessionId 参数' });
      return;
    }

    const handle = ensureProductSession(CONFIG.DATA_DIR, req.params.projectId, sessionId, title);
    const data: SessionSummary = {
      id: handle.meta.id,
      title: handle.meta.title,
      lastMessage: '空会话',
      updatedAt: handle.meta.updatedAt,
      messageCount: 0,
    };
    res.status(handle.created ? 201 : 200).json({ success: true, data });
  } catch (error) {
    console.error('[POST /api/agent/sessions/:projectId]', error);
    res.status(400).json({ success: false, error: '创建会话失败：项目或会话 ID 无效' });
  }
});

router.get('/:projectId/:sessionId', async (req, res) => {
  try {
    const filePath = findPiSessionFile(CONFIG.DATA_DIR, req.params.projectId, req.params.sessionId);
    const productSession = listProductSessions(CONFIG.DATA_DIR, req.params.projectId)
      .find((session) => session.id === req.params.sessionId);
    if (!productSession) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }
    const response: ApiResponse<Record<string, unknown>[]> = {
      success: true,
      data: filePath ? await parseJsonlFile(filePath) : [],
    };
    res.json(response);
  } catch (error) {
    console.error('[GET /api/agent/sessions/:projectId/:sessionId]', error);
    res.status(400).json({ success: false, error: '读取会话失败' });
  }
});

router.delete('/:projectId/:sessionId', async (req, res) => {
  try {
    const deleted = deleteProductSession(CONFIG.DATA_DIR, req.params.projectId, req.params.sessionId);
    if (!deleted) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/agent/sessions/:projectId/:sessionId]', error);
    res.status(400).json({ success: false, error: '删除会话失败' });
  }
});

export default router;
