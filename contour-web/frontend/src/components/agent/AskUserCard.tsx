import { useCallback, useEffect, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import type { AskUserRequest, AskUserQuestion } from '../../state/aiApi';
import { sendAskUserResponse } from '../../state/aiApi';

interface AskUserCardProps {
  askUserRequest: AskUserRequest;
  onAnswered?: (answers: Record<string, string>) => void;
}

/**
 * AskUser 交互问答卡片。
 *
 * 支持三种题型：
 * - 单选（radio）：options 数组 + multiSelect: false/未设置
 * - 多选（checkbox）：options 数组 + multiSelect: true
 * - 文本输入（textarea）：不传 options
 *
 * 用户提交后调用后端 POST /api/ai/ask-user-response 回传答案。
 */
export function AskUserCard({ askUserRequest, onAnswered }: AskUserCardProps) {
  const { requestId, questions, status } = askUserRequest;
  const [answers, setAnswers] = useState<Record<string, string>>(askUserRequest.answers ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAnswered = status === 'answered';

  useEffect(() => {
    setAnswers(askUserRequest.answers ?? {});
  }, [askUserRequest.requestId, askUserRequest.answers]);

  const handleSingleSelect = useCallback(
    (header: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [header]: value }));
    },
    [],
  );

  const handleMultiSelect = useCallback(
    (header: string, label: string, checked: boolean) => {
      setAnswers((prev) => {
        const current = prev[header] || '';
        const selected = current ? current.split(',') : [];
        const next = checked
          ? [...selected, label]
          : selected.filter((item) => item !== label);
        return { ...prev, [header]: next.join(',') };
      });
    },
    [],
  );

  const handleTextInput = useCallback(
    (header: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [header]: value }));
    },
    [],
  );

  const canSubmit = questions.every((q) => {
    const answer = answers[q.header];
    return answer !== undefined && answer !== '';
  });

  const handleSubmit = async () => {
    if (!canSubmit || submitting || isAnswered) return;

    setSubmitting(true);
    setError(null);

    try {
      const accepted = await sendAskUserResponse(requestId, answers);
      if (!accepted) {
        setError('服务未接受答案，请重试。');
        return;
      }
      onAnswered?.(answers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提交答案失败';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="my-2 border border-border rounded-lg bg-surface-sunken overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface">
        <MessageSquare size={14} className="text-accent-strong" />
        <span className="text-caption font-medium text-text-primary">
          {isAnswered ? '已回答' : '请回答以下问题'}
        </span>
        {isAnswered && (
          <span className="text-[11px] text-accent-strong ml-auto">✓</span>
        )}
      </div>

      {/* 问题列表 */}
      <div className="px-3 py-2 space-y-3">
        {questions.map((question) => (
          <QuestionItem
            key={question.header}
            question={question}
            answer={answers[question.header] || ''}
            disabled={isAnswered || submitting}
            onSingleSelect={handleSingleSelect}
            onMultiSelect={handleMultiSelect}
            onTextInput={handleTextInput}
          />
        ))}
      </div>

      {/* 提交按钮 + 错误提示 */}
      {!isAnswered && (
        <div className="px-3 py-2 border-t border-border bg-surface flex items-center gap-2">
          <button
            type="button"
            disabled={!canSubmit || submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption font-medium
              bg-accent text-white hover:bg-accent-strong
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
            onClick={() => { void handleSubmit(); }}
          >
            {submitting ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Send size={12} />
                提交答案
              </>
            )}
          </button>
          {error && (
            <span className="text-[11px] text-danger">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── 单题渲染 ──────────────────────────────────────────────────────────────────

interface QuestionItemProps {
  question: AskUserQuestion;
  answer: string;
  disabled: boolean;
  onSingleSelect: (header: string, value: string) => void;
  onMultiSelect: (header: string, label: string, checked: boolean) => void;
  onTextInput: (header: string, value: string) => void;
}

function QuestionItem({
  question,
  answer,
  disabled,
  onSingleSelect,
  onMultiSelect,
  onTextInput,
}: QuestionItemProps) {
  const { header, question: questionText, options, multiSelect } = question;

  // 有选项 → 选择类题型
  if (options && options.length > 0) {
    const isMulti = multiSelect === true;
    const selectedLabels = answer ? answer.split(',') : [];

    return (
      <div>
        <p className="text-body-sm font-medium text-text-primary mb-1.5">
          {questionText}
        </p>
        <div className="space-y-1">
          {options.map((option) => {
            const isSelected = isMulti
              ? selectedLabels.includes(option.label)
              : answer === option.label;

            return (
              <label
                key={option.label}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer
                  transition-colors
                  ${disabled ? 'opacity-60 cursor-default' : 'hover:bg-surface'}
                  ${isSelected && !disabled ? 'bg-accent-subtle-bg/50' : ''}`}
              >
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name={`askuser-${header}`}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={(e) => {
                    if (isMulti) {
                      onMultiSelect(header, option.label, e.target.checked);
                    } else {
                      onSingleSelect(header, option.label);
                    }
                  }}
                  className="mt-0.5 accent-accent"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-body-sm text-text-primary">
                    {option.label}
                  </span>
                  {option.description && (
                    <p className="text-caption text-text-tertiary mt-0.5">
                      {option.description}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // 无选项 → 文本输入题
  return (
    <div>
      <p className="text-body-sm font-medium text-text-primary mb-1.5">
        {questionText}
      </p>
      <textarea
        value={answer}
        disabled={disabled}
        onChange={(e) => onTextInput(header, e.target.value)}
        placeholder="请输入你的回答..."
        rows={3}
        className="w-full px-3 py-2 rounded-md border border-border bg-surface
          text-body-sm text-text-primary placeholder:text-text-tertiary
          focus:outline-none focus:ring-1 focus:ring-accent
          disabled:opacity-60 resize-y"
      />
    </div>
  );
}
