import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSmoothStream } from '../useSmoothStream';

describe('useSmoothStream', () => {
  it('初始状态应该显示传入的 content', () => {
    const { result } = renderHook(() =>
      useSmoothStream({ content: 'Hello World', isStreaming: false }),
    );
    expect(result.current.displayedContent).toBe('Hello World');
  });

  it('非流式模式切换时应该同步最终内容', () => {
    const { result, rerender } = renderHook(
      ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
      { initialProps: { content: 'Hello', isStreaming: false } },
    );

    expect(result.current.displayedContent).toBe('Hello');

    // 非流式模式下内容变化应该直接同步
    rerender({ content: 'Hello World Updated', isStreaming: false });
    expect(result.current.displayedContent).toBe('Hello World Updated');
  });

  it('内容完全替换时应该立即更新显示', () => {
    const { result, rerender } = renderHook(
      ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
      { initialProps: { content: 'First message', isStreaming: false } },
    );

    expect(result.current.displayedContent).toBe('First message');

    // 替换内容（新内容不以旧内容开头）
    rerender({ content: 'Completely different', isStreaming: true });
    expect(result.current.displayedContent).toBe('Completely different');
  });

  it('流式结束时应显示完整内容', () => {
    const { result, rerender } = renderHook(
      ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
      { initialProps: { content: 'Partial...', isStreaming: true } },
    );

    expect(result.current.displayedContent).toBe('Partial...');

    // 切换到非流式模式，内容应同步
    rerender({ content: 'Partial...and the rest of the message', isStreaming: false });
    expect(result.current.displayedContent).toBe(
      'Partial...and the rest of the message',
    );
  });

  it('空字符串初始内容应该正常', () => {
    const { result } = renderHook(() =>
      useSmoothStream({ content: '', isStreaming: true }),
    );
    expect(result.current.displayedContent).toBe('');
  });

  it('内容不变时不应触发额外渲染', () => {
    const { result, rerender } = renderHook(
      ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
      { initialProps: { content: 'Stable content', isStreaming: false } },
    );

    const firstDisplayed = result.current.displayedContent;

    // 相同内容重新渲染
    rerender({ content: 'Stable content', isStreaming: false });

    expect(result.current.displayedContent).toBe(firstDisplayed);
  });

  // ── 流式渲染高级场景（需要 rAF mock）────────────────────────────────────
  describe('流式渲染高级场景', () => {
    beforeEach(() => {
      // 同步化 rAF：使用递归深度追踪（非全局计数），确保每次顶层 rAF 调用
      // 都从深度 0 开始，跨 rerender 时不受前次递归限制的影响。
      // 每帧传递增 timestamp（模拟 16ms 间隔），确保 minDelay 检查通过。
      let recursionDepth = 0;
      let frameTime = Date.now();
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        recursionDepth++;
        if (recursionDepth > 80) {
          recursionDepth--;
          return 0; // 终止当前递归链，让 rafRef 变为 falsy
        }
        try {
          frameTime += 16;
          cb(frameTime);
        } finally {
          recursionDepth--;
        }
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('isStreaming 在多次 rerender 间切换（true → false → true）', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
        { initialProps: { content: 'Hello', isStreaming: false } },
      );

      expect(result.current.displayedContent).toBe('Hello');

      // 开始流式：内容追加（以旧内容开头，走 delta 入队路径）
      rerender({ content: 'Hello World', isStreaming: true });
      // 同步 rAF 已将队列排空，最终显示应匹配完整内容
      expect(result.current.displayedContent).toBe('Hello World');

      // 停止流式 → 内容应保持
      rerender({ content: 'Hello World', isStreaming: false });
      expect(result.current.displayedContent).toBe('Hello World');

      // 重新开始流式（内容替换，不以旧内容开头 → 立即替换）
      rerender({ content: '第二段全新内容', isStreaming: true });
      expect(result.current.displayedContent).toBe('第二段全新内容');
    });

    it('快节奏多次 onChunk 调用不应崩溃', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } },
      );

      // 模拟快节奏 chunk 到达（真实流式场景）
      const chunks = [
        'Hello',
        'Hello World',
        'Hello World!',
        'Hello World! This',
        'Hello World! This is',
        'Hello World! This is a',
        'Hello World! This is a test',
        'Hello World! This is a test of',
        'Hello World! This is a test of rapid',
        'Hello World! This is a test of rapid chunks',
      ];

      for (const chunk of chunks) {
        expect(() => {
          rerender({ content: chunk, isStreaming: true });
        }).not.toThrow();
      }

      // 最终应能显示内容
      expect(result.current.displayedContent).toBeDefined();
    });

    it('流式过程中 content 被外部清空为 "" 的边缘情况', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useSmoothStream({ content, isStreaming }),
        { initialProps: { content: '正在生成的内容...', isStreaming: true } },
      );

      expect(result.current.displayedContent).toBeDefined();

      // 内容被外部清空（模拟重置对话等场景）
      rerender({ content: '', isStreaming: true });

      // 清空后显示应为空字符串（非追加 → 立即替换）
      expect(result.current.displayedContent).toBe('');
    });
  });
});
