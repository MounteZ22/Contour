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
      <div className="p-8">
        <p className="text-on-surface-variant font-mono text-sm">暂无项目</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 p-8 bg-background min-h-screen">
      <header className="pb-3 border-b border-outline-variant">
        <h1 className="text-3xl font-bold text-on-background font-headline">Projects</h1>
        <p className="mt-1 text-sm text-on-surface-variant font-mono">共 {localProjects.length} 个研究项目</p>
      </header>

      <div className="grid grid-cols-[380px_1fr] gap-8 max-lg:grid-cols-1">
        {/* 左侧项目列表 */}
        <aside className="border border-outline-variant bg-surface-container rounded-lg p-5 shadow-sm self-start">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <FolderOpen size={16} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">Projects</p>
              <h3 className="text-base font-semibold text-on-surface font-headline">My Projects</h3>
            </div>
          </div>

          <div className="grid gap-2 mt-4">
            {localProjects.map((project) => (
              <button
                className={`w-full text-left border rounded-lg p-3 cursor-pointer transition-all ${
                  project.projectId === selectedProject.projectId
                    ? 'border-primary/25 bg-primary-container/8'
                    : 'border-transparent hover:border-outline-variant hover:bg-surface-container-high'
                }`}
                key={project.projectId}
                onClick={() => handleSelectProject(project)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium text-on-surface">{project.title}</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-primary font-mono">{project.projectId}</span>
                    <button
                      className="w-6 h-6 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors hover:bg-error/15 hover:border-error/25 hover:text-error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.projectId, project.title);
                      }}
                      title="删除项目"
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-on-surface-variant line-clamp-2">{project.researchGoal}</p>
                <div className="flex gap-3 mt-2 text-xs text-on-surface-variant font-mono">
                  <span className="inline-flex items-center gap-1">
                    <FlaskConical size={12} />
                    {project.flows.length} Flows
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers size={12} />
                    {project.claims.length} Claims
                  </span>
                </div>
              </button>
            ))}

            {showNewProject ? (
              <div className="grid gap-2 p-3 border border-primary/20 rounded-lg bg-primary-container/5">
                <input
                  autoFocus
                  className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono"
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
                  className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 resize-y font-mono"
                  onChange={(e) => setNewProjectGoal(e.target.value)}
                  placeholder="Research goal (optional)"
                  rows={2}
                  value={newProjectGoal}
                />
                <div className="flex gap-2">
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono"
                    onClick={handleAddProject}
                    type="button"
                  >
                    创建
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono"
                    onClick={() => setShowNewProject(false)}
                    type="button"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="w-full text-left border border-dashed border-outline-variant rounded-lg p-3 bg-transparent text-on-surface-variant inline-flex items-center gap-2 cursor-pointer hover:border-primary/30 hover:text-primary hover:bg-surface-container-low transition-all font-mono text-xs"
                onClick={() => setShowNewProject(true)}
                type="button"
              >
                <Plus size={14} />
                New Project
              </button>
            )}
          </div>
        </aside>

        {/* 右侧主内容 */}
        <section className="grid gap-8">
          {/* Hero 卡片 */}
          <div className="border border-outline-variant bg-surface-container rounded-xl p-6 grid grid-cols-[1.5fr_0.8fr] gap-6 max-lg:grid-cols-1">
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">{selectedProject.projectId}</p>
              <h2 className="text-xl font-bold text-on-background font-headline">{selectedProject.title}</h2>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">{selectedProject.researchGoal}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-outline-variant rounded-lg p-4 text-center bg-surface-container-low">
                <span className="block text-2xl font-bold text-tertiary-container font-headline">{localFlows.length}</span>
                <span className="block mt-1 text-xs text-on-surface-variant font-mono">Flows</span>
              </div>
              <div className="border border-outline-variant rounded-lg p-4 text-center bg-surface-container-low">
                <span className="block text-2xl font-bold text-tertiary-container font-headline">{selectedProject.docs.length}</span>
                <span className="block mt-1 text-xs text-on-surface-variant font-mono">Background</span>
              </div>
              <div className="border border-outline-variant rounded-lg p-4 text-center bg-surface-container-low">
                <span className="block text-2xl font-bold text-tertiary-container font-headline">{selectedProject.claims.length}</span>
                <span className="block mt-1 text-xs text-on-surface-variant font-mono">Linked Claims</span>
              </div>
            </div>
          </div>

          {/* Flow 链 */}
          <div>
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Project Contour</p>
                <h2 className="text-xl font-bold text-on-background font-headline">研究推进轮廓</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-on-surface-variant font-mono">
                <Map size={14} />
                <span>当前显示简单的父流链式关系</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {localFlows.map((flow, index) => (
                <div className="flex items-center gap-2" key={flow.flowId}>
                  <div className="rounded-full px-4 py-2.5 bg-surface-container-high border border-outline-variant flex items-center gap-2 text-sm">
                    <span className="text-primary font-mono text-xs">{flow.flowId}</span>
                    <span className="text-on-surface-variant text-sm">{flow.title}</span>
                  </div>
                  {index < localFlows.length - 1 ? <MoveRight className="text-primary" size={16} /> : null}
                </div>
              ))}
            </div>
          </div>

          {/* Flow 卡片网格 */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {localFlows.map((flow) => (
              <FlowCard
                flow={flow}
                key={flow.flowId}
                onDelete={() => handleDeleteFlow(flow.flowId, flow.title)}
                projectId={selectedProject.projectId}
              />
            ))}

            {showNewFlow ? (
              <div className="border border-outline-variant bg-surface-container rounded-xl p-5 block">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
                    <Plus size={16} />
                  </div>
                  <div>
                    <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">New</p>
                    <h3 className="text-base font-semibold text-on-surface font-headline">New Flow</h3>
                  </div>
                </div>
                <div className="grid gap-3">
                  <input
                    autoFocus
                    className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono"
                    onChange={(e) => setNewFlowTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddFlow();
                      if (e.key === 'Escape') setShowNewFlow(false);
                    }}
                    placeholder="Flow title"
                    type="text"
                    value={newFlowTitle}
                  />
                  <div className="flex gap-2">
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono"
                      onClick={handleAddFlow}
                      type="button"
                    >
                      创建
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono"
                      onClick={() => setShowNewFlow(false)}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                className="flex flex-col items-center justify-center gap-2.5 min-h-[160px] border border-dashed border-outline-variant bg-transparent cursor-pointer hover:border-primary/30 hover:bg-primary-container/5 rounded-xl p-5 transition-all"
                onClick={() => setShowNewFlow(true)}
                type="button"
              >
                <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
                  <Plus size={20} />
                </div>
                <h3 className="text-base font-semibold text-primary font-headline">New Flow</h3>
                <p className="text-xs text-on-surface-variant font-mono">在当前项目后添加新的研究推进单元</p>
              </button>
            )}
          </div>

          {/* 文档区域 */}
          <div>
            <div className="mb-4">
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Background</p>
              <h2 className="text-xl font-bold text-on-background font-headline">建议优先阅读的项目文档</h2>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
              {selectedProject.docs.map((doc) => (
                <Link
                  className="block border border-outline-variant bg-surface-container rounded-xl p-5 transition-all hover:border-primary/25"
                  key={doc.id}
                  to={`/project/${selectedProject.projectId}/docs/${doc.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="inline-flex items-center gap-2 text-on-surface-variant">
                      <FolderOpen size={16} />
                      <span className="text-xs font-mono">{doc.type.replace('_', ' ')}</span>
                    </div>
                    <button
                      className="w-6 h-6 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors hover:bg-error/15 hover:border-error/25 hover:text-error"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteDoc(doc.id, doc.title);
                      }}
                      title="删除文档"
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <h3 className="text-base font-semibold text-on-surface font-headline mb-1">{doc.title}</h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2">{doc.summary}</p>
                </Link>
              ))}

              {showNewDoc ? (
                <div className="border border-outline-variant bg-surface-container rounded-xl p-5 block">
                  <div className="flex items-center gap-2 mb-3">
                    <Plus size={16} className="text-primary" />
                    <span className="text-xs text-primary font-semibold font-mono">New</span>
                  </div>
                  <div className="grid gap-3">
                    <input
                      autoFocus
                      className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono"
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
                      className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:border-primary/40 font-mono"
                      onChange={(e) => setNewDocType(e.target.value)}
                      value={newDocType}
                    >
                      <option value="background">Background</option>
                      <option value="project_overview">Project Overview</option>
                      <option value="question_set">Question Set</option>
                      <option value="glossary">Glossary</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono"
                        onClick={handleAddDoc}
                        type="button"
                      >
                        创建
                      </button>
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono"
                        onClick={() => setShowNewDoc(false)}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  className="flex flex-col items-center justify-center gap-2.5 min-h-[140px] border border-dashed border-outline-variant bg-transparent cursor-pointer hover:border-primary/30 hover:bg-primary-container/5 rounded-xl p-5 transition-all text-on-surface-variant"
                  onClick={() => setShowNewDoc(true)}
                  type="button"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <Plus size={16} />
                    <span className="text-xs font-semibold font-mono">New</span>
                  </div>
                  <h3 className="text-base font-semibold text-primary font-headline">New Document</h3>
                  <p className="text-xs text-on-surface-variant font-mono">添加新的背景文档</p>
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
