import { ShieldAlert, Terminal, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import type { PermissionRequest } from '../../state/aiApi';

interface PermissionDialogProps {
  request: PermissionRequest;
  onResponse: (action: "allow" | "deny", remember: boolean) => void;
}

/**
 * 权限确认弹窗
 *
 * 在 review 模式下，Agent 调用写工具（write/edit/bash）时弹出此对话框，
 * 等待用户确认后才放行或拒绝。
 *
 * 三个操作按钮：
 * - "允许本次" → action: allow, remember: false
 * - "拒绝本次" → action: deny, remember: false
 * - "允许并记住" → action: allow, remember: true
 */
export function PermissionDialog({ request, onResponse }: PermissionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-border-subtle">
        <CardHeader className="relative">
          {/* 关闭按钮（等价于拒绝本次） */}
          <button
            className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            onClick={() => onResponse("deny", false)}
            title="拒绝本次"
            type="button"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
              <ShieldAlert size={20} className="text-warning" />
            </div>
            <div>
              <CardTitle className="text-base">需要确认</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Agent 请求执行需要用户确认的操作
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 工具名 */}
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1.5">工具</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                <Terminal size={12} className="mr-1 inline" />
                {request.toolName}
              </Badge>
            </div>
          </div>

          {/* 参数摘要 */}
          {!!request.input && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1.5">参数</p>
              <pre className="max-h-28 overflow-auto rounded-lg bg-surface-sunken p-3 text-xs font-mono text-text-primary/80 leading-relaxed whitespace-pre-wrap break-all">
                {formatInput(request.input)}
              </pre>
            </div>
          )}

          {/* 风险提示 */}
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
            <p className="text-xs text-warning font-medium mb-1">操作说明</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              {request.reason || `${request.toolName} 工具可以修改文件或执行命令，请确认放行或拒绝。`}
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onResponse("deny", false)}
              type="button"
            >
              拒绝本次
            </Button>
            <Button
              variant="default"
              className="flex-1 text-xs"
              onClick={() => onResponse("allow", false)}
              type="button"
            >
              允许本次
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-text-secondary hover:text-text-primary"
            onClick={() => onResponse("allow", true)}
            type="button"
          >
            允许并记住此选择
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/** 格式化工具输入参数为可读字符串 */
function formatInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input === null || input === undefined) return "(无参数)";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
