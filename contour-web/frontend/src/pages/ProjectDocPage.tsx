import { ArrowLeft, Edit3, Eye, FileStack, Library } from 'lucide-react';
import { useState } from 'react';
import { showToast } from '../components/Toast';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import { AIWorkbenchPanel } from '../components/AIWorkbenchPanel';
import { MarkdownArticle } from '../components/MarkdownArticle';
import type { ProjectData } from '../types';

export function ProjectDocPage() {
  const { project } = useOutletContext<{ project: ProjectData; projects: ProjectData[] }>();
  const { docId } = useParams();
  const [localDocs, setLocalDocs] = useState(project.docs);
  const activeDoc = localDocs.find((doc) => doc.id === docId) ?? localDocs[0];

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(activeDoc.content);

  if (!activeDoc) {
    return null;
  }

  const handleEdit = () => {
    setEditedContent(activeDoc.content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const previousDocs = localDocs;
    setLocalDocs((prev) =>
      prev.map((doc) =>
        doc.id === activeDoc.id ? { ...doc, content: editedContent } : doc
      )
    );
    setIsEditing(false);

    try {
      const res = await fetch(`/api/docs/${activeDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });
      const result = await res.json();
      if (!result.success) {
        setLocalDocs(previousDocs);
        setIsEditing(true);
        showToast(`保存文档失败：${result.error}`, 'error');
      }
    } catch (err) {
      setLocalDocs(previousDocs);
      setIsEditing(true);
      showToast(`保存文档请求失败：${(err as Error).message}`, 'error');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
        <Link className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-primary-fixed-dim" to="/">
          <ArrowLeft size={16} />
          Back to Projects
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface font-medium">Background</span>
      </div>

      <header className="flex items-start justify-between gap-3 border border-outline-variant rounded-xl p-5 bg-surface-container max-md:flex-col max-md:items-start">
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">Background</p>
          <h2 className="text-xl font-bold text-on-background font-headline">{activeDoc.title}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-on-surface-variant font-mono">{activeDoc.type.replace('_', ' ')}</span>
          {isEditing ? (
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono" onClick={handleSave} type="button">
                保存
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono" onClick={handleCancel} type="button">
                取消
              </button>
            </div>
          ) : (
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer transition-colors hover:bg-primary-container/15 hover:border-primary/25 font-mono" onClick={handleEdit} type="button">
              <Edit3 size={14} />
              编辑
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[260px_1fr_320px] gap-4 items-start max-xl:grid-cols-1">
        <aside className="border border-outline-variant bg-surface-container rounded-xl p-5 sticky top-[122px] max-xl:static">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <Library size={18} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">Project Docs</p>
              <h3 className="text-base font-semibold text-on-surface font-headline">Browse references</h3>
            </div>
          </div>

          <div className="grid gap-3 mt-4">
            {localDocs.map((doc) => (
              <NavLink
                className={({ isActive }) =>
                  `w-full text-left border rounded-lg p-3 flex items-center justify-between gap-2 cursor-pointer transition-all ${
                    isActive
                      ? 'border-primary/20 bg-primary-container/5'
                      : 'border-transparent bg-surface-container-low/50 hover:border-primary/20 hover:bg-primary-container/5'
                  }`
                }
                key={doc.id}
                to={`/project/${project.projectId}/docs/${doc.id}`}
              >
                <div className="grid gap-1">
                  <strong className="text-sm text-on-surface">{doc.title}</strong>
                  <span className="text-xs text-on-surface-variant line-clamp-2">{doc.summary}</span>
                </div>
              </NavLink>
            ))}
          </div>
        </aside>

        <section className="border border-outline-variant bg-surface-container rounded-xl p-5 min-h-[70vh]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <FileStack size={18} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">{isEditing ? '编辑模式' : '文档阅读器'}</p>
              <h3 className="text-base font-semibold text-on-surface font-headline">{activeDoc.title}</h3>
            </div>
            {isEditing ? <Edit3 size={16} className="text-primary" /> : <Eye size={16} className="text-primary" />}
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60vh] mt-4 p-5 rounded-lg bg-surface-container-lowest border border-primary/25 text-on-surface font-mono text-sm leading-7 resize-y outline-none focus:border-primary/40"
              onChange={(e) => setEditedContent(e.target.value)}
              value={editedContent}
            />
          ) : (
            <MarkdownArticle content={activeDoc.content} />
          )}
        </section>

        <AIWorkbenchPanel claim={project.claims[0]} />
      </div>
    </div>
  );
}
