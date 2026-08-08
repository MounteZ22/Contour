import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChatMessage } from '@contour/shared';
import { TurnGroup } from '../TurnGroup';

/**
 * TurnGroup 受控折叠（P1-S）
 *
 * 展开状态由父级按 item key 控制（expanded/onToggle），
 * 虚拟滚动回收视口外 DOM 后重新挂载时仍能恢复。
 */
describe('TurnGroup 受控折叠（P1-S）', () => {
  const turnMessages: ChatMessage[] = [
    { id: 'm1', role: 'assistant', content: '第一轮的回答内容', turnIndex: 1 },
  ];

  it('expanded=true 时渲染本轮消息内容', () => {
    render(
      <TurnGroup turnMessages={turnMessages} expanded onToggle={vi.fn()} />,
    );

    expect(screen.getByText('第 1 轮')).toBeTruthy();
    expect(screen.getByText('第一轮的回答内容')).toBeTruthy();
  });

  it('expanded=false 时折叠消息内容，点击头部触发 onToggle 而非内部改状态', () => {
    const onToggle = vi.fn();
    render(
      <TurnGroup turnMessages={turnMessages} expanded={false} onToggle={onToggle} />,
    );

    expect(screen.queryByText('第一轮的回答内容')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('折叠时显示文件改动摘要', () => {
    render(
      <TurnGroup
        turnMessages={[
          { id: 'm2', role: 'assistant', content: '回答', turnIndex: 1, filesChanged: ['a.ts'] },
        ]}
        expanded={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 个文件改动/)).toBeTruthy();
  });
});
