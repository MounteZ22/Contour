import { ArrowLeft, Edit3, Eye, Files, Plus, Sparkles, Trash2 } from 'lucide-react';
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
      <div className="workspace-page">
        <div className="contour-breadcrumb">
          <Link className="breadcrumb-link" to="/">
            <ArrowLeft size={16} />
            Back to Projects
          </Link>
        </div>
        <div className="panel-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>此 Flow 暂无 Section</p>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
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
    // 先更新本地状态
    setLocalSections((prev) =>
      prev.map((section) =>
        section.id === activeSection.id ? { ...section, content: editedContent } : section
      )
    );
    setIsEditing(false);

    // 调用后端 API 保存
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

    // 先调后端创建文件
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
    <div className="workspace-page">
      <div className="contour-breadcrumb">
        <Link className="breadcrumb-link" to="/">
          <ArrowLeft size={16} />
          Back to Projects
        </Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{initialFlow.flowId}</span>
      </div>

      <header className="workspace-header">
        <div>
          <p className="eyebrow">{initialFlow.flowId}</p>
          <h2>{initialFlow.title}</h2>
        </div>
        <div className="workspace-metadata-cluster">
          <StatusBadge status={initialFlow.status} />
          <span>{initialFlow.type.replace('_', ' ')}</span>
          <span>更新于 {initialFlow.updated}</span>
        </div>
      </header>

      <section className="flow-meta-banner">
        <div>
          <p className="eyebrow">待解决的不确定性</p>
          <strong>{initialFlow.openUncertainties[0]}</strong>
        </div>
        <div>
          <p className="eyebrow">父节点</p>
          <strong>{initialFlow.parentFlows.length === 0 ? 'Root' : initialFlow.parentFlows.join(', ')}</strong>
        </div>
        <div>
          <p className="eyebrow">标签</p>
          <strong>{initialFlow.tags.join(' · ')}</strong>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="panel-card nav-panel">
          <div className="panel-card-header">
            <div className="panel-icon">
              <Files size={18} />
            </div>
            <div>
              <p className="eyebrow">Sections</p>
              <h3>Flow documents</h3>
            </div>
          </div>

          <div className="workspace-nav-list">
            {localSections.map((section) => (
              <div
                className={
                  section.id === activeSection.id
                    ? 'workspace-nav-item workspace-nav-item-active'
                    : 'workspace-nav-item'
                }
                key={section.id}
              >
                <button
                  className="workspace-nav-item-content"
                  onClick={() => {
                    setActiveSectionId(section.id);
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  <strong>{section.title}</strong>
                  <span>{section.filename}</span>
                </button>
                <button
                  className="delete-btn delete-btn-small"
                  onClick={() => handleDeleteSection(section.id, section.title)}
                  title="删除 Section"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {showNewSection ? (
              <div className="new-section-form">
                <input
                  autoFocus
                  className="new-section-input"
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSection();
                    if (e.key === 'Escape') setShowNewSection(false);
                  }}
                  placeholder="Section name"
                  type="text"
                  value={newSectionTitle}
                />
                <div className="new-section-actions">
                  <button className="edit-btn edit-btn-save" onClick={handleAddSection} type="button">
                    添加
                  </button>
                  <button className="edit-btn edit-btn-cancel" onClick={() => setShowNewSection(false)} type="button">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button className="new-section-trigger" onClick={() => setShowNewSection(true)} type="button">
                <Plus size={14} />
                New Section
              </button>
            )}
          </div>
        </aside>

        <section className="panel-card article-panel">
          <div className="panel-card-header">
            <div className="panel-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="eyebrow">{isEditing ? '编辑模式' : '阅读区'}</p>
              <h3>{activeSection.title}</h3>
            </div>
            <div className="article-actions">
              {isEditing ? (
                <>
                  <button className="edit-btn edit-btn-save" onClick={handleSave} type="button">
                    保存
                  </button>
                  <button className="edit-btn edit-btn-cancel" onClick={handleCancel} type="button">
                    取消
                  </button>
                </>
              ) : (
                <button className="edit-btn" onClick={handleEdit} type="button">
                  <Edit3 size={14} />
                  编辑
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              className="markdown-editor"
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
