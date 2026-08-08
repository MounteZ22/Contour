import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentPageSkeleton } from '../AgentPageSkeleton';

describe('AgentPageSkeleton', () => {
  it('Given Agent 页面仍在加载, When 渲染骨架屏, Then 向辅助技术声明加载状态', () => {
    render(<AgentPageSkeleton />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Agent 页面加载中')).toHaveClass('sr-only');
  });
});
