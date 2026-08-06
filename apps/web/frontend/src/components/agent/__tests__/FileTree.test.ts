import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { FileTree, type FileTreeNode } from '../FileTree';

function renderTree(nodes: FileTreeNode[], loadChildren = vi.fn()) {
  return render(createElement(
    Provider,
    null,
    createElement(FileTree, {
      nodes,
      emptyText: '没有文件',
      loadChildren,
      projectId: 'PRJ_001',
    }),
  ));
}

describe('右侧文件树', () => {
  it('目录只有在用户展开时才加载内容', async () => {
    const loadChildren = vi.fn().mockResolvedValue([
      { id: 'child', name: 'notes.md', path: 'D:\\data\\notes.md', kind: 'file' },
    ]);
    renderTree([
      { id: 'root', name: '实验数据', path: 'D:\\data', kind: 'directory', lazy: true },
    ], loadChildren);

    expect(loadChildren).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '实验数据' }));

    await waitFor(() => expect(loadChildren).toHaveBeenCalledOnce());
    expect(await screen.findByText('notes.md')).toBeInTheDocument();
  });

  it('离线目录仍显示，但禁用且不会触发加载', () => {
    const loadChildren = vi.fn();
    renderTree([
      { id: 'offline', name: '移动硬盘', path: 'Z:\\lab', kind: 'directory', lazy: true, available: false },
    ], loadChildren);

    const button = screen.getByRole('button', { name: /移动硬盘.*不可用/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(loadChildren).not.toHaveBeenCalled();
  });
});
