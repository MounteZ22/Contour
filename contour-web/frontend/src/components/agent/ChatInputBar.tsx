import { useCallback, useEffect, useRef } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  Square,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AIContextItem } from '@/types';
import type { PermissionMode } from '@/hooks/useChat';

interface ChatInputBarProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  isLoading: boolean;
  onSend: () => Promise<void>;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClear: () => void;
  hasMessages: boolean;
  permissionMode: PermissionMode;
  onPermissionModeChange: (mode: PermissionMode) => void;
  contextItems: AIContextItem[];
}

const PERMISSION_OPTIONS: { value: PermissionMode; label: string; icon: typeof Eye; description: string }[] = [
  { value: 'readonly', label: '只读', icon: Eye, description: '仅允许读取文件' },
  { value: 'review', label: '审查', icon: ShieldCheck, description: '写操作需弹窗确认' },
  { value: 'yolo', label: '自动', icon: Zap, description: '在项目范围内自动写入' },
];

export function ChatInputBar({
  inputValue,
  onInputChange,
  isLoading,
  onSend,
  onStop,
  onKeyDown,
  onClear,
  hasMessages,
  permissionMode,
  onPermissionModeChange,
  contextItems,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  // inputValue 程序化清空（如发送后）时重置高度，避免 textarea 保持展开
  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(e.target.value);
      autoResize();
    },
    [onInputChange, autoResize],
  );

  const currentPerm = PERMISSION_OPTIONS.find((o) => o.value === permissionMode) || PERMISSION_OPTIONS[0];
  const PermIcon = currentPerm.icon;
  const hasContext = contextItems.length > 0;

  return (
    <div className="shrink-0 bg-background px-6 pt-3 pb-4">
      <div className="max-w-[720px] mx-auto">
        <div
          className="bg-surface border border-border rounded-lg overflow-hidden
            focus-within:border-accent-strong focus-within:ring-[3px] focus-within:ring-accent-subtle-bg
            transition-all duration-150"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={onKeyDown}
            disabled={isLoading}
            placeholder={hasContext ? '基于选中的上下文提问...' : '在此输入消息，与 Agent 交流...'}
            className="w-full px-4 py-3 text-body leading-relaxed text-text-primary
              bg-transparent placeholder:text-text-tertiary resize-none
              min-h-[40px] max-h-[120px] font-sans outline-none"
          />

          <div className="flex justify-between items-center px-2 pb-2 pt-1.5">
            {/* 左侧：上下文药丸 + 权限 pill */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {contextItems.map((item) => (
                <span
                  key={`${item.type}-${item.id}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-label font-mono font-medium ${
                    item.type === 'flow'
                      ? 'bg-accent-subtle-bg text-accent-subtle-text'
                      : 'bg-success/10 text-success'
                  }`}
                >
                  {item.type === 'flow' ? 'F' : 'D'}
                  {item.id}
                </span>
              ))}

              {hasContext && <div className="w-px h-3.5 bg-border shrink-0" />}

              {/* 权限 pill */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="权限模式选择"
                    className="h-6 px-2 rounded-sm bg-surface-sunken text-text-secondary text-label font-medium
                      hover:text-text-primary inline-flex items-center gap-1 transition-colors duration-150 cursor-pointer"
                  >
                    <PermIcon size={12} />
                    {currentPerm.label}
                    <ChevronDown size={10} className="text-text-tertiary" />
                    {permissionMode === 'review' && (
                      <span className="w-[5px] h-[5px] rounded-full bg-warning" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sideOffset={8}>
                  {PERMISSION_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => onPermissionModeChange(opt.value)}
                    >
                      <opt.icon size={14} className="text-text-secondary" />
                      <span className="flex-1">{opt.label}</span>
                      <span className="text-xs text-text-tertiary">{opt.description}</span>
                      {permissionMode === opt.value && <Check size={14} className="text-accent-strong" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 右侧：清空 + 发送 */}
            <div className="flex items-center gap-1 shrink-0">
              {hasMessages && (
                <button
                  type="button"
                  onClick={onClear}
                  title="清空对话"
                  className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary
                    hover:bg-surface-sunken hover:text-text-secondary transition-all duration-150 cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              )}

              <button
                type="button"
                onClick={isLoading ? onStop : onSend}
                disabled={!isLoading && !inputValue.trim()}
                title={isLoading ? '停止生成' : '发送 (Enter)'}
                aria-label={isLoading ? '停止生成' : '发送消息'}
                className="w-[30px] h-[30px] rounded-full bg-accent-strong text-accent-on
                  hover:bg-accent-hover active:scale-[0.92] transition-all duration-150
                  flex items-center justify-center shrink-0
                  disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <Square size={12} fill="currentColor" />
                ) : (
                  <ArrowUp size={14} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
