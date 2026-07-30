import { describe, expect, it } from 'vitest';
import { confirmPermissionDenial, groupMessagesByTurn } from '../SessionChat';

describe('SessionChat 的 Turn 分组', () => {
  it('当相邻消息的 turnIndex 不同时应分别分组', () => {
    const items = groupMessagesByTurn([
      { id: 'turn-1', role: 'assistant', content: '第一轮', turnIndex: 1 },
      { id: 'turn-2', role: 'assistant', content: '第二轮', turnIndex: 2 },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'turnGroup', turnMessages: [{ id: 'turn-1' }] });
    expect(items[1]).toMatchObject({ type: 'turnGroup', turnMessages: [{ id: 'turn-2' }], isLatest: true });
  });

  it('当相邻消息属于同一轮时应合并到一个组', () => {
    const items = groupMessagesByTurn([
      { id: 'turn-1a', role: 'assistant', content: '工具调用', turnIndex: 1 },
      { id: 'turn-1b', role: 'assistant', content: '完成', turnIndex: 1 },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'turnGroup',
      turnMessages: [{ id: 'turn-1a' }, { id: 'turn-1b' }],
      isLatest: true,
    });
  });
});

describe('SessionChat 的权限拒绝横幅', () => {
  const request = {
    requestId: 'permission-1',
    toolName: 'write',
    input: { path: 'notes.md' },
    reason: '写入笔记',
  };

  it('当拒绝 POST 失败时应保留待确认横幅，以便用户重试', async () => {
    const displayedDeniedRequest = await confirmPermissionDenial(
      request,
      async () => false,
    );

    expect(displayedDeniedRequest).toBeNull();
  });

  it('当拒绝 POST 成功时应显示已拒绝状态', async () => {
    const displayedDeniedRequest = await confirmPermissionDenial(
      request,
      async () => true,
    );

    expect(displayedDeniedRequest).toEqual(request);
  });
});
