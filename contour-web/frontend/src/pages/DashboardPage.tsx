import { FlaskConical, FolderOpen, Layers, Map, MoveRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlowCard } from '../components/FlowCard';
import type { Flow, ProjectData } from '../types';

export function DashboardPage({
  onRefresh,
  projects,
}: {
  onRefresh: () => void;
  projects: ProjectData[];
}) {
  const [localProjects, setLocalProjects] = useState<ProjectData[]>(projects);
  const [selectedProject, setSelectedProject] = useState<ProjectData>(projects[0]);
  const [localFlows, setLocalFlows] = useState<Flow[]>(projects[0]?.flows ?? []);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectGoal, setNewProjectGoal] = useState('');

  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newFlowTitle, setNewFlowTitle] = useState('');

  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState('background');

  // 当 projects prop 变化时（如 App.tsx 刷新数据后），同步本地 state
  useEffect(() => {
    setLocalProjects(projects);

    const savedId = localStorage.getItem('contour:lastProjectId');
    const target = savedId
      ? projects.find((p) => p.projectId === savedId)
      : undefined;

    if (target) {
      setSelectedProject(target);
      setLocalFlows(target.flows);
    } else if (projects.length > 0) {
      setSelectedProject(projects[0]);
      setLocalFlows(projects[0].flows);
    }
  }, [projects]);

  const handleSelectProject = (project: ProjectData) => {
    localStorage.setItem('contour:lastProjectId', project.projectId);
    setSelectedProject(project);
    setLocalFlows(project.flows);
    setShowNewFlow(false);
    setNewFlowTitle('');
  };

  const handleAddProject = async () => {
    if (!newProjectTitle.trim()) return;
    const newId = `PRJ_${String(localProjects.length + 1).padStart(3, '0')}`;

    try {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: newId,
          title: newProjectTitle.trim(),
          researchGoal: newProjectGoal.trim() || '待补充研究目标',
        }),
      });
      const result = await res.json();
      if (!result.success) {
        console.error('创建项目失败:', result.error);
        return;
      }
    } catch (err) {
      console.error('创建项目请求失败:', err);
      return;
    }

    setNewProjectTitle('');
    setNewProjectGoal('');
    setShowNewProject(false);
    onRefresh();
  };

  const handleAddFlow = async () => {
    if (!newFlowTitle.trim()) return;
    const newId = `F${String(localFlows.length + 1).padStart(3, '0')}`;

    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.projectId,
          flowId: newId,
          title: newFlowTitle.trim(),
          type: 'general',
          parentFlows: localFlows.length > 0 ? [localFlows[localFlows.length - 1].flowId] : [],
        }),
      });
      const result = await res.json();
      if (!result.success) {
        console.error('创建 Flow 失败:', result.error);
        return;
      }
    } catch (err) {
      console.error('创建 Flow 请求失败:', err);
      return;
    }

    setNewFlowTitle('');
    setShowNewFlow(false);
    onRefresh();
  };

  const handleAddDoc = async () => {
    if (!newDocTitle.trim()) return;
    const newId = `doc_${Date.now()}`;

    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.projectId,
          docId: newId,
          title: newDocTitle.trim(),
          type: newDocType,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        console.error('创建文档失败:', result.error);
        return;
      }
    } catch (err) {
      console.error('创建文档请求失败:', err);
      return;
    }

    setNewDocTitle('');
    setNewDocType('background');
    setShowNewDoc(false);
    onRefresh();
  };

  const handleDeleteProject = async (projectId: string, title: string) => {
    if (!confirm(`确定要删除项目 "${title}" 吗？此操作将删除项目下的所有 Flow、文档和数据，不可撤销。`)) return;
    try {
      const res = await fetch(`/api/project/${projectId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) {
        alert(`删除项目失败: ${result.error}`);
        return;
      }
    } catch (err) {
      alert(`删除项目请求失败: ${(err as Error).message}`);
      return;
    }
    onRefresh();
  };

  const handleDeleteFlow = async (flowId: string, title: string) => {
    if (!confirm(`确定要删除 Flow "${title}" 吗？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/flows/${flowId}?projectId=${selectedProject.projectId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) {
        alert(`删除 Flow 失败: ${result.error}`);
        return;
      }
    } catch (err) {
      alert(`删除 Flow 请求失败: ${(err as Error).message}`);
      return;
    }
    onRefresh();
  };

  const handleDeleteDoc = async (docId: string, title: string) => {
    if (!confirm(`确定要删除文档 "${title}" 吗？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/docs/${docId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) {
        alert(`删除文档失败: ${result.error}`);
        return;
      }
    } catch (err) {
      alert(`删除文档请求失败: ${(err as Error).message}`);
      return;
    }
    onRefresh();
  };

  if (!selectedProject) {
    return (
      <div className="dashboard-page">
        <p>暂无项目</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Contour 科研认知工作台</p>
          <h1>Projects</h1>
        </div>
        <div className="dashboard-meta">
          <span>共 {localProjects.length} 个研究项目</span>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="project-list-panel">
          <div className="panel-card-header">
            <div className="panel-icon">
              <FolderOpen size={18} />
            </div>
            <div>
              <p className="eyebrow">Projects</p>
              <h3>My Projects</h3>
            </div>
          </div>

          <div className="project-list">
            {localProjects.map((project) => (
              <button
                className={
                  project.projectId === selectedProject.projectId
                    ? 'project-card project-card-active'
                    : 'project-card'
                }
                key={project.projectId}
                onClick={() => handleSelectProject(project)}
                type="button"
              >
                <div className="project-card-header">
                  <h4>{project.title}</h4>
                  <div className="project-card-actions">
                    <span className="project-id">{project.projectId}</span>
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.projectId, project.title);
                      }}
                      title="删除项目"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="project-goal">{project.researchGoal}</p>
                <div className="project-stats">
                  <span>
                    <FlaskConical size={14} />
                    {project.flows.length} Flows
                  </span>
                  <span>
                    <Layers size={14} />
                    {project.claims.length} Claims
                  </span>
                </div>
              </button>
            ))}

            {showNewProject ? (
              <div className="new-project-form">
                <input
                  autoFocus
                  className="new-section-input"
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddProject();
                    if (e.key === 'Escape') setShowNewProject(false);
                  }}
                  placeholder="项目名称"
                  type="text"
                  value={newProjectTitle}
                />
                <textarea
                  className="new-project-goal-input"
                  onChange={(e) => setNewProjectGoal(e.target.value)}
                  placeholder="Research goal (optional)"
                  rows={2}
                  value={newProjectGoal}
                />
                <div className="new-section-actions">
                  <button className="edit-btn edit-btn-save" onClick={handleAddProject} type="button">
                    创建
                  </button>
                  <button className="edit-btn edit-btn-cancel" onClick={() => setShowNewProject(false)} type="button">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button className="new-section-trigger" onClick={() => setShowNewProject(true)} type="button">
                <Plus size={14} />
                New Project
              </button>
            )}
          </div>
        </aside>

        <section className="project-contour-panel">
          <div className="contour-hero">
            <div className="contour-hero-copy">
              <p className="eyebrow">{selectedProject.projectId}</p>
              <h2>{selectedProject.title}</h2>
              <p>{selectedProject.researchGoal}</p>
            </div>
            <div className="contour-hero-stats">
              <div className="stat-card">
                <span>{localFlows.length}</span>
                <p>Flows</p>
              </div>
              <div className="stat-card">
                <span>{selectedProject.docs.length}</span>
                <p>Background</p>
              </div>
              <div className="stat-card">
                <span>{selectedProject.claims.length}</span>
                <p>Linked Claims</p>
              </div>
            </div>
          </div>

          <div className="section-header">
            <div>
              <p className="eyebrow">Project Contour</p>
              <h2>研究推进轮廓</h2>
            </div>
            <div className="path-hint">
              <Map size={18} />
              <span>当前显示简单的父流链式关系</span>
            </div>
          </div>

          <div className="path-strip">
            {localFlows.map((flow, index) => (
              <div className="path-step" key={flow.flowId}>
                <div className="path-token">
                  <strong>{flow.flowId}</strong>
                  <span>{flow.title}</span>
                </div>
                {index < localFlows.length - 1 ? <MoveRight className="path-arrow" size={18} /> : null}
              </div>
            ))}
          </div>

          <div className="flow-grid">
            {localFlows.map((flow) => (
              <FlowCard
                flow={flow}
                key={flow.flowId}
                onDelete={() => handleDeleteFlow(flow.flowId, flow.title)}
                projectId={selectedProject.projectId}
              />
            ))}

            {showNewFlow ? (
              <div className="flow-card new-flow-card">
                <div className="panel-card-header">
                  <div className="panel-icon">
                    <Plus size={18} />
                  </div>
                  <div>
                    <p className="eyebrow">New</p>
                    <h3>New Flow</h3>
                  </div>
                </div>
                <div className="new-flow-form">
                  <input
                    autoFocus
                    className="new-section-input"
                    onChange={(e) => setNewFlowTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddFlow();
                      if (e.key === 'Escape') setShowNewFlow(false);
                    }}
                    placeholder="Flow title"
                    type="text"
                    value={newFlowTitle}
                  />
                  <div className="new-section-actions">
                    <button className="edit-btn edit-btn-save" onClick={handleAddFlow} type="button">
                      创建
                    </button>
                    <button className="edit-btn edit-btn-cancel" onClick={() => setShowNewFlow(false)} type="button">
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="flow-card new-flow-trigger" onClick={() => setShowNewFlow(true)} type="button">
                <div className="panel-icon">
                  <Plus size={24} />
                </div>
                <h3>New Flow</h3>
                <p className="muted">在当前项目后添加新的研究推进单元</p>
              </button>
            )}
          </div>

          <div className="section-header">
            <div>
              <p className="eyebrow">Background</p>
              <h2>建议优先阅读的项目文档</h2>
            </div>
          </div>

          <div className="doc-grid">
            {selectedProject.docs.map((doc) => (
              <Link className="doc-card" key={doc.id} to={`/project/${selectedProject.projectId}/docs/${doc.id}`}>
                <div className="doc-card-header">
                  <div className="doc-card-type">
                    <FolderOpen size={18} />
                    <span>{doc.type.replace('_', ' ')}</span>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteDoc(doc.id, doc.title);
                    }}
                    title="删除文档"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <h3>{doc.title}</h3>
                <p>{doc.summary}</p>
              </Link>
            ))}

            {showNewDoc ? (
              <div className="doc-card new-doc-card">
                <div className="doc-card-header">
                  <Plus size={18} />
                  <span>New</span>
                </div>
                <div className="new-doc-form">
                  <input
                    autoFocus
                    className="new-section-input"
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddDoc();
                      if (e.key === 'Escape') setShowNewDoc(false);
                    }}
                    placeholder="文档标题"
                    type="text"
                    value={newDocTitle}
                  />
                  <select
                    className="new-section-input"
                    onChange={(e) => setNewDocType(e.target.value)}
                    value={newDocType}
                  >
                    <option value="background">Background</option>
                    <option value="project_overview">Project Overview</option>
                    <option value="question_set">Question Set</option>
                    <option value="glossary">Glossary</option>
                  </select>
                  <div className="new-section-actions">
                    <button className="edit-btn edit-btn-save" onClick={handleAddDoc} type="button">
                      创建
                    </button>
                    <button className="edit-btn edit-btn-cancel" onClick={() => setShowNewDoc(false)} type="button">
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="doc-card new-doc-trigger" onClick={() => setShowNewDoc(true)} type="button">
                <div className="doc-card-header">
                  <Plus size={18} />
                  <span>New</span>
                </div>
                <h3>New Document</h3>
                <p className="muted">添加新的背景文档</p>
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
