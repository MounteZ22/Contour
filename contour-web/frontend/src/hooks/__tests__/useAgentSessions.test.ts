import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentSessions } from '../useAgentSessions';
import type { AgentSession } from '../useAgentSessions';
import type { AIContextItem } from '../../types';

// Mock localStorage
const localStorageStore: Record<string, string> = {};

beforeEach(() => {
  // 清空 store
  Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);

  // Mock localStorage 方法
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key];
    }),
  });

  // Mock crypto.randomUUID
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '12345678-1234-1234-1234-123456789abc'),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockContextItem: AIContextItem = {
  id: 'flow-1',
  title: '测试 Flow',
  type: 'flow',
};

describe('useAgentSessions', () => {
  // ── 创建会话 ────────────────────────────────────────────────────────────
  describe('createSession', () => {
    it('应该创建新会话并返回 session 对象', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([mockContextItem]);
      });

      expect(session).toBeDefined();
      expect(session!.id).toContain('session_');
      expect(session!.title).toBe('讨论：测试 Flow');
      expect(session!.contextItems).toEqual([mockContextItem]);
      expect(session!.pinned).toBeUndefined();
    });

    it('无上下文时应该生成默认标题', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });

      expect(session!.title).toBe('新的 Agent 会话');
    });

    it('多个上下文项时标题应显示项数', () => {
      const { result } = renderHook(() => useAgentSessions());

      const items: AIContextItem[] = [
        { id: '1', title: 'A', type: 'flow' },
        { id: '2', title: 'B', type: 'doc' },
      ];

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession(items);
      });

      expect(session!.title).toBe('讨论：A 等 2 项');
    });

    it('新会话应该出现在 sessions 列表首位', () => {
      const { result } = renderHook(() => useAgentSessions());

      act(() => {
        result.current.createSession([{ id: 'a', title: 'A', type: 'flow' }]);
      });
      act(() => {
        result.current.createSession([{ id: 'b', title: 'B', type: 'doc' }]);
      });

      expect(result.current.sessions).toHaveLength(2);
      expect(result.current.sessions[0].title).toBe('讨论：B');
    });

    it('应该支持 projectId', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([], 'my-project');
      });

      expect(session!.projectId).toBe('my-project');
    });
  });

  // ── 更新会话 ────────────────────────────────────────────────────────────
  describe('updateSession', () => {
    it('应该更新会话标题', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });

      act(() => {
        result.current.updateSession(session!.id, { title: '重命名会话' });
      });

      const updated = result.current.sessions.find((s) => s.id === session!.id);
      expect(updated!.title).toBe('重命名会话');
    });

    it('应该更新 lastMessage', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });

      act(() => {
        result.current.updateSession(session!.id, { lastMessage: '你好' });
      });

      const updated = result.current.sessions.find((s) => s.id === session!.id);
      expect(updated!.lastMessage).toBe('你好');
    });

    it('应该更新 pinned 状态', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });

      act(() => {
        result.current.updateSession(session!.id, { pinned: true });
      });

      const updated = result.current.sessions.find((s) => s.id === session!.id);
      expect(updated!.pinned).toBe(true);
    });

    it('更新应该修改 updatedAt 时间', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });
      const firstUpdatedAt = session!.updatedAt;

      // 等待一小段时间确保时间戳不同
      act(() => {
        result.current.updateSession(session!.id, { title: '新标题' });
      });

      const updated = result.current.sessions.find((s) => s.id === session!.id);
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(firstUpdatedAt);
    });

    it('不应该修改 id 和 createdAt', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });
      const originalId = session!.id;
      const originalCreatedAt = session!.createdAt;

      act(() => {
        result.current.updateSession(session!.id, { title: '新标题' });
      });

      const updated = result.current.sessions.find((s) => s.id === originalId);
      expect(updated!.id).toBe(originalId);
      expect(updated!.createdAt).toBe(originalCreatedAt);
    });
  });

  // ── 删除会话 ────────────────────────────────────────────────────────────
  describe('deleteSession', () => {
    it('应该从列表中删除会话', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });
      expect(result.current.sessions).toHaveLength(1);

      act(() => {
        result.current.deleteSession(session!.id);
      });

      expect(result.current.sessions).toHaveLength(0);
    });

    it('删除不存在的会话 ID 应该不报错', () => {
      const { result } = renderHook(() => useAgentSessions());

      act(() => {
        result.current.createSession([]);
      });

      act(() => {
        result.current.deleteSession('nonexistent-session-id');
      });

      expect(result.current.sessions).toHaveLength(1);
    });

    it('应该同时删除关联的聊天记录', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });

      // 模拟聊天记录存在
      localStorageStore[`contour:chat:${session!.id}`] = '[]';

      act(() => {
        result.current.deleteSession(session!.id);
      });

      expect(localStorageStore[`contour:chat:${session!.id}`]).toBeUndefined();
    });
  });

  // ── 获取会话 ────────────────────────────────────────────────────────────
  describe('getSession', () => {
    it('应该返回匹配的会话', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });

      const found = result.current.getSession(session!.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(session!.id);
    });

    it('undefined id 应该返回 undefined', () => {
      const { result } = renderHook(() => useAgentSessions());
      expect(result.current.getSession(undefined)).toBeUndefined();
    });

    it('不存在的 id 应该返回 undefined', () => {
      const { result } = renderHook(() => useAgentSessions());
      expect(result.current.getSession('nonexistent')).toBeUndefined();
    });
  });

  // ── 持久化 ────────────────────────────────────────────────────────────
  describe('localStorage 持久化', () => {
    it('创建会话后应该写入 localStorage', () => {
      const { result } = renderHook(() => useAgentSessions());

      act(() => {
        result.current.createSession([]);
      });

      const stored = localStorageStore['contour:agent-sessions'];
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored);
      expect(parsed).toHaveLength(1);
    });

    it('重新挂载后应该从 localStorage 恢复', () => {
      // 第一次挂载，创建会话
      const { result: first, unmount } = renderHook(() => useAgentSessions());
      act(() => {
        first.current.createSession([mockContextItem]);
      });
      unmount();

      // 第二次挂载，应从 localStorage 恢复
      const { result: second } = renderHook(() => useAgentSessions());
      expect(second.current.sessions).toHaveLength(1);
      expect(second.current.sessions[0].title).toBe('讨论：测试 Flow');
    });

    it('更新后应该持久化到 localStorage', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });
      act(() => {
        result.current.updateSession(session!.id, { title: '已更新' });
      });

      const stored = JSON.parse(localStorageStore['contour:agent-sessions']);
      const found = stored.find((s: AgentSession) => s.id === session!.id);
      expect(found.title).toBe('已更新');
    });

    it('删除后应该从 localStorage 移除', () => {
      const { result } = renderHook(() => useAgentSessions());

      let session: AgentSession | undefined;
      act(() => {
        session = result.current.createSession([]);
      });
      act(() => {
        result.current.deleteSession(session!.id);
      });

      const stored = JSON.parse(localStorageStore['contour:agent-sessions']);
      expect(stored).toHaveLength(0);
    });
  });
});
