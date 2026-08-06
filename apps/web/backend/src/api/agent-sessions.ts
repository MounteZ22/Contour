/**
 * Agent 会话持久化 API
 *
 * Pi SessionManager 是 JSONL 格式和会话身份的唯一真相源。Contour 只负责
 * 项目级列表、读取和删除，不再手工拼装 SDK 私有格式。
 */

import { Router } from 'express';
import type { WebHostContext } from '../host.js';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ApiResponse } from '../types.js';
import type { ChatMessage } from '@contour/shared';
import {
  deleteProductSession,
  ensureProductSession,
  findPiSessionFile,
  getSessionSummary,
  listProductSessions,
  updateProductSession,
} from '@contour/core/agent';

export function createAgentSessionsRouter(context: WebHostContext): Router {
const router = Router();

interface SessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  messageCount: number;
}

// ── 辅助函数（N+1 优化后仅用于回退路径） ──

async function parseJsonlFile(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await readFile(filePath, 'utf-8');
  const records: Record<string, unknown>[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // 部分损坏的会话仍可检查和导出
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
    // 兼容 Contour 早期记录格式
    const legacyText = textFromContent(record.content).trim();
    if (legacyText) return legacyText.slice(0, 100);
  }
  return '空会话';
}

// ── 路由 ──

router.get('/:projectId', async (req, res) => {
  try {
    const productSessions = listProductSessions(context.config.DATA_DIR, req.params.projectId);
    // 优先从 registry 读取 lastMessage（O(1)），未缓存时回退到解析 JSONL
    const summaries = await Promise.all(productSessions.map(async (meta): Promise<SessionSummary> => {
      // 尝试通过 getSessionSummary（封装 Pi SDK）获取 title 和 messageCount
      const summary = getSessionSummary(context.config.DATA_DIR, req.params.projectId, meta.id);

      if (!summary) {
        // 无 Pi 会话文件，使用 registry 中的数据
        return {
          id: meta.id,
          title: meta.title,
          lastMessage: meta.lastMessage || '空会话',
          updatedAt: meta.updatedAt,
          messageCount: 0,
        };
      }

      // O(1) 路径：优先从 registry 读取 lastMessage
      let lastMessage = meta.lastMessage;
      if (!lastMessage) {
        // 回退：从 JSONL 解析最后一条消息（兼容旧数据）
        const filePath = findPiSessionFile(context.config.DATA_DIR, req.params.projectId, meta.id);
        if (filePath) {
          try {
            const records = await parseJsonlFile(filePath);
            lastMessage = extractLastMessage(records);
          } catch {
            lastMessage = '历史暂不可用';
          }
        } else {
          lastMessage = '空会话';
        }
      }

      let updatedAt = meta.updatedAt;
      try {
        const filePath = findPiSessionFile(context.config.DATA_DIR, req.params.projectId, meta.id);
        if (filePath) {
          const fileStat = await stat(filePath);
          updatedAt = fileStat.mtimeMs;
        }
      } catch {
        // 使用 registry 中的 updatedAt
      }

      return {
        id: meta.id,
        title: meta.title || summary.title,
        lastMessage,
        updatedAt,
        messageCount: summary.messageCount,
      };
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

    const handle = await ensureProductSession(context.config.DATA_DIR, req.params.projectId, sessionId, title);
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

router.get('/:projectId/:sessionId/messages', async (req, res) => {
  try {
    const productSession = listProductSessions(context.config.DATA_DIR, req.params.projectId)
      .find((session) => session.id === req.params.sessionId);
    if (!productSession) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }
    const messages = await context.coreServices.messageHistory.readSessionMessages(
      req.params.projectId,
      req.params.sessionId,
    );
    // 无 Pi 会话文件时按空会话处理（success + []），前端不应降级到 localStorage
    const response: ApiResponse<ChatMessage[]> = { success: true, data: messages ?? [] };
    res.json(response);
  } catch (error) {
    console.error('[GET /api/agent/sessions/:projectId/:sessionId/messages]', error);
    res.status(400).json({ success: false, error: '读取会话消息失败' });
  }
});

router.get('/:projectId/:sessionId', async (req, res) => {
  try {
    const filePath = findPiSessionFile(context.config.DATA_DIR, req.params.projectId, req.params.sessionId);
    const productSession = listProductSessions(context.config.DATA_DIR, req.params.projectId)
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

router.patch('/:projectId/:sessionId', async (req, res) => {
  try {
    const { title } = req.body as { title?: unknown };
    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, error: '会话标题不能为空' });
      return;
    }

    const meta = await updateProductSession(
      context.config.DATA_DIR,
      req.params.projectId,
      req.params.sessionId,
      { title: title.trim() },
    );
    const data: SessionSummary = {
      id: meta.id,
      title: meta.title,
      lastMessage: meta.lastMessage || '空会话',
      updatedAt: meta.updatedAt,
      messageCount: getSessionSummary(context.config.DATA_DIR, req.params.projectId, meta.id)?.messageCount ?? 0,
    };
    res.json({ success: true, data });
  } catch (error) {
    console.error('[PATCH /api/agent/sessions/:projectId/:sessionId]', error);
    res.status(404).json({ success: false, error: '会话不存在或参数无效' });
  }
});

router.delete('/:projectId/:sessionId', async (req, res) => {
  try {
    const deleted = deleteProductSession(context.config.DATA_DIR, req.params.projectId, req.params.sessionId);
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

return router;
}
