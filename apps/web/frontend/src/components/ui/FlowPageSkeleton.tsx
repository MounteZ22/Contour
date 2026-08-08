import { Skeleton } from './Skeleton';

/**
 * Flow 工作区骨架屏
 * 模拟 FlowWorkspacePage 完整布局：
 * 面包屑 → 头部卡片 → AI 摘要 → 统计网格 → 侧边栏 + 内容区。
 */
export function FlowPageSkeleton() {
  return (
    <div
      className="grid h-full w-full min-w-0 max-w-full gap-6 overflow-x-hidden overflow-y-auto p-4 md:p-6"
      role="status"
    >
      <span className="sr-only">Flow 页面加载中</span>

      {/* 面包屑 */}
      <div className="flex items-center gap-2">
        <Skeleton variant="rect" width={100} height={16} />
        <Skeleton variant="rect" width={12} height={16} />
        <Skeleton variant="rect" width={100} height={16} />
      </div>

      {/* 头部卡片 */}
      <div className="space-y-3 rounded-xl border border-border bg-surface-sunken p-4 sm:p-6">
        <Skeleton variant="rect" width={80} height={12} />
        <Skeleton variant="rect" width="50%" height={24} />
        <div className="flex gap-3">
          <Skeleton variant="rect" width={100} height={28} className="rounded-md" />
          <Skeleton variant="rect" width={120} height={28} className="rounded-md" />
          <Skeleton variant="rect" width={140} height={28} className="rounded-md" />
        </div>
      </div>

      {/* AI 摘要卡片 */}
      <div className="space-y-4 rounded-xl border border-border bg-surface-sunken p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Skeleton variant="rect" width={32} height={32} className="rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton variant="rect" width={100} height={12} />
            <Skeleton variant="rect" width="40%" height={18} />
          </div>
        </div>
        <Skeleton variant="text" lines={3} />
      </div>

      {/* 统计网格 */}
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-border bg-surface-sunken p-4 sm:p-6"
          >
            <Skeleton variant="rect" width={100} height={12} />
            <Skeleton variant="rect" width="60%" height={16} />
          </div>
        ))}
      </div>

      {/* 侧边栏 + 内容双栏 */}
      <div className="grid min-w-0 grid-cols-1 gap-4 items-start xl:grid-cols-[260px_minmax(0,1fr)]">
        {/* 左侧边栏（Section 列表） */}
        <aside className="space-y-3 rounded-xl border border-border bg-surface-sunken p-6">
          <Skeleton variant="rect" width={120} height={16} />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                variant="rect"
                width="100%"
                height={48}
                className="rounded-lg"
              />
            ))}
          </div>
        </aside>

        {/* 主内容区 */}
        <section className="min-h-[70vh] space-y-4 rounded-xl border border-border bg-surface-sunken p-4 sm:p-6">
          <Skeleton variant="rect" width={140} height={18} />
          <Skeleton variant="text" lines={8} />
        </section>
      </div>
    </div>
  );
}
