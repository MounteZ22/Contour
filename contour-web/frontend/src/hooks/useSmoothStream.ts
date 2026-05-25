/**
 * useSmoothStream - 流式文本平滑渲染 Hook
 *
 * 将后端推送的流式文本转化为平滑的逐字渲染效果（打字机）。
 * 使用 Intl.Segmenter 正确处理 CJK 字符，rAF 驱动渲染循环。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSmoothStreamOptions {
  /** 原始流式内容（每次 chunk 累积后的完整文本） */
  content: string;
  /** 是否正在流式输出中 */
  isStreaming: boolean;
  /** 每帧最小间隔（ms），默认 10 */
  minDelay?: number;
}

interface UseSmoothStreamReturn {
  /** 平滑后的显示内容 */
  displayedContent: string;
}

const segmenter = new Intl.Segmenter(
  ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR'],
);

function segmentText(text: string): string[] {
  return Array.from(segmenter.segment(text)).map((s) => s.segment);
}

export function useSmoothStream({
  content,
  isStreaming,
  minDelay = 10,
}: UseSmoothStreamOptions): UseSmoothStreamReturn {
  const [displayedContent, setDisplayedContent] = useState(content);
  const chunkQueueRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  const displayedRef = useRef(content);
  const prevContentRef = useRef(content);
  const lastRenderTimeRef = useRef(0);
  const streamDoneRef = useRef(!isStreaming);

  streamDoneRef.current = !isStreaming;

  // 检测内容变化，计算 delta 并入队
  useEffect(() => {
    const prevContent = prevContentRef.current;
    const newContent = content;
    if (newContent === prevContent) return;

    const isAppend = newContent.startsWith(prevContent);
    if (isAppend) {
      const delta = newContent.slice(prevContent.length);
      if (delta) {
        chunkQueueRef.current.push(...segmentText(delta));
      }
    } else {
      chunkQueueRef.current = [];
      displayedRef.current = newContent;
      setDisplayedContent(newContent);
    }
    prevContentRef.current = newContent;
  }, [content]);

  // 非流式状态时同步最终内容
  useEffect(() => {
    if (!isStreaming) {
      if (rafRef.current) return;
      if (chunkQueueRef.current.length > 0) {
        displayedRef.current += chunkQueueRef.current.join('');
        chunkQueueRef.current = [];
      }
      if (displayedRef.current !== content) {
        displayedRef.current = content;
      }
      setDisplayedContent(displayedRef.current);
    }
  }, [isStreaming, content]);

  // 渲染循环
  const renderLoop = useCallback(
    (currentTime: number) => {
      const queue = chunkQueueRef.current;

      if (queue.length === 0) {
        if (streamDoneRef.current) {
          if (displayedRef.current !== prevContentRef.current) {
            displayedRef.current = prevContentRef.current;
            setDisplayedContent(displayedRef.current);
          }
          rafRef.current = null;
          return;
        }
        rafRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      if (currentTime - lastRenderTimeRef.current < minDelay) {
        rafRef.current = requestAnimationFrame(renderLoop);
        return;
      }
      lastRenderTimeRef.current = currentTime;

      const divisor = streamDoneRef.current ? 4 : 8;
      const count = Math.max(1, Math.floor(queue.length / divisor));
      const chars = queue.splice(0, count);
      displayedRef.current += chars.join('');
      setDisplayedContent(displayedRef.current);

      if (queue.length > 0 || !streamDoneRef.current) {
        rafRef.current = requestAnimationFrame(renderLoop);
      } else {
        if (displayedRef.current !== prevContentRef.current) {
          displayedRef.current = prevContentRef.current;
          setDisplayedContent(displayedRef.current);
        }
        rafRef.current = null;
      }
    },
    [minDelay],
  );

  // 启动/重启渲染循环
  useEffect(() => {
    if ((isStreaming || chunkQueueRef.current.length > 0) && !rafRef.current) {
      rafRef.current = requestAnimationFrame(renderLoop);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isStreaming, renderLoop]);

  return { displayedContent };
}
