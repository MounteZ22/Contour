import { FlaskConical, FolderOpen, Layers, Map, Plus, Settings, Trash2 } from 'lucide-react';
import { showToast } from '../components/Toast';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AIWorkbenchPanel } from '../components/AIWorkbenchPanel';
import type { AIContextItem } from '../components/AIWorkbenchPanel';
import { ContextActionBar } from '../components/ContextActionBar';
import { ContourMap } from '../components/ContourMap';
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

  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState('background');

  // AI 上下文选择器状态
  const [contextSelectMode, setContextSelectMode] = useState(false);
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

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
    // 切换项目时自动退出多选模式
    if (contextSelectMode) {
      setContextSelectMode(false);
      setSelectedFlows(new Set());
      setSelectedDocs(new Set());
    }
  };

  const handleAddProject = async () => {
    if (!newProjectTitle.trim()) return;
    const newId = `PRJ_${crypto.randomUUID().slice(0, 8)}`;

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
        showToast(`创建项目失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`创建项目请求失败：${(err as Error).message}`, 'error');
      return;
    }

    setNewProjectTitle('');
    setNewProjectGoal('');
    setShowNewProject(false);
    onRefresh();
  };

  const handleCreateFlowFromNode = async (parentFlowId: string, title: string) => {
    const newId = `F${crypto.randomUUID().slice(0, 8)}`;

    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.projectId,
          flowId: newId,
          title,
          type: 'general',
          parentFlows: [parentFlowId],
        }),
      });
      const result = await res.json();
      if (!result.success) {
        showToast(`创建 Flow 失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`创建 Flow 请求失败：${(err as Error).message}`, 'error');
      return;
    }

    onRefresh();
  };

  const handleAddDoc = async () => {
    if (!newDocTitle.trim()) return;
    const newId = `doc_${crypto.randomUUID().slice(0, 8)}`;

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
        showToast(`创建文档失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`创建文档请求失败：${(err as Error).message}`, 'error');
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
        showToast(`删除项目失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`删除项目请求失败：${(err as Error).message}`, 'error');
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
        showToast(`删除 Flow 失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`删除 Flow 请求失败：${(err as Error).message}`, 'error');
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
        showToast(`删除文档失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`删除文档请求失败：${(err as Error).message}`, 'error');
      return;
    }
    onRefresh();
  };

  // --- AI 上下文选择器 handlers ---
  const toggleContextSelectMode = () => {
    setContextSelectMode((prev) => {
      const next = !prev;
      if (next) {
        // 启动时自动全选所有文档
        setSelectedDocs(new Set(selectedProject.docs.map((d) => d.id)));
      } else {
        // 关闭时清空
        setSelectedFlows(new Set());
        setSelectedDocs(new Set());
      }
      return next;
    });
  };

  const toggleFlowSelection = (flowId: string) => {
    setSelectedFlows((prev) => {
      const next = new Set(prev);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const clearAllSelections = () => {
    setSelectedFlows(new Set());
    setSelectedDocs(new Set(selectedProject.docs.map((d) => d.id)));
  };

  const handleDiscussWithAI = () => {
    setAiPanelOpen(true);
  };

  const handleClearContext = () => {
    clearAllSelections();
    setAiPanelOpen(false);
  };

  // 组装 AI Workbench 上下文数据
  const contextItems: AIContextItem[] = [
    ...Array.from(selectedFlows).map((id) => {
      const flow = localFlows.find((f) => f.flowId === id);
      return { id, title: flow?.title ?? id, type: 'flow' as const };
    }),
    ...Array.from(selectedDocs).map((id) => {
      const doc = selectedProject.docs.find((d) => d.id === id);
      return { id, title: doc?.title ?? id, type: 'doc' as const };
    }),
  ];

  if (!selectedProject) {
    return (
      <div className="p-8">
        <p className="text-on-surface-variant font-mono text-sm">暂无项目</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 p-8 bg-background min-h-screen">
      <header className="pb-3 border-b border-outline-variant flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-on-background font-headline">Projects</h1>
          <p className="mt-1 text-sm text-on-surface-variant font-mono">共 {localProjects.length} 个研究项目</p>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border border-outline-variant"
          title="设置"
        >
          <Settings size={16} />
          <span className="hidden sm:inline">设置</span>
        </Link>
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
        <section className={aiPanelOpen ? 'grid grid-cols-[1fr_340px] gap-8' : 'grid gap-8'}>
          <div className={aiPanelOpen ? 'grid gap-8' : undefined}>
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

          {/* Flow 网络画布 */}
          <div>
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Project Contour</p>
                <h2 className="text-xl font-bold text-on-background font-headline">研究推进轮廓</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer ${
                    contextSelectMode
                      ? 'bg-primary-container/30 border-primary/30 text-primary'
                      : 'bg-surface-container border-outline-variant text-on-surface-variant hover:border-primary/20'
                  }`}
                  onClick={toggleContextSelectMode}
                  title="开启后可多选 Flow 和文档，发送给 AI 讨论"
                  type="button"
                >
                  <span className={`w-2 h-2 rounded-full ${contextSelectMode ? 'bg-primary' : 'bg-outline-variant'}`} />
                  {contextSelectMode ? '多选模式' : '单选模式'}
                </button>
                {!contextSelectMode && (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant font-mono">
                    <Map size={14} />
                    <span>点击节点进入 Flow · 拖拽调整位置 · 节点旁 + 创建新 Flow</span>
                  </div>
                )}
              </div>
            </div>

            <ContourMap
              contextSelectMode={contextSelectMode}
              flows={localFlows}
              onCreateFlow={handleCreateFlowFromNode}
              onDeleteFlow={handleDeleteFlow}
              onToggleFlowSelection={toggleFlowSelection}
              projectId={selectedProject.projectId}
              selectedFlowIds={selectedFlows}
            />
          </div>

          {/* 文档区域 */}
          <div>
            <div className="mb-4">
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Background</p>
              <h2 className="text-xl font-bold text-on-background font-headline">建议优先阅读的项目文档</h2>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
              {selectedProject.docs.map((doc) => {
                const isDocSelected = selectedDocs.has(doc.id);
                const cardContent = (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="inline-flex items-center gap-2 text-on-surface-variant">
                        <FolderOpen size={16} />
                        <span className="text-xs font-mono">{doc.type.replace('_', ' ')}</span>
                      </div>
                      {!contextSelectMode && (
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
                      )}
                      {contextSelectMode && isDocSelected && (
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-on-surface font-headline mb-1">{doc.title}</h3>
                    <p className="text-xs text-on-surface-variant line-clamp-2">{doc.summary}</p>
                  </>
                );

                return contextSelectMode ? (
                  <div
                    className={`block border rounded-xl p-5 transition-all cursor-pointer ${
                      isDocSelected
                        ? 'border-primary/50 bg-primary-container/5'
                        : 'border-outline-variant bg-surface-container hover:border-primary/25'
                    }`}
                    key={doc.id}
                    onClick={() => toggleDocSelection(doc.id)}
                  >
                    {cardContent}
                  </div>
                ) : (
                  <Link
                    className="block border border-outline-variant bg-surface-container rounded-xl p-5 transition-all hover:border-primary/25"
                    key={doc.id}
                    to={`/project/${selectedProject.projectId}/docs/${doc.id}`}
                  >
                    {cardContent}
                  </Link>
                );
              })}

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

          {/* AI 上下文选择器 — 底部浮动操作栏 */}
          {contextSelectMode && (
            <ContextActionBar
              onClear={clearAllSelections}
              onDiscuss={handleDiscussWithAI}
              selectedDocCount={selectedDocs.size}
              selectedFlowCount={selectedFlows.size}
            />
          )}
          </div>
          {aiPanelOpen && (
            <AIWorkbenchPanel
              initialContext={contextItems}
              onClearContext={handleClearContext}
            />
          )}
        </section>
      </div>
    </div>
  );
}
