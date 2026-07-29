import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSearchSettings } from '../WebSearchSettings';

describe('WebSearchSettings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { enabled: false, hasApiKey: false } }),
    }));
  });

  it('Given 尚未配置 Tavily 密钥, When 打开网络检索设置, Then 工具开关默认关闭且不可开启', async () => {
    render(<WebSearchSettings />);

    const toggle = await screen.findByRole('switch', { name: '允许 Agent 网络检索' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('未配置')).toBeInTheDocument();
  });

  it('Given 用户在当前表单输入密钥, When 切换网络检索, Then 可在保存前明确选择开启', async () => {
    render(<WebSearchSettings />);

    await screen.findByRole('switch', { name: '允许 Agent 网络检索' });
    fireEvent.change(screen.getByLabelText('新的 API Key'), { target: { value: 'tvly-new-key' } });
    const toggle = screen.getByRole('switch', { name: '允许 Agent 网络检索' });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
