import { describe, it, expect } from 'vitest';
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
});
