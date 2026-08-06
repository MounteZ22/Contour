import { Skeleton } from './Skeleton';

/**
 * 通用页面级骨架屏
 * 模拟典型 Contour 内容页布局：面包屑 + 标题区域 + 3 个内容卡片。
 * 内置 role="status" 与 sr-only 文本，方便自动化测试识别加载态。
 */
export function PageSkeleton() {
  return (
    <div className="h-full w-full overflow-y-auto p-6" role="status">
      <span className="sr-only">页面加载中</span>

      {/* 面包屑 */}
      <div className="mb-6 flex items-center gap-2">
        <Skeleton variant="rect" width={80} height={16} />
        <Skeleton variant="rect" width={12} height={16} />
        <Skeleton variant="rect" width={120} height={16} />
      </div>

      {/* 标题区域 */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton variant="rect" width={160} height={20} />
          <Skeleton variant="rect" width="60%" height={14} />
        </div>
        <Skeleton variant="rect" width={100} height={32} className="rounded-md" />
      </div>

      {/* 3 个内容卡片 */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-fade-slide-in space-y-4 rounded-xl border border-border p-6"
            style={{ animationDelay: `${(i - 1) * 80}ms` }}
          >
            <Skeleton variant="rect" width={140} height={18} />
            <Skeleton variant="text" lines={3} />
          </div>
        ))}
      </div>
    </div>
  );
}
