import { ArrowLeft, Bot, Edit3, Eye, FileStack, Library, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import { MarkdownArticle } from '../components/MarkdownArticle';
import { TagEditor } from '../components/shared/TagEditor';
import { useOptimisticMutation } from '../hooks/useOptimisticMutation';
import type { ProjectData } from '../types';

export function ProjectDocPage() {
  const { project } = useOutletContext<{ project: ProjectData; projects: ProjectData[] }>();
  const { docId } = useParams();
  const [localDocs, setLocalDocs] = useState(project.docs);
  const activeDoc = localDocs.find((doc) => doc.id === docId) ?? localDocs[0];

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(activeDoc.content);
  const [editedTags, setEditedTags] = useState<string[]>(activeDoc?.tags ?? []);

  const { mutate, isPending } = useOptimisticMutation();

  if (!activeDoc) {
    return null;
  }

  const handleEdit = () => {
    setEditedContent(activeDoc.content);
    setEditedTags([...activeDoc.tags]);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const previousDocs = localDocs;
    setLocalDocs((prev) =>
      prev.map((doc) =>
        doc.id === activeDoc.id ? { ...doc, content: editedContent, tags: editedTags } : doc
      )
    );
    setIsEditing(false);

    const ok = await mutate({
      optimistic: () => previousDocs,
      mutationFn: async () => {
        const res = await fetch(`/api/docs/${activeDoc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedContent, tags: editedTags }),
        });
        return res.json() as Promise<{ success: boolean; error?: string }>;
      },
      rollback: (prev) => {
        setLocalDocs(prev);
        setIsEditing(true);
      },
      errorMessage: '保存文档失败',
    });
    if (!ok) {
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2.5 text-body text-text-secondary">
        <Link className="inline-flex items-center gap-1.5 text-accent-strong transition-colors hover:text-accent-strong" to="/contour">
          <ArrowLeft size={16} />
          Back to Contour
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-primary font-medium">Background</span>
      </div>

      <header className="flex items-start justify-between gap-3 border border-border rounded-xl p-6 bg-surface-sunken max-md:flex-col max-md:items-start">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-0.5">Background</p>
          <h2 className="text-xl font-bold text-text-primary font-headline">{activeDoc.title}</h2>
          {isEditing ? (
            <div className="flex items-center gap-3 flex-wrap mt-3">
              <TagEditor
                tags={editedTags}
                onTagsChange={setEditedTags}
              />
            </div>
          ) : (
            activeDoc.tags && activeDoc.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {activeDoc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-caption font-mono text-text-secondary bg-surface border border-border/40"
                  >
                    <Tag size={10} />
                    {tag}
                  </span>
                ))}
              </div>
            )
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <Link
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono"
            to="/agent"
          >
            <Bot size={14} />
            去 Agent 讨论
          </Link>
          {isEditing ? (
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono disabled:opacity-50 disabled:cursor-not-allowed" disabled={isPending} onClick={handleSave} type="button">
                保存
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-danger-subtle-bg/25 border-danger/20 text-danger hover:bg-danger-subtle-bg/40 font-mono" onClick={handleCancel} type="button">
                取消
              </button>
            </div>
          ) : (
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono" onClick={handleEdit} type="button">
              <Edit3 size={14} />
              编辑
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[260px_1fr] gap-4 items-start max-xl:grid-cols-1">
        <aside className="border border-border bg-surface-sunken rounded-xl p-6 sticky top-[122px] max-xl:static">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
              <Library size={18} />
            </div>
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">Project Docs</p>
              <h3 className="text-base font-semibold text-text-primary font-headline">Browse references</h3>
            </div>
          </div>

          <div className="grid gap-3 mt-4">
            {localDocs.map((doc) => (
              <NavLink
                className={({ isActive }) =>
                  `w-full text-left border rounded-lg p-3 flex items-center justify-between gap-2 cursor-pointer transition-all ${
                    isActive
                      ? 'border-accent-strong/20 bg-accent-subtle-bg/5'
                      : 'border-transparent bg-surface-sunken/50 hover:border-accent-strong/20 hover:bg-accent-subtle-bg/5'
                  }`
                }
                key={doc.id}
                to={`/project/${project.projectId}/docs/${doc.id}`}
              >
                <div className="grid gap-1">
                  <strong className="text-body text-text-primary">{doc.title}</strong>
                  <span className="text-caption text-text-secondary line-clamp-2">{doc.summary}</span>
                </div>
              </NavLink>
            ))}
          </div>
        </aside>

        <section className="border border-border bg-surface-sunken rounded-xl p-6 min-h-[70vh]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
              <FileStack size={18} />
            </div>
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">{isEditing ? '编辑模式' : '文档阅读器'}</p>
              <h3 className="text-base font-semibold text-text-primary font-headline">{activeDoc.title}</h3>
            </div>
            {isEditing ? <Edit3 size={16} className="text-accent-strong" /> : <Eye size={16} className="text-accent-strong" />}
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60vh] mt-4 p-5 rounded-lg bg-surface-raised border border-accent-strong/25 text-text-primary font-mono text-sm leading-7 resize-y outline-none focus:border-accent-strong/40"
              onChange={(e) => setEditedContent(e.target.value)}
              value={editedContent}
            />
          ) : (
            <MarkdownArticle content={activeDoc.content} />
          )}
        </section>
      </div>
    </div>
  );
}
