import { ShieldAlert, Terminal, X, Check, Ban, Settings } from 'lucide-react';
import type { PermissionRequest } from '../../state/aiApi';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface PermissionBannerProps {
  request: PermissionRequest;
  /** 是否已处于"已拒绝"状态（不再显示操作按钮） */
  denied?: boolean;
  /** 提交权限决定失败时保留横幅，并给出可重试原因。 */
  error?: string | null;
  onAllow: () => void;
  onDeny: () => void;
  onAllowSession: () => void;
}

/**
 * 内联权限确认横幅
 *
 * 嵌入在对话消息流中，取代原有的弹窗（PermissionDialog）。
 * 在 review 模式下，Agent 调用写工具时插入到消息列表中。
 *
 * 状态：
 * - 待确认：显示操作说明和三个按钮
 * - 已拒绝：显示"已拒绝"标识，横幅保留在流中
 */
export function PermissionBanner({
  request,
  denied = false,
  error,
  onAllow,
  onDeny,
  onAllowSession,
}: PermissionBannerProps) {
  return (
    <div
      className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 animate-fade-slide-in"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className="mt-0.5 w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
          <ShieldAlert size={16} className="text-warning" />
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          {/* 标题与工具名 */}
          <div>
            <p className="text-sm font-medium text-text-primary">
              {denied ? '操作已拒绝' : 'Agent 请求确认'}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {denied
                ? '已拒绝该操作，Agent 将继续执行其他任务。'
                : (request.reason || `Agent 需要调用 ${request.toolName} 工具，请确认是否放行。`)}
            </p>
          </div>

          {/* 工具标识 */}
          <div className="flex items-center gap-2 flex-wrap">
           {!denied && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                <Terminal size={11} className="mr-1 inline" />
                {request.toolName}
              </Badge>
            )}
            {denied && (
              <Badge variant="secondary" className="font-mono text-[11px] border-danger/30 text-danger bg-danger/10">
                <Ban size={11} className="mr-1 inline" />
                已拒绝
              </Badge>
            )}
          </div>

          {/* 参数详情（折叠后仅 key 信息） */}
          {!denied && !!request.input && (
            <div className="rounded-lg bg-surface-sunken p-2.5 max-h-24 overflow-y-auto">
              <pre className="text-[11px] font-mono text-text-secondary/80 leading-relaxed whitespace-pre-wrap break-all">
                {formatInput(request.input)}
              </pre>
            </div>
           )}
          {error && !denied && (
            <p className="text-xs text-danger" role="alert">{error}</p>
          )}

          {/* 操作按钮 */}
          {!denied && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 px-3"
                onClick={onDeny}
                type="button"
              >
                <Ban size={13} className="mr-1" />
                拒绝本次
              </Button>
              <Button
                variant="default"
                size="sm"
                className="text-xs h-8 px-3"
                onClick={onAllow}
                type="button"
              >
                <Check size={13} className="mr-1" />
                允许本次
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-3 text-text-secondary hover:text-text-primary"
                onClick={onAllowSession}
                type="button"
              >
                <Settings size={13} className="mr-1" />
                允许本次会话所有同类操作
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 格式化工具输入参数为可读字符串 */
function formatInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '(无参数)';
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
