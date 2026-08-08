import { describe, expect, it } from 'vitest';
import type { ToolActivity } from '@contour/shared';
import { aggregateTaskProgress } from '../taskProgress';

function activity(overrides: Partial<ToolActivity>): ToolActivity {
  return {
    id: 'tool-call',
    toolName: 'TaskCreate',
    status: 'done',
    ...overrides,
  };
}

describe('aggregateTaskProgress', () => {
  it('根据 TaskCreate 输出和 TaskUpdate 聚合本轮任务状态', () => {
    const tasks = aggregateTaskProgress([
      activity({
        id: 'create-call',
        input: { subject: '检查数据' },
        result: JSON.stringify({ task: { id: 'task-1', subject: '检查数据' } }),
      }),
      activity({
        id: 'update-call',
        toolName: 'TaskUpdate',
        input: { taskId: 'task-1', status: 'in_progress', activeForm: '正在检查数据' },
      }),
    ]);

    expect(tasks).toEqual([{
      id: 'task-1',
      subject: '检查数据',
      status: 'in_progress',
      activeForm: '正在检查数据',
    }]);
  });

  it('无法解析 TaskCreate 输出时使用调用 ID 降级展示', () => {
    expect(aggregateTaskProgress([
      activity({ id: 'create-call', input: { subject: '整理结果' }, result: 'not-json' }),
    ])).toEqual([{
      id: 'create-call',
      subject: '整理结果',
      status: 'pending',
      activeForm: undefined,
    }]);
  });

  it('忽略无关工具和缺少任务 ID 的更新', () => {
    expect(aggregateTaskProgress([
      activity({ toolName: 'read', input: { path: 'notes.md' } }),
      activity({ toolName: 'TaskUpdate', input: { status: 'completed' } }),
    ])).toEqual([]);
  });
});
