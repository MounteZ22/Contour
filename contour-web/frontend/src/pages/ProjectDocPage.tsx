import { ArrowLeft, Edit3, Eye, FileStack, Library } from 'lucide-react';
import { useState } from 'react';
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
    setLocalDocs((prev) =>
      prev.map((doc) =>
        doc.id === activeDoc.id ? { ...doc, content: editedContent } : doc
      )
    );
    setIsEditing(false);

    // 调用后端 API 保存
    try {
      const res = await fetch(`/api/docs/${activeDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });
      const result = await res.json();
      if (!result.success) {
        console.error('保存 Doc 失败:', result.error);
      }
    } catch (err) {
      console.error('保存 Doc 请求失败:', err);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <div className="workspace-page">
      <div className="contour-breadcrumb">
        <Link className="breadcrumb-link" to="/">
          <ArrowLeft size={16} />
          Back to Projects
        </Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">Background</span>
      </div>

      <header className="workspace-header">
        <div>
          <p className="eyebrow">Background</p>
          <h2>{activeDoc.title}</h2>
        </div>
        <div className="workspace-meta">
          <span>{activeDoc.type.replace('_', ' ')}</span>
          {isEditing ? (
            <div className="edit-actions">
              <button className="edit-btn edit-btn-save" onClick={handleSave} type="button">
                保存
              </button>
              <button className="edit-btn edit-btn-cancel" onClick={handleCancel} type="button">
                取消
              </button>
            </div>
          ) : (
            <button className="edit-btn" onClick={handleEdit} type="button">
              <Edit3 size={14} />
              编辑
            </button>
          )}
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="panel-card nav-panel">
          <div className="panel-card-header">
            <div className="panel-icon">
              <Library size={18} />
            </div>
            <div>
              <p className="eyebrow">Project Docs</p>
              <h3>Browse references</h3>
            </div>
          </div>

          <div className="workspace-nav-list">
            {localDocs.map((doc) => (
              <NavLink
                className={({ isActive }) =>
                  isActive ? 'workspace-nav-item workspace-nav-item-active' : 'workspace-nav-item'
                }
                key={doc.id}
                to={`/project/${project.projectId}/docs/${doc.id}`}
              >
                <strong>{doc.title}</strong>
                <span>{doc.summary}</span>
              </NavLink>
            ))}
          </div>
        </aside>

        <section className="panel-card article-panel">
          <div className="panel-card-header">
            <div className="panel-icon">
              <FileStack size={18} />
            </div>
            <div>
              <p className="eyebrow">{isEditing ? '编辑模式' : '文档阅读器'}</p>
              <h3>{activeDoc.title}</h3>
            </div>
            {isEditing ? <Edit3 size={16} className="edit-indicator" /> : <Eye size={16} className="edit-indicator" />}
          </div>

          {isEditing ? (
            <textarea
              className="markdown-editor"
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
