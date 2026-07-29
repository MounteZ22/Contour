import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider, createStore, useAtom } from 'jotai';
import { Fragment, createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rightPanelOpenAtom } from '../../../state/shell';
import type { ProjectData } from '../../../types';
import { buildFlowChildren, RightSidePanel } from '../RightSidePanel';

vi.mock('../../../hooks/useAgentSessions', () => ({
  useAgentSessions: () => ({ getSession: () => undefined }),
}));

vi.mock('../../../state/projectConfig', () => ({
  addAttachedDirectory: vi.fn(),
  addAttachedFile: vi.fn(),
  getProjectConfig: vi.fn(async () => ({
    projectDir: 'D:\\Contour-dev\\PRJ_001',
    attachedDirectories: [],
    attachedFiles: [],
  })),
  removeAttachedDirectory: vi.fn(),
  removeAttachedFile: vi.fn(),
}));

const project = {
  projectId: 'PRJ_001',
  title: '测试项目',
  researchGoal: '',
  currentStage: '',
  flows: [],
  claims: [],
  docs: [],
} as ProjectData;

function MobilePanelHarness() {
  const [isOpen, setIsOpen] = useAtom(rightPanelOpenAtom);

  return createElement(
    Fragment,
    null,
    createElement('button', { onClick: () => setIsOpen(true), type: 'button' }, '打开文件面板'),
    isOpen ? createElement(RightSidePanel, { project }) : null,
  );
}

function stubMobileViewport() {
  const mediaQuery = {
    matches: true,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Flow 虚拟文件目录', () => {
  it('展开真实 Flow 目录后显示 flow.md、附件目录和链接文件', () => {
    const children = buildFlowChildren(
      {
        id: 'flow',
        name: 'F001 · 目标 Flow',
        path: 'D:\\vault\\flows',
        kind: 'directory',
        flowId: 'F001',
        flowAttachments: ['figure.png'],
        flowLinks: [{ path: 'D:\\lab\\data.xlsx', label: '原始数据' }],
      },
      {
        name: 'F001_目标 Flow',
        path: 'D:\\vault\\flows\\F001_目标 Flow',
        kind: 'directory',
      },
    );

    expect(children.map((child) => child.name)).toEqual(['flow.md', 'attachments', '链接文件']);
    expect(children[1].lazy).toBe(true);
    expect(children[2].children?.[0]).toMatchObject({
      name: '原始数据',
      path: 'D:\\lab\\data.xlsx',
      flowId: 'F001',
    });
  });
});

describe('右侧文件面板移动端交互', () => {
  it('Given 小屏幕打开文件面板, When 按 Escape, Then 关闭并归还焦点给触发按钮', async () => {
    stubMobileViewport();
    const store = createStore();
    store.set(rightPanelOpenAtom, false);

    render(
      createElement(
        Provider,
        { store },
        createElement(
          MemoryRouter,
          { initialEntries: ['/agent/session-1'] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: '/agent/:sessionId', element: createElement(MobilePanelHarness) }),
          ),
        ),
      ),
    );

    const trigger = screen.getByRole('button', { name: '打开文件面板' });
    trigger.focus();
    fireEvent.click(trigger);

    const closeButton = await screen.findByRole('button', { name: '收起文件面板' });
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(screen.getByRole('dialog', { name: '文件面板' })).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '文件面板' })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
