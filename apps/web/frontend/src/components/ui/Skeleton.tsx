import { cn } from '@/lib/utils';

/**
 * 通用骨架屏组件
 * 支持 rect / circle / text 三种变体，配合 Tailwind animate-pulse 实现加载占位。
 */
interface SkeletonProps {
  variant?: 'rect' | 'circle' | 'text';
  width?: string | number;
  height?: string | number;
  className?: string;
  /** text 变体时有效，控制占位行数（最后一行宽度 3/4） */
  lines?: number;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  className,
  lines = 1,
}: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div
        className="space-y-2"
        style={{ width: typeof width === 'number' ? `${width}px` : width ?? '100%' }}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 animate-pulse rounded bg-muted',
              i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full',
              className,
            )}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    return (
      <div
        className={cn('animate-pulse rounded-full bg-muted', className)}
        style={{
          width: typeof width === 'number' ? `${width}px` : width ?? '40px',
          height: typeof height === 'number' ? `${height}px` : height ?? '40px',
        }}
      />
    );
  }

  // rect（默认）
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width ?? '100%',
        height: typeof height === 'number' ? `${height}px` : height ?? '16px',
      }}
    />
  );
}
