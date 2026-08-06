import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { VirtualChatHistory } from '../VirtualChatHistory';

// jsdom 没有真实布局：stub ResizeObserver，并让滚动容器报告一个非零视口高度，
// 否则 @tanstack/react-virtual 会把视口视为 0 而不渲染任何条目。
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const VIEWPORT_HEIGHT = 400;

function stubLayout(): void {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // @tanstack/react-virtual 用 offsetHeight/offsetWidth 测视口，scrollHeight/clientHeight 测滚动量
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return VIEWPORT_HEIGHT; },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() { return 720; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return VIEWPORT_HEIGHT; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return 720; },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return VIEWPORT_HEIGHT; },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() { return 720; },
  });
}

beforeEach(() => {
  stubLayout();
});

function renderList(items: string[], height = VIEWPORT_HEIGHT) {
  const scrollRef = createRef<HTMLDivElement>();
  const utils = render(
    <div ref={scrollRef} style={{ height, overflowY: 'auto' }}>
      <VirtualChatHistory
        items={items}
        scrollRef={scrollRef}
        getItemKey={(item) => item}
        estimateSize={() => 40}
        renderItem={(item) => <div>{item}</div>}
      />
    </div>,
  );
  return { scrollRef, ...utils };
}

describe('VirtualChatHistory 虚拟滚动', () => {
  it('Given 500 条长列表, When 渲染, Then 只挂载视口附近的条目而非全部', () => {
    const items = Array.from({ length: 500 }, (_, index) => `item-${index}`);
    const { container } = renderList(items);

    const rendered = container.querySelectorAll('[data-index]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(500);
    // 列表顶部条目始终在 DOM 中
    expect(screen.getByText('item-0')).toBeTruthy();
  });

  it('Given items 增加, When 重新渲染, Then 新条目按 key 稳定渲染', () => {
    const { container, rerender } = renderList(['a', 'b', 'c']);

    expect(container.querySelectorAll('[data-index]').length).toBeGreaterThan(0);

    rerender(
      <div ref={createRef<HTMLDivElement>()} style={{ height: VIEWPORT_HEIGHT, overflowY: 'auto' }}>
        <VirtualChatHistory
          items={['a', 'b', 'c', 'd']}
          scrollRef={createRef<HTMLDivElement>()}
          getItemKey={(item) => item}
          estimateSize={() => 40}
          renderItem={(item) => <div>{item}</div>}
        />
      </div>,
    );

    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });
});
