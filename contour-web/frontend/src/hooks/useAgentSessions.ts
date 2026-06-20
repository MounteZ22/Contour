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
}

const SESSIONS_STORAGE_KEY = 'contour:agent-sessions';
const SESSIONS_UPDATED_EVENT = 'contour:sessions-updated';

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

function defaultSessionTitle(contextItems: AIContextItem[]) {
  if (contextItems.length === 0) return '新的 Agent 会话';
  const first = contextItems[0];
  const suffix = contextItems.length > 1 ? ` 等 ${contextItems.length} 项` : '';
  return `讨论：${first.title}${suffix}`;
}

export function useAgentSessions() {
  const [sessions, setSessions] = useState<AgentSession[]>(() => readSessions());

  const refresh = useCallback(() => {
    setSessions(readSessions());
  }, []);

  useEffect(() => {
    window.addEventListener('storage', refresh);
    window.addEventListener(SESSIONS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SESSIONS_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  const createSession = useCallback((contextItems: AIContextItem[] = []) => {
    const now = Date.now();
    const session: AgentSession = {
      id: `session_${crypto.randomUUID().slice(0, 8)}`,
      title: defaultSessionTitle(contextItems),
      createdAt: now,
      updatedAt: now,
      contextItems,
    };
    const next = [session, ...readSessions()];
    writeSessions(next);
    setSessions(next);
    return session;
  }, []);

  const updateSession = useCallback((sessionId: string, patch: Partial<Omit<AgentSession, 'id' | 'createdAt'>>) => {
    const next = readSessions().map((session) =>
      session.id === sessionId ? { ...session, ...patch, updatedAt: Date.now() } : session,
    );
    writeSessions(next);
    setSessions(next);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    const next = readSessions().filter((session) => session.id !== sessionId);
    localStorage.removeItem(`contour:chat:${sessionId}`);
    writeSessions(next);
    setSessions(next);
  }, []);

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
