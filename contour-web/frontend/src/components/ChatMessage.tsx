import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot } from 'lucide-react';
import type { ChatMessage } from '../state/aiApi';

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const avatarClass = useMemo(() => {
    return isUser
      ? 'bg-primary text-on-primary'
      : 'bg-secondary-container text-secondary';
  }, [isUser]);

  const bubbleClass = useMemo(() => {
    return isUser
      ? 'bg-primary-container text-on-primary-container'
      : 'bg-surface-container-high text-on-surface';
  }, [isUser]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${avatarClass}`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${bubbleClass}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
