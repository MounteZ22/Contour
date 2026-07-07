import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownArticle({ content }: { content: string }) {
  return (
    <div className="mt-4 rounded-xl p-6 bg-surface-sunken border border-border/50 prose prose-slate max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
