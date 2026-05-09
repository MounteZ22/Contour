import { ArrowLeft, Edit3, Files, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { AIWorkbenchPanel } from '../components/AIWorkbenchPanel';
import { MarkdownArticle } from '../components/MarkdownArticle';
import { StatusBadge } from '../components/StatusBadge';
import type { ProjectData } from '../types';

export function FlowWorkspacePage() {
  const { onRefresh, project, projects } = useOutletContext<{ onRefresh: () => void; project: ProjectData; projects: ProjectData[] }>();
  const { flowId } = useParams();
  const initialFlow = project.flows.find((item) => item.flowId === flowId) ?? project.flows[0];

  const [localSections, setLocalSections] = useState(initialFlow.sections);
  const fallbackSection = localSections[0];
  const [activeSectionId, setActiveSectionId] = useState(fallbackSection?.id ?? '');
  const activeSection = localSections.find((section) => section.id === activeSectionId) ?? fallbackSection;
  const linkedClaim = project.claims.find((claim) => initialFlow.linkedClaims.includes(claim.claimId));

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  useEffect(() => {
    const currentFlow = project.flows.find((item) => item.flowId === flowId) ?? project.flows[0];
    setLocalSections(currentFlow.sections);
    setActiveSectionId(currentFlow.sections[0]?.id ?? '');
    setIsEditing(false);
    setShowNewSection(false);
  }, [flowId, project.flows]);

  if (!activeSection) {
    return (
      <div className="grid gap-6">
        <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
          <Link className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-primary-fixed-dim" to="/">
            <ArrowLeft size={16} />
            Back to Projects
          </Link>
        </div>
        <div className="border border-outline-variant rounded-xl p-10 bg-surface-container text-center">
          <p className="text-on-surface-variant">此 Flow 暂无 Section</p>
          <p className="text-on-surface-variant text-sm mt-2">
            请在左侧添加新的 Section
          </p>
        </div>
      </div>
    );
  }

  const handleEdit = () => {
    setEditedContent(activeSection.content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setLocalSections((prev) =>
      prev.map((section) =>
        section.id === activeSection.id ? { ...section, content: editedContent } : section
      )
    );
    setIsEditing(false);

    try {
      const res = await fetch(`/api/flows/${initialFlow.flowId}/sections/${activeSection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });
      const result = await res.json();
      if (!result.success) {
        console.error('保存 Section 失败:', result.error);
      }
    } catch (err) {
      console.error('保存 Section 请求失败:', err);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) return;
    const newId = `section_${Date.now()}`;
    const title = newSectionTitle.trim();

    try {
      const res = await fetch(`/api/flows/${initialFlow.flowId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: newId, title }),
      });
      const result = await res.json();
      if (!result.success) {
        console.error('创建 Section 失败:', result.error);
        return;
      }
    } catch (err) {
      console.error('创建 Section 请求失败:', err);
      return;
    }

    const newSection = {
      id: newId,
      title,
      filename: `${newId}.md`,
      content: `# ${title}\n\n在此输入内容...`,
    };
    setLocalSections((prev) => [...prev, newSection]);
    setActiveSectionId(newId);
    setNewSectionTitle('');
    setShowNewSection(false);
    onRefresh();
  };

  const handleDeleteSection = async (sectionId: string, title: string) => {
    if (!confirm(`确定要删除 Section "${title}" 吗？此操作不可撤销。`)) return;
    try {
      const res = await fetch(
        `/api/flows/${initialFlow.flowId}/sections/${sectionId}?projectId=${project.projectId}`,
        { method: 'DELETE' }
      );
      const result = await res.json();
      if (!result.success) {
        console.error('删除 Section 失败:', result.error);
        return;
      }
      setLocalSections((prev) => prev.filter((s) => s.id !== sectionId));
      if (activeSectionId === sectionId) {
        const remaining = localSections.filter((s) => s.id !== sectionId);
        setActiveSectionId(remaining[0]?.id ?? '');
      }
      onRefresh();
    } catch (err) {
      console.error('删除 Section 请求失败:', err);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
        <Link className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-primary-fixed-dim" to="/">
          <ArrowLeft size={16} />
          Back to Projects
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface font-medium">{initialFlow.flowId}</span>
      </div>

      <header className="flex items-start justify-between gap-3 border border-outline-variant rounded-xl p-5 bg-surface-container max-md:flex-col max-md:items-start">
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">{initialFlow.flowId}</p>
          <h2 className="text-xl font-bold text-on-background font-headline">{initialFlow.title}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={initialFlow.status} />
          <span className="text-xs text-on-surface-variant font-mono">{initialFlow.type.replace('_', ' ')}</span>
          <span className="text-xs text-on-surface-variant font-mono">更新于 {initialFlow.updated}</span>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-4 border border-outline-variant rounded-xl p-5 bg-surface-container max-lg:grid-cols-1">
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">待解决的不确定性</p>
          <strong className="text-sm text-on-surface font-mono">{initialFlow.openUncertainties[0]}</strong>
        </div>
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">父节点</p>
          <strong className="text-sm text-on-surface font-mono">{initialFlow.parentFlows.length === 0 ? 'Root' : initialFlow.parentFlows.join(', ')}</strong>
        </div>
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">标签</p>
          <strong className="text-sm text-on-surface font-mono">{initialFlow.tags.join(' · ')}</strong>
        </div>
      </section>

      <div className="grid grid-cols-[260px_1fr_320px] gap-4 items-start max-xl:grid-cols-1">
        <aside className="border border-outline-variant bg-surface-container rounded-xl p-5 sticky top-[122px] max-xl:static">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <Files size={18} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">Sections</p>
              <h3 className="text-base font-semibold text-on-surface font-headline">Flow documents</h3>
            </div>
          </div>

          <div className="grid gap-3 mt-4">
            {localSections.map((section) => (
              <div
                className={`w-full text-left border rounded-lg p-3.5 flex items-center justify-between gap-2 cursor-pointer transition-all ${
                  section.id === activeSection.id
                    ? 'border-primary/20 bg-primary-container/5'
                    : 'border-transparent bg-surface-container-low/50 hover:border-primary/20 hover:bg-primary-container/5'
                }`}
                key={section.id}
              >
                <button
                  className="flex-1 grid gap-1.5 bg-transparent border-none text-inherit text-left p-0 cursor-pointer font-inherit"
                  onClick={() => {
                    setActiveSectionId(section.id);
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  <strong className="text-sm text-on-surface">{section.title}</strong>
                  <span className="text-[11px] text-on-surface-variant font-mono">{section.filename}</span>
                </button>
                <button
                  className="w-6 h-6 rounded-md border border-outline-variant/50 bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors hover:bg-error/20 hover:border-error/30 hover:text-error"
                  onClick={() => handleDeleteSection(section.id, section.title)}
                  title="删除 Section"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {showNewSection ? (
              <div className="grid gap-2 p-3 border border-primary/25 rounded-lg bg-primary-container/5">
                <input
                  autoFocus
                  className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono"
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSection();
                    if (e.key === 'Escape') setShowNewSection(false);
                  }}
                  placeholder="Section name"
                  type="text"
                  value={newSectionTitle}
                />
                <div className="flex gap-2">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono" onClick={handleAddSection} type="button">
                    添加
                  </button>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono" onClick={() => setShowNewSection(false)} type="button">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button className="w-full text-left border border-dashed border-outline-variant rounded-lg p-3 bg-transparent text-on-surface-variant inline-flex items-center gap-2 cursor-pointer hover:border-primary/40 hover:text-primary hover:bg-surface-container-low transition-all" onClick={() => setShowNewSection(true)} type="button">
                <Plus size={14} />
                New Section
              </button>
            )}
          </div>
        </aside>

        <section className="border border-outline-variant bg-surface-container rounded-xl p-5 min-h-[70vh]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">{isEditing ? '编辑模式' : '阅读区'}</p>
              <h3 className="text-base font-semibold text-on-surface font-headline">{activeSection.title}</h3>
            </div>
            <div className="flex gap-2 items-center">
              {isEditing ? (
                <>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono" onClick={handleSave} type="button">
                    保存
                  </button>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono" onClick={handleCancel} type="button">
                    取消
                  </button>
                </>
              ) : (
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer transition-colors hover:bg-primary-container/15 hover:border-primary/25 font-mono" onClick={handleEdit} type="button">
                  <Edit3 size={14} />
                  编辑
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60vh] mt-4 p-5 rounded-lg bg-surface-container-lowest border border-primary/25 text-on-surface font-mono text-sm leading-7 resize-y outline-none focus:border-primary/40"
              onChange={(e) => setEditedContent(e.target.value)}
              value={editedContent}
            />
          ) : (
            <MarkdownArticle content={activeSection.content} />
          )}
        </section>

        <AIWorkbenchPanel claim={linkedClaim} />
      </div>
    </div>
  );
}
