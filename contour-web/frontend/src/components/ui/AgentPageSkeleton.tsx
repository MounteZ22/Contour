import { Skeleton } from './Skeleton';

/**
 * Agent 首页骨架屏
 * 模拟 AgentView 布局：居中 Bot 图标 + 标题 + 描述 + 输入框区域。
 */
export function AgentPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background px-6 py-8" role="status">
      <span className="sr-only">Agent 页面加载中</span>
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center pb-20">
        {/* Bot 图标 */}
        <div className="mb-6">
          <Skeleton variant="rect" width={48} height={48} className="rounded-lg" />
        </div>

        {/* 标题 */}
        <div className="mb-3">
          <Skeleton variant="rect" width={220} height={24} />
        </div>

        {/* 描述行 */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <Skeleton variant="rect" width="60%" height={14} />
          <Skeleton variant="rect" width="40%" height={14} />
        </div>

        {/* 输入框区域 */}
        <div className="w-full space-y-3 rounded-xl border border-border p-4">
          <Skeleton variant="rect" width="100%" height={44} className="rounded-lg" />
          <div className="flex justify-between">
            <div className="flex gap-2">
              <Skeleton variant="rect" width={80} height={30} className="rounded-md" />
              <Skeleton variant="rect" width={120} height={30} className="rounded-md" />
            </div>
            <Skeleton variant="rect" width={64} height={30} className="rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
