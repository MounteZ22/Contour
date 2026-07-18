import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ShellLayout } from '../ShellLayout';

vi.mock('../LeftSidebar', () => ({
  LeftSidebar: ({ forceExpanded, onClose }: { forceExpanded?: boolean; onClose?: () => void }) => (
    <div data-testid={forceExpanded ? 'mobile-sidebar' : 'desktop-sidebar'}>
      {onClose && <button onClick={onClose}>关闭抽屉</button>}
    </div>
  ),
}));

vi.mock('../RightSidePanel', () => ({ RightSidePanel: () => <div>文件面板</div> }));

describe('ShellLayout 窄屏导航', () => {
  it('Given 应用页面, When 点击移动导航按钮, Then 打开抽屉并可关闭', () => {
    render(
      <Provider>
        <MemoryRouter initialEntries={['/contour']}>
          <Routes>
            <Route element={<ShellLayout onRefresh={vi.fn()} projects={[]} />}>
              <Route path="contour" element={<div>主内容</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.queryByTestId('mobile-navigation-drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
    expect(screen.getByTestId('mobile-navigation-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-sidebar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭抽屉' }));
    expect(screen.queryByTestId('mobile-navigation-drawer')).not.toBeInTheDocument();
  });
});
