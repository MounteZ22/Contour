import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ClipboardList,
  ChevronDown,
  Cpu,
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
import type { AgentModelOption } from '@/state/agentModelSelection';
import { MentionList, type MentionItem } from './MentionList';

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
  /** 可选，保留给首发会话等复用场景；未提供时后端使用默认渠道。 */
  modelOptions?: AgentModelOption[];
  selectedModel?: AgentModelOption;
  modelStatus?: 'idle' | 'loading' | 'ready' | 'error';
  onModelChange?: (option: AgentModelOption) => void;
  /** Plan Mode 开关 */
  planModeEnabled?: boolean;
  onPlanModeChange?: (enabled: boolean) => void;
  /** 当前项目 ID，用于 @ 提及搜索 */
  projectId?: string;
}

const PERMISSION_OPTIONS: { value: PermissionMode; label: string; icon: typeof Eye; description: string }[] = [
  { value: 'readonly', label: '只读', icon: Eye, description: '仅允许读取文件' },
  { value: 'review', label: '审查', icon: ShieldCheck, description: '写操作需弹窗确认' },
  { value: 'yolo', label: '自动', icon: Zap, description: '在项目范围内自动写入' },
];

/** 从 textarea 当前光标位置找到最近的 @ 及其查询文本 */
function extractMentionQuery(
  value: string,
  cursorPos: number,
): { atIndex: number; query: string } | null {
  // 从光标位置往前找最近的非空白 @
  const beforeCursor = value.slice(0, cursorPos);
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;

  // @ 前面必须是行首或空白字符
  if (atIndex > 0 && !/[\s\n]/.test(beforeCursor[atIndex - 1])) return null;

  // @ 和光标之间不应包含空格或换行
  const query = beforeCursor.slice(atIndex + 1);
  if (/[\s\n]/.test(query)) return null;

  return { atIndex, query };
}

/**
 * 通过测量 span 元素来估算 textarea 中指定位置的像素坐标。
 * 返回相对于输入容器的 top/left。
 */
