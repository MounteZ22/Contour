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
  listPiSessionFiles,
  listProductSessions,
  scanSessionMessages,
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

// ── 错误分类：参数错误 400 / 资源不存在 404 / 服务器错误 500 ──

function isParameterError(error: unknown): boolean {
  return error instanceof Error && /^无效的 (projectId|sessionId)/.test(error.message);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && /^产品会话不存在/.test(error.message);
}

// ── 辅助函数（详情接口使用；列表接口已改用轻量流式扫描） ──

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

// ── 路由 ──

router.get('/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const productSessions = listProductSessions(context.config.DATA_DIR, projectId);
    // 一次性扫描所有会话的 Pi 文件，复用结果，避免每个会话重复 findPiSessionFile
    const fileBySession = listPiSessionFiles(context.config.DATA_DIR, projectId);

    const summaries = await Promise.all(productSessions.map(async (meta): Promise<SessionSummary> => {
      const filePath = fileBySession.get(meta.id) ?? null;

      // updatedAt：优先文件 mtime（反映最新消息写入），无文件时用 registry
      let updatedAt = meta.updatedAt;
      if (filePath) {
        try {
          updatedAt = (await stat(filePath)).mtimeMs;
        } catch {
          // 使用 registry 中的 updatedAt
        }
      }

      // 轻量流式扫描：单次读取同时统计消息数并提取最后一条消息，
      // 避免 SessionManager.open() 全量解析 JSONL（列表接口 N+1 优化）
      let lastMessage = meta.lastMessage;
      let messageCount = 0;
      if (filePath) {
        try {
          const scanned = await scanSessionMessages(filePath);
          messageCount = scanned.messageCount;
          if (!lastMessage) lastMessage = scanned.lastMessage || '空会话';
        } catch {
          if (!lastMessage) lastMessage = '历史暂不可用';
        }
      } else if (!lastMessage) {
        lastMessage = '空会话';
      }

      // title：registry 优先；缺失时兜底读 SDK 会话名（带 mtime+size 缓存）
      const summary = !meta.title && filePath
        ? getSessionSummary(context.config.DATA_DIR, projectId, meta.id, filePath)
        : null;
      const title = meta.title || (summary?.title ?? `会话 ${meta.id.slice(0, 8)}`);

      return { id: meta.id, title, lastMessage, updatedAt, messageCount };
    }));

    const data = summaries
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const response: ApiResponse<SessionSummary[]> = { success: true, data };
    res.json(response);
  } catch (error) {
    console.error('[GET /api/agent/sessions/:projectId]', error);
    if (isParameterError(error)) {
      res.status(400).json({ success: false, error: '无效的项目或会话目录' });
      return;
    }
    res.status(500).json({ success: false, error: '读取会话列表失败' });
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
    if (isParameterError(error)) {
      res.status(400).json({ success: false, error: '创建会话失败：项目或会话 ID 无效' });
      return;
    }
    res.status(500).json({ success: false, error: '创建会话失败' });
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
    if (isParameterError(error)) {
      res.status(400).json({ success: false, error: '项目或会话 ID 无效' });
      return;
    }
    res.status(500).json({ success: false, error: '读取会话消息失败' });
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
    if (isParameterError(error)) {
      res.status(400).json({ success: false, error: '项目或会话 ID 无效' });
      return;
    }
    res.status(500).json({ success: false, error: '读取会话失败' });
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
    if (isParameterError(error)) {
      res.status(400).json({ success: false, error: '项目或会话 ID 无效' });
      return;
    }
    if (isNotFoundError(error)) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }
    res.status(500).json({ success: false, error: '更新会话失败' });
  }
});

router.delete('/:projectId/:sessionId', async (req, res) => {
  try {
    const deleted = await deleteProductSession(context.config.DATA_DIR, req.params.projectId, req.params.sessionId);
    if (!deleted) {
      res.status(404).json({ success: false, error: '会话不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/agent/sessions/:projectId/:sessionId]', error);
    if (isParameterError(error)) {
      res.status(400).json({ success: false, error: '项目或会话 ID 无效' });
      return;
    }
    res.status(500).json({ success: false, error: '删除会话失败' });
  }
});

return router;
}
