import { useCallback, useEffect, useState } from 'react';
import type { AIContextItem } from '../types';

export interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  contextItems: AIContextItem[];
  lastMessage?: string;
  pinned?: boolean;
  /** 创建会话时的项目 ID，用于后端定位项目目录 */
  projectId?: string;
}

const SESSIONS_STORAGE_KEY = 'contour:agent-sessions';
const SESSIONS_UPDATED_EVENT = 'contour:sessions-updated';

// ── localStorage 读写 ───────────────────────────────────────────────────────────

function readSessions(): AgentSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions: AgentSession[]) {
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new Event(SESSIONS_UPDATED_EVENT));
}

function filterSessionsByProject(sessions: AgentSession[], projectId?: string): AgentSession[] {
  return projectId ? sessions.filter((session) => session.projectId === projectId) : sessions;
}

// ── 后端 API 类型 ───────────────────────────────────────────────────────────────

/** 后端返回的会话摘要 */
interface BackendSessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  messageCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── 工具函数 ────────────────────────────────────────────────────────────────────

function defaultSessionTitle(contextItems: AIContextItem[]) {
  if (contextItems.length === 0) return '新的 Agent 会话';
  const first = contextItems[0];
  const suffix = contextItems.length > 1 ? ` 等 ${contextItems.length} 项` : '';
  return `讨论：${first.title}${suffix}`;
}

/**
 * 从后端获取项目下的会话列表
 * 失败时返回 null（调用方降级到 localStorage）
 */