function measureCaretPosition(
  textarea: HTMLTextAreaElement,
  charIndex: number,
  lineHeight: number,
): { top: number; left: number } {
  // 使用 canvas 测量会更好，但为简洁这里基于 columns 和 rows 估算
  const style = window.getComputedStyle(textarea);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;

  // 计算 @ 之前的文本宽度
  const textBeforeAt = textarea.value.slice(0, charIndex);

  // 创建隐藏的测量 span
  const measurer = document.createElement('span');
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.whiteSpace = 'pre-wrap';
  measurer.style.wordWrap = 'break-word';
  measurer.style.font = style.font;
  measurer.style.fontSize = style.fontSize;
  measurer.style.fontFamily = style.fontFamily;
  measurer.style.lineHeight = style.lineHeight;
  measurer.style.width = `${textarea.clientWidth - paddingLeft - (parseFloat(style.paddingRight) || 0)}px`;
  measurer.style.overflowWrap = 'break-word';
  document.body.appendChild(measurer);

  try {
    // 分行计算
    const lines = textBeforeAt.split('\n');
    const lastLine = lines[lines.length - 1] || '';
    const lineCount = lines.length;

    // 测量最后一行的宽度
    measurer.textContent = lastLine;
    const lastLineWidth = measurer.offsetWidth;

    return {
      top: paddingTop + (lineCount - 1) * lineHeight,
      left: paddingLeft + lastLineWidth,
    };
  } finally {
    document.body.removeChild(measurer);
  }
}

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
  modelOptions = [],
  selectedModel,
  modelStatus = 'idle',
  onModelChange,
  projectId,
  planModeEnabled = false,
  onPlanModeChange,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── @ 提及状态 ──────────────────────────────────────────────────
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const mentionAtRef = useRef<number>(0); // @ 在文本中的位置
  const mentionQueryRef = useRef<string>(''); // 当前查询文本
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  // 关闭提及面板
  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionItems([]);
    setMentionIndex(0);
    mentionQueryRef.current = '';
    mentionAtRef.current = 0;
  }, []);

  // 从后端搜索提及项
  const fetchMentions = useCallback(
    (query: string) => {
      if (!projectId || !query) {
        setMentionItems([]);
        setMentionIndex(0);
        return;
      }
      fetch(
        `/api/project/${encodeURIComponent(projectId)}/search-mentions?q=${encodeURIComponent(query)}`,
      )
        .then((res) => res.json())
        .then((result) => {
          if (result.success && Array.isArray(result.data)) {
            setMentionItems(result.data.slice(0, 20));
            setMentionIndex(0);
          }
        })
        .catch(() => {
          setMentionItems([]);
        });
    },
    [projectId],
  );

  // 选中提及项并插入引用
  const selectMention = useCallback(
    (item: MentionItem) => {
      const atIndex = mentionAtRef.current;
      const query = mentionQueryRef.current;
      // 替换 @query 为 @[name](path)
      const before = inputValue.slice(0, atIndex);
      const after = inputValue.slice(atIndex + 1 + query.length);
      const refText = `@[${item.name}](${item.path})`;
      const newValue = `${before}${refText}${after}`;

      onInputChange(newValue);
      closeMention();

      // 恢复焦点并将光标移到引用之后
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const newCursorPos = before.length + refText.length;
        el.setSelectionRange(newCursorPos, newCursorPos);
        autoResize();
      }, 0);
    },
    [inputValue, onInputChange, closeMention, autoResize],
  );

  // 清理 fetch timer
  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onInputChange(newValue);
      autoResize();

      // 检测 @ 触发
      const cursorPos = e.target.selectionStart;
      const mention = extractMentionQuery(newValue, cursorPos);

      if (mention && projectId) {
        mentionAtRef.current = mention.atIndex;
        mentionQueryRef.current = mention.query;

        // 计算弹窗位置
        const el = textareaRef.current;
        if (el) {
          const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;
          const pos = measureCaretPosition(el, mention.atIndex, lineHeight);
          setMentionPosition({ top: pos.top + lineHeight + 2, left: pos.left });
        }

        setMentionOpen(true);

        // 防抖搜索
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => fetchMentions(mention.query), 150);
      } else {
        closeMention();
      }
    },
    [onInputChange, autoResize, projectId, closeMention, fetchMentions],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionOpen && mentionItems.length > 0) {
        // 提及面板打开时拦截方向键和 Enter/Escape
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((prev) => (prev + 1) % mentionItems.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((prev) => (prev - 1 + mentionItems.length) % mentionItems.length);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          selectMention(mentionItems[mentionIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
          return;
        }
      }
      // 委托父组件的键盘处理
      onKeyDown(e);
    },
    [mentionOpen, mentionItems, mentionIndex, selectMention, closeMention, onKeyDown],
  );

  const currentPerm = PERMISSION_OPTIONS.find((o) => o.value === permissionMode) || PERMISSION_OPTIONS[0];
  const PermIcon = currentPerm.icon;
  const hasContext = contextItems.length > 0;

  return (
    <div className="shrink-0 bg-background px-6 pt-3 pb-4">
      <div className="max-w-[720px] mx-auto">
        <div
          ref={containerRef}
          className="bg-surface border border-border rounded-lg overflow-hidden relative
            focus-within:border-accent-strong focus-within:ring-[3px] focus-within:ring-accent-subtle-bg
            transition-all duration-150"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={hasContext ? '基于选中的上下文提问...' : '在此输入消息，与 Agent 交流...'}
            className="w-full px-4 py-3 text-body leading-relaxed text-text-primary
              bg-transparent placeholder:text-text-tertiary resize-none
              min-h-[40px] max-h-[120px] font-sans outline-none"
          />

          {/* @ 提及建议弹窗 */}
          {mentionOpen && mentionItems.length > 0 && (
            <MentionList
              items={mentionItems}
              selectedIndex={mentionIndex}
              onSelect={selectMention}
              onClose={closeMention}
              position={mentionPosition}
            />
          )}

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

              {/* 模型选择：仅展示安全的渠道与模型名称，实际凭据始终保留在后端。 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="模型选择"
                    disabled={modelStatus === 'loading' || !onModelChange || modelOptions.length === 0}
                    className="h-6 max-w-44 px-2 rounded-sm bg-surface-sunken text-text-secondary text-label font-medium
                      hover:text-text-primary inline-flex items-center gap-1 transition-colors duration-150 cursor-pointer
                      disabled:opacity-60 disabled:cursor-not-allowed"
                    title={
                      selectedModel
                        ? `${selectedModel.channelName} · ${selectedModel.modelName}`
                        : modelStatus === 'error'
                          ? '模型列表暂不可用，将使用默认渠道'
                          : '正在加载可用模型'
                    }
                  >
                    <Cpu size={12} />
                    <span className="truncate">
                      {selectedModel?.modelName ?? (modelStatus === 'error' ? '默认模型' : '加载模型...')}
                    </span>
                    <ChevronDown size={10} className="text-text-tertiary shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sideOffset={8} className="max-h-64 overflow-y-auto">
                  {modelOptions.map((option) => {
                    const selected = selectedModel?.channelId === option.channelId && selectedModel.modelId === option.modelId;
                    return (
                      <DropdownMenuItem key={`${option.channelId}:${option.modelId}`} onClick={() => onModelChange?.(option)}>
                        <Cpu size={14} className="text-text-secondary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.modelName}</span>
                          <span className="block truncate text-xs text-text-tertiary">{option.channelName}</span>
                        </span>
                        {selected && <Check size={14} className="text-accent-strong shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

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

              <button
                type="button"
                onClick={() => onPlanModeChange?.(!planModeEnabled)}
                aria-label="计划模式"
                aria-pressed={planModeEnabled}
                title={planModeEnabled ? '关闭计划模式' : '开启计划模式'}
                className={`w-6 h-6 rounded-sm inline-flex items-center justify-center transition-colors duration-150 cursor-pointer
                  ${planModeEnabled
                    ? 'bg-accent-subtle-bg text-accent-strong'
                    : 'bg-surface-sunken text-text-secondary hover:text-text-primary'}`}
              >
                <ClipboardList size={13} />
              </button>
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
