import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownArticle({ content }: { content: string }) {
  return (
    <div className="mt-4 rounded-2xl p-5 bg-surface-container-low border border-outline-variant/50 prose prose-slate max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
