import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── 用 vi.hoisted 定义 mock 变量，确保 vi.mock 工厂能访问 ─────────────────
const { mockSendChatMessageStream, mockRespondToPermission } = vi.hoisted(() => ({
  mockSendChatMessageStream: vi.fn(),
  mockRespondToPermission: vi.fn(),
}));

vi.mock('../../state/aiApi', () => ({
  sendChatMessageStream: mockSendChatMessageStream,
  respondToPermission: mockRespondToPermission,
}));

// ── Mock localStorage ─────────────────────────────────────────────────────
const localStorageStore: Record<string, string> = {};

beforeEach(() => {
  Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key];
    }),
  });

  mockSendChatMessageStream.mockReset();
  mockRespondToPermission.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { useChat } from '../useChat';

function createKeyDownEvent(key: string, shiftKey = false): React.KeyboardEvent<HTMLInputElement> {
  return {
    key,
    shiftKey,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe('useChat', () => {
  // ── 初始状态 ────────────────────────────────────────────────────────────
  describe('初始状态', () => {
    it('初始 messages 应该为空数组', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.messages).toEqual([]);
    });

    it('初始 inputValue 应该为空字符串', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.inputValue).toBe('');
    });

    it('初始 isLoading 应该为 false', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isLoading).toBe(false);
    });

    it('初始 isStreaming 应该为 false', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isStreaming).toBe(false);
    });

    it('初始 streamingContent 应该为空字符串', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.streamingContent).toBe('');
    });

    it('初始 toolActivities 应该为空数组', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.toolActivities).toEqual([]);
    });

    it('初始 error 应该为 null', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.error).toBeNull();
    });

    it('初始 permissionMode 应该为 readonly', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.permissionMode).toBe('readonly');
    });

    it('初始 permissionRequest 应该为 null', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.permissionRequest).toBeNull();
    });
  });

  // ── 输入管理 ────────────────────────────────────────────────────────────
  describe('输入管理', () => {
    it('setInputValue 应该更新输入值', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setInputValue('你好');
      });

      expect(result.current.inputValue).toBe('你好');
    });

    it('handleKeyDown Enter 键应该触发发送', async () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setInputValue('测试消息');
      });

      // Mock sendChatMessageStream 返回一个 pending promise
      let resolveStream: (() => void) | undefined;
      mockSendChatMessageStream.mockImplementation(
        () => new Promise<void>((resolve) => { resolveStream = resolve; }),
      );

      act(() => {
        result.current.handleKeyDown(createKeyDownEvent('Enter'));
      });

      // 输入应被清空
      expect(result.current.inputValue).toBe('');
      // loading 应为 true
      expect(result.current.isLoading).toBe(true);

      // 清理
      resolveStream?.();
    });

    it('Shift+Enter 不应该触发发送', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setInputValue('测试消息');
      });

      act(() => {
        result.current.handleKeyDown(createKeyDownEvent('Enter', true));
      });

      // 输入不应被清空
      expect(result.current.inputValue).toBe('测试消息');
      expect(result.current.isLoading).toBe(false);
      expect(mockSendChatMessageStream).not.toHaveBeenCalled();
    });
  });

  // ── 发送消息 ────────────────────────────────────────────────────────────
  describe('发送消息', () => {
    it('发送消息后应该将用户消息追加到 messages', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        (_msg: string, _ctx: unknown, callbacks: {
          onComplete: (content: string) => void;
        }) => {
          callbacks.onComplete('助手回复内容');
          return Promise.resolve();
        },
      );

      act(() => {
        result.current.setInputValue('用户消息');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toMatchObject({
        role: 'user',
        content: '用户消息',
      });
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        content: '助手回复内容',
      });
    });

    it('流式更新期间 streamingContent 应该逐步累积', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        async (_msg: string, _ctx: unknown, callbacks: {
          onChunk: (delta: string) => void;
          onComplete: (content: string) => void;
        }) => {
          callbacks.onChunk('你');
          callbacks.onChunk('好');
          callbacks.onChunk('！');
          callbacks.onComplete('你好！');
        },
      );

      act(() => {
        result.current.setInputValue('hi');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      // streamingContent 最终被清空（onComplete 后）
      expect(result.current.streamingContent).toBe('');
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toBe('你好！');
    });

    it('空消息不应该发送', async () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setInputValue('   ');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(mockSendChatMessageStream).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('loading 期间不应该再次发送', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        () => new Promise(() => {}), // 永远 pending
      );

      act(() => {
        result.current.setInputValue('first');
      });

      act(() => {
        result.current.handleSend();
      });

      expect(result.current.isLoading).toBe(true);

      // 尝试再次发送
      act(() => {
        result.current.setInputValue('second');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      // 应该只调用了第一次
      expect(mockSendChatMessageStream).toHaveBeenCalledTimes(1);
    });
  });

  // ── 错误处理 ────────────────────────────────────────────────────────────
  describe('错误处理', () => {
    it('API 抛出异常时应该设置 error 状态', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockRejectedValue(new Error('网络错误'));

      act(() => {
        result.current.setInputValue('test');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.error).toBe('网络错误');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isStreaming).toBe(false);
    });

    it('onError 回调应该设置错误消息', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        async (_msg: string, _ctx: unknown, callbacks: {
          onError: (error: string) => void;
        }) => {
          callbacks.onError('服务器内部错误');
        },
      );

      act(() => {
        result.current.setInputValue('test');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.error).toBe('服务器内部错误');
      expect(result.current.isStreaming).toBe(false);
    });

    it('错误发生后仍可继续发送新消息', async () => {
      const { result } = renderHook(() => useChat());

      // 第一次失败 — 用户消息已追加到 messages，但无助手回复
      mockSendChatMessageStream.mockRejectedValueOnce(new Error('失败'));
      act(() => {
        result.current.setInputValue('first');
      });
      await act(async () => {
        await result.current.handleSend();
      });
      expect(result.current.error).toBe('失败');
      // 第一次失败的消息仍在 messages 中
      expect(result.current.messages).toHaveLength(1);

      // 第二次成功
      mockSendChatMessageStream.mockImplementationOnce(
        (_msg: string, _ctx: unknown, callbacks: {
          onComplete: (content: string) => void;
        }) => {
          callbacks.onComplete('成功了');
          return Promise.resolve();
        },
      );
      act(() => {
        result.current.setInputValue('second');
      });
      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.error).toBeNull();
      // 第一次失败的用户消息 + 第二次的用户消息 + 第二次的助手回复 = 3 条
      expect(result.current.messages).toHaveLength(3);
    });
  });

  // ── 清空消息 ────────────────────────────────────────────────────────────
  describe('clearMessages', () => {
    it('应该清空所有消息和状态', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        (_msg: string, _ctx: unknown, callbacks: {
          onComplete: (content: string) => void;
        }) => {
          callbacks.onComplete('回复');
          return Promise.resolve();
        },
      );

      act(() => {
        result.current.setInputValue('hello');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.streamingContent).toBe('');
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.toolActivities).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  // ── 权限模式 ────────────────────────────────────────────────────────────
  describe('权限模式', () => {
    it('setPermissionMode 应该更新权限模式', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setPermissionMode('yolo');
      });

      expect(result.current.permissionMode).toBe('yolo');

      act(() => {
        result.current.setPermissionMode('review');
      });

      expect(result.current.permissionMode).toBe('review');
    });

    it('onPermissionRequest 应该设置 permissionRequest 状态', async () => {
      const { result } = renderHook(() => useChat());

      const permissionReq = {
        requestId: 'req-001',
        toolName: 'write',
        input: { path: '/test' },
        reason: '需要写入文件',
      };

      mockSendChatMessageStream.mockImplementation(
        async (_msg: string, _ctx: unknown, callbacks: {
          onPermissionRequest?: (req: typeof permissionReq) => void;
          onComplete: (content: string) => void;
        }) => {
          callbacks.onPermissionRequest?.(permissionReq);
          callbacks.onComplete('done');
        },
      );

      act(() => {
        result.current.setInputValue('write file');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.permissionRequest).toEqual(permissionReq);
    });
  });

  // ── 权限响应 ────────────────────────────────────────────────────────────
  describe('handlePermissionResponse', () => {
    it('应该调用 respondToPermission 并清除请求', async () => {
      const { result } = renderHook(() => useChat());

      const permissionReq = {
        requestId: 'req-002',
        toolName: 'bash',
        input: { command: 'ls' },
        reason: '列出文件',
      };

      mockSendChatMessageStream.mockImplementation(
        async (_msg: string, _ctx: unknown, callbacks: {
          onPermissionRequest?: (req: typeof permissionReq) => void;
          onComplete: (content: string) => void;
        }) => {
          callbacks.onPermissionRequest?.(permissionReq);
          callbacks.onComplete('ok');
        },
      );

      act(() => {
        result.current.setInputValue('list files');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      expect(result.current.permissionRequest).not.toBeNull();

      mockRespondToPermission.mockResolvedValueOnce(true);

      await act(async () => {
        await result.current.handlePermissionResponse('allow', false);
      });

      expect(mockRespondToPermission).toHaveBeenCalledWith('req-002', 'allow', false);
      expect(result.current.permissionRequest).toBeNull();
    });

    it('无权限请求时不应调用 respondToPermission', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.handlePermissionResponse('allow', false);
      });

      expect(mockRespondToPermission).not.toHaveBeenCalled();
    });
  });

  // ── 工具活动 ────────────────────────────────────────────────────────────
  describe('工具活动', () => {
    it('onToolActivity 应该更新 toolActivities', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        async (_msg: string, _ctx: unknown, callbacks: {
          onToolActivity?: (activity: { toolName: string; status: string }) => void;
          onComplete: (content: string) => void;
        }) => {
          callbacks.onToolActivity?.({ toolName: 'read', status: 'running' });
          callbacks.onToolActivity?.({ toolName: 'read', status: 'done' });
          callbacks.onComplete('读取完成');
        },
      );

      act(() => {
        result.current.setInputValue('read file');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      // toolActivities 在 onComplete 后被清空，但消息中应包含工具活动
      // 同一工具从 running → done 是原地更新，currentToolActivities 中只有 1 条
      expect(result.current.messages[1].toolActivities).toBeDefined();
      expect(result.current.messages[1].toolActivities).toHaveLength(1);
      expect(result.current.messages[1].toolActivities![0].status).toBe('done');
    });
  });

  // ── localStorage 持久化 ─────────────────────────────────────────────────
  describe('localStorage 持久化', () => {
    it('有 sessionId 时消息应该持久化到 localStorage', async () => {
      const { result } = renderHook(() =>
        useChat([], { sessionId: 'session-test-1' }),
      );

      mockSendChatMessageStream.mockImplementation(
        (_msg: string, _ctx: unknown, callbacks: {
          onComplete: (content: string) => void;
        }) => {
          callbacks.onComplete('持久化回复');
          return Promise.resolve();
        },
      );

      act(() => {
        result.current.setInputValue('hello');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      const stored = localStorageStore['contour:chat:session-test-1'];
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored);
      expect(parsed).toHaveLength(2);
    });

    it('无 sessionId 时消息不应持久化', async () => {
      const { result } = renderHook(() => useChat());

      mockSendChatMessageStream.mockImplementation(
        (_msg: string, _ctx: unknown, callbacks: {
          onComplete: (content: string) => void;
        }) => {
          callbacks.onComplete('不持久化');
          return Promise.resolve();
        },
      );

      act(() => {
        result.current.setInputValue('hello');
      });

      await act(async () => {
        await result.current.handleSend();
      });

      // 检查没有任何 chat 相关的 key
      const chatKeys = Object.keys(localStorageStore).filter((k) =>
        k.startsWith('contour:chat:'),
      );
      expect(chatKeys).toHaveLength(0);
    });

    it('有 sessionId 时应该从 localStorage 恢复消息', () => {
      // 预设 localStorage 数据
      localStorageStore['contour:chat:session-restore'] = JSON.stringify([
        { id: 'msg_1', role: 'user', content: '旧消息' },
        { id: 'msg_2', role: 'assistant', content: '旧回复' },
      ]);

      const { result } = renderHook(() =>
        useChat([], { sessionId: 'session-restore' }),
      );

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe('旧消息');
    });

    it('sessionId 变化时应该重新加载消息', () => {
      localStorageStore['contour:chat:session-a'] = JSON.stringify([
        { id: 'a1', role: 'user', content: 'A的消息' },
      ]);
      localStorageStore['contour:chat:session-b'] = JSON.stringify([
        { id: 'b1', role: 'user', content: 'B的消息' },
      ]);

      const { result, rerender } = renderHook(
        ({ sessionId }) => useChat([], { sessionId }),
        { initialProps: { sessionId: 'session-a' as string | undefined } },
      );

      expect(result.current.messages[0].content).toBe('A的消息');

      rerender({ sessionId: 'session-b' });

      expect(result.current.messages[0].content).toBe('B的消息');
    });
  });
});