async function fetchBackendSessions(projectId: string): Promise<BackendSessionSummary[] | null> {
  try {
    const res = await fetch(`/api/agent/sessions/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    const json: ApiResponse<BackendSessionSummary[]> = await res.json();
    if (!json.success || !Array.isArray(json.data)) return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * 将后端会话摘要合并到 localStorage 的 AgentSession 列表中
 *
 * 合并策略：
 * - 后端有 + localStorage 有 → 以后端数据为主（id/title/lastMessage/updatedAt），
 *   保留 localStorage 独有的字段（contextItems/pinned/projectId）
 * - 后端有 + localStorage 无 → 用后端数据构建最小 AgentSession
 * - 后端无 + localStorage 有 → 保留（可能是其他项目的会话或刚创建尚未持久化的会话）
 */
function mergeSessions(
  backendSessions: BackendSessionSummary[],
  localSessions: AgentSession[],
  targetProjectId: string,
): AgentSession[] {
  const localMap = new Map(localSessions.map((s) => [s.id, s]));

  const merged: AgentSession[] = backendSessions.map((bs) => {
    const local = localMap.get(bs.id);
    return {
      id: bs.id,
      title: bs.title || local?.title || '新的 Agent 会话',
      createdAt: local?.createdAt ?? bs.updatedAt,
      updatedAt: bs.updatedAt,
      contextItems: local?.contextItems ?? [],
      lastMessage: local?.lastMessage || bs.lastMessage,
      pinned: local?.pinned,
      projectId: local?.projectId ?? targetProjectId,
    };
  });

  // 追加 local 专属的会话（后端没有的）
  for (const ls of localSessions) {
    if (!backendSessions.some((bs) => bs.id === ls.id)) {
      merged.push(ls);
    }
  }

  // 按更新时间降序排列
  merged.sort((a, b) => b.updatedAt - a.updatedAt);

  return merged;
}

// ── Hook ────────────────────────────────────────────────────────────────────────

/**
 * Agent 会话管理 Hook
 *
 * @param projectId - 可选的项目 ID，传入后会从后端 API 获取该项目的会话列表
 *                    并合并到 localStorage 中；不传则仅使用 localStorage
 */
export function useAgentSessions(projectId?: string) {
  const [sessions, setSessions] = useState<AgentSession[]>(() =>
    filterSessionsByProject(readSessions(), projectId),
  );

  const refresh = useCallback(() => {
    setSessions(filterSessionsByProject(readSessions(), projectId));
  }, [projectId]);

  // ── 初始化 & projectId 变化时从后端加载 ──────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      // 无 projectId 时直接读 localStorage（保持向后兼容）
      setSessions(readSessions());
      return;
    }

    let cancelled = false;

    // 一次性迁移：清理无 projectId 的旧会话记录
    const allSessions = readSessions();
    const orphaned = allSessions.filter((s) => !s.projectId);
    if (orphaned.length > 0) {
      const cleaned = allSessions.filter((s) => s.projectId);
      writeSessions(cleaned);
    }

    fetchBackendSessions(projectId).then((backendSessions) => {
      if (cancelled) return;
      if (backendSessions) {
        const localSessions = readSessions();
        const merged = mergeSessions(backendSessions, localSessions, projectId);
        setSessions(filterSessionsByProject(merged, projectId));
        // 同步合并后的列表到 localStorage，保持离线缓存最新
        writeSessions(merged);
      } else {
        // 后端不可用 → 降级到 localStorage
        setSessions(filterSessionsByProject(readSessions(), projectId));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── 跨标签页 / 事件同步 ──────────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('storage', refresh);
    window.addEventListener(SESSIONS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SESSIONS_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  // ── 创建会话 ──────────────────────────────────────────────────────────────
  const createSession = useCallback(
    (contextItems: AIContextItem[] = [], sessionProjectId?: string) => {
      const now = Date.now();
      const session: AgentSession = {
        id: `session_${crypto.randomUUID().slice(0, 8)}`,
        title: defaultSessionTitle(contextItems),
        createdAt: now,
        updatedAt: now,
        contextItems,
        projectId: sessionProjectId || projectId,
      };
      const next = [session, ...readSessions()];
      writeSessions(next);
      setSessions(filterSessionsByProject(next, projectId));

      // 异步通知后端创建会话文件（静默失败，localStorage 已更新）
      const effectiveProjectId = sessionProjectId || projectId;
      if (effectiveProjectId) {
        fetch(`/api/agent/sessions/${encodeURIComponent(effectiveProjectId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, title: session.title }),
        }).catch((err) => {
          console.warn('[AgentSessions] 后端创建会话失败，已降级到 localStorage:', err);
        });
      }

      return session;
    },
    [projectId],
  );

  // ── 更新会话 ──────────────────────────────────────────────────────────────
  const updateSession = useCallback(
    (sessionId: string, patch: Partial<Omit<AgentSession, 'id' | 'createdAt'>>) => {
      const allSessions = readSessions();
      const targetSession = allSessions.find((session) => session.id === sessionId);
      const next = allSessions.map((session) =>
        session.id === sessionId ? { ...session, ...patch, updatedAt: Date.now() } : session,
      );
      writeSessions(next);
      setSessions(filterSessionsByProject(next, projectId));

      if (typeof patch.title === 'string' && targetSession?.projectId) {
        fetch(
          `/api/agent/sessions/${encodeURIComponent(targetSession.projectId)}/${encodeURIComponent(sessionId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: patch.title }),
          },
        ).catch((err) => {
          console.warn('[AgentSessions] 后端重命名会话失败，已保留本地标题:', err);
        });
      }
    },
    [projectId],
  );

  // ── 删除会话 ──────────────────────────────────────────────────────────────
  const deleteSession = useCallback((sessionId: string) => {
    const allSessions = readSessions();
    const targetSession = allSessions.find((s) => s.id === sessionId);

    // 异步通知后端删除会话文件（静默失败，localStorage 仍会清理）
    if (targetSession?.projectId) {
      fetch(
        `/api/agent/sessions/${encodeURIComponent(targetSession.projectId)}/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' },
      ).catch((err) => {
        console.warn('[AgentSessions] 后端删除会话失败，已从 localStorage 清理:', err);
      });
    }

    const next = allSessions.filter((session) => session.id !== sessionId);
    localStorage.removeItem(`contour:chat:${sessionId}`);
    writeSessions(next);
    setSessions(filterSessionsByProject(next, projectId));
  }, [projectId]);

  // ── 获取单个会话 ──────────────────────────────────────────────────────────
  const getSession = useCallback((sessionId: string | undefined) => {
    if (!sessionId) return undefined;
    return readSessions().find((session) => session.id === sessionId);
  }, []);

  return {
    sessions,
    createSession,
    updateSession,
    deleteSession,
    getSession,
  };
}
