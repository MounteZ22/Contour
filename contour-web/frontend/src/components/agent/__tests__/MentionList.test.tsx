import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MentionList, type MentionItem } from '../MentionList';

// jsdom 不支持 scrollIntoView，需要 mock
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderMention(
  items: MentionItem[],
  opts: { selectedIndex?: number; onSelect?: (item: MentionItem) => void; onClose?: () => void } = {},
) {
  return render(
    createElement(MentionList, {
      items,
      selectedIndex: opts.selectedIndex ?? 0,
      onSelect: opts.onSelect ?? vi.fn(),
      onClose: opts.onClose ?? vi.fn(),
      position: { top: 100, left: 50 },
    }),
  );
}

const sampleItems: MentionItem[] = [
  { type: 'file', name: 'README.md', path: 'README.md' },
  { type: 'flow', name: 'F001 · 实验设计', path: 'F001', title: '实验设计' },
  { type: 'doc', name: '研究背景.md', path: 'D001', title: '研究背景' },
];

describe('MentionList', () => {
  it('渲染建议列表，显示名称和类型标签', () => {
    renderMention(sampleItems);

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('F001 · 实验设计')).toBeInTheDocument();
    expect(screen.getByText('研究背景.md')).toBeInTheDocument();

    // 类型标签
    expect(screen.getByText('文件')).toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('空列表显示空状态提示', () => {
    renderMention([]);
    expect(screen.getByText('未找到匹配项')).toBeInTheDocument();
  });

  it('点击选项时调用 onSelect', () => {
    const onSelect = vi.fn();
    renderMention(sampleItems, { onSelect });

    fireEvent.mouseDown(screen.getByText('README.md'));
    expect(onSelect).toHaveBeenCalledWith(sampleItems[0]);
  });

  it('高亮当前选中项', () => {
    renderMention(sampleItems, { selectedIndex: 1 });

    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('listbox 角色正确设置', () => {
    renderMention(sampleItems);
    expect(screen.getByRole('listbox', { name: '提及建议' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('弹窗定位使用传入的 position', () => {
    const { container } = renderMention(sampleItems);
    const listbox = container.firstElementChild as HTMLElement;
    expect(listbox.style.top).toBe('100px');
    expect(listbox.style.left).toBe('50px');
  });
});
