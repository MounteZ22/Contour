import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * VirtualChatHistory — 基于 @tanstack/react-virtual 的长历史虚拟滚动容器
 *
 * 只渲染视口附近的条目，避免数百条消息一次性挂载导致卡顿。
 * 条目高度是动态的：TurnGroup 折叠/展开、工具调用明细展开都会改变高度，
 * 依赖 useVirtualizer.measureElement（ResizeObserver 驱动）重新测量，
 * 不会造成滚动位置跳跃。
 *
 * 用法：将外层滚动容器 ref 传给 scrollRef，items 为待虚拟化的列表，
 * renderItem 返回每个条目的 ReactNode。
 */
export function VirtualChatHistory<T>({
  items,
  getItemKey,
  scrollRef,
  estimateSize = () => 96,
  overscan = 8,
  renderItem,
}: {
  items: T[];
  /** 每条目稳定 key（消息 id / turn 序号），保证测量缓存不串位 */
  getItemKey: (item: T, index: number) => string;
  /** 外层滚动容器 ref（flex-1 min-h-0 overflow-y-auto） */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** 未测量时的估算高度；测量后会被真实高度覆盖 */
  estimateSize?: (index: number) => number;
  /** 视口外预渲染条数，保证快速滚动不白屏 */
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  // 父级容器挂在子组件之后：把 scrollElement 收敛进 state，
  // ref 一旦可用就触发重渲染，让 virtualizer 完成初始化测量。
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current && scrollRef.current !== scrollElement) {
      setScrollElement(scrollRef.current);
    }
  });

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize,
    overscan,
    getItemKey: (index) => getItemKey(items[index] as T, index),
  });

  return (
    <div
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <div
          key={virtualItem.key}
          data-index={virtualItem.index}
          ref={virtualizer.measureElement}
          className="absolute left-0 top-0 w-full pb-5"
          style={{ transform: `translateY(${virtualItem.start}px)` }}
        >
          {renderItem(items[virtualItem.index] as T, virtualItem.index)}
        </div>
      ))}
    </div>
  );
}
