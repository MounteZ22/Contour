import { createElement, type ButtonHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentErrorNotice } from '../AgentErrorNotice';

vi.mock('../../ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', props, children),
}));

describe('AgentErrorNotice', () => {
  it('临时故障显示清楚的说明和重试按钮', () => {
    const onRetry = vi.fn();
    render(createElement(AgentErrorNotice, {
      error: { code: 'network_error', title: '网络连接失败', message: '请检查网络后重试。', canRetry: true },
      onRetry,
      onOpenSettings: vi.fn(),
    }));

    expect(screen.getByText('网络连接失败')).toBeDefined();
    expect(screen.getByText('请检查网络后重试。')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '打开设置' })).toBeNull();
  });

  it('API Key 问题引导用户打开设置，不显示无效的重试按钮', () => {
    const onOpenSettings = vi.fn();
    render(createElement(AgentErrorNotice, {
      error: {
        code: 'invalid_api_key',
        title: 'API Key 无效',
        message: '请更新 API Key。',
        canRetry: false,
        action: 'open_settings',
      },
      onRetry: vi.fn(),
      onOpenSettings,
    }));

    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });
});
