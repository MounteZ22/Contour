import { useState } from 'react';
import { showToast } from '../components/Toast';

/**
 * 乐观更新 + API 调用 + 失败回滚 + Toast 通知的通用 hook
 *
 * 消除 FlowWorkspacePage / ProjectDocPage / ProjectClaimPage 中
 * 重复的 save-rollback-toast 样板代码。
 */
export function useOptimisticMutation() {
  const [isPending, setIsPending] = useState(false);

  /**
   * 执行一次乐观更新
   *
   * @param optimistic — 乐观更新函数，返回回滚所需的"之前状态"
   * @param mutationFn — 实际的 API 调用
   * @param rollback    — 失败时用 optimistic 返回的值回滚
   * @param errorMessage — Toast 错误消息前缀
   * @returns true 表示成功，false 表示失败
   */
  async function mutate<TPrev>(options: {
    optimistic: () => TPrev;
    mutationFn: () => Promise<{ success: boolean; error?: string }>;
    rollback: (prev: TPrev) => void;
    errorMessage: string;
  }): Promise<boolean> {
    setIsPending(true);
    const prev = options.optimistic();
    try {
      const result = await options.mutationFn();
      if (!result.success) {
        options.rollback(prev);
        showToast(`${options.errorMessage}：${result.error}`, 'error');
        return false;
      }
      return true;
    } catch (err) {
      options.rollback(prev);
      showToast(
        `${options.errorMessage}：${(err as Error).message}`,
        'error',
      );
      return false;
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending };
}
