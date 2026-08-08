import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolActivity } from '@contour/shared';
import { TaskProgressOverlay } from '../TaskProgressOverlay';

const activities: ToolActivity[] = [
  {
    id: 'create-call',
    toolName: 'TaskCreate',
    status: 'done',
    input: { subject: '核对引用' },
    result: JSON.stringify({ task: { id: 'task-1', subject: '核对引用' } }),
  },
  {
    id: 'update-call',
    toolName: 'TaskUpdate',
    status: 'done',
    input: { taskId: 'task-1', status: 'completed' },
  },
];

afterEach(() => vi.useRealTimers());

describe('TaskProgressOverlay', () => {
  it('显示当前任务，并可展开查看完整任务项', () => {
    render(<TaskProgressOverlay activities={activities} isLoading hasError={false} />);

    expect(screen.getByLabelText('任务进度')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /本轮任务已结束|核对引用/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('核对引用')).toBeInTheDocument();
  });

  it('在任务结束四秒后自动退出', () => {
    vi.useFakeTimers();
    render(<TaskProgressOverlay activities={activities} isLoading hasError={false} />);
    expect(screen.getByLabelText('任务进度')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByLabelText('任务进度')).not.toBeInTheDocument();
  });
});
