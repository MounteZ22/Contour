import { FlaskConical, FolderOpen, Layers, Map, Plus, Settings, Trash2 } from 'lucide-react';
import { showToast } from '../components/Toast';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AIContextItem } from '../components/AIWorkbenchPanel';
import { BottomChatPanel } from '../components/BottomChatPanel';
import { ContextActionBar } from '../components/ContextActionBar';
import { ContourMap } from '../components/ContourMap';
import { Card } from '../components/ui/card';
import { Button, buttonVariants } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { cn } from '@/lib/utils';
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
        <p className="text-muted-foreground font-mono text-sm">暂无项目</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 p-8 bg-background min-h-screen pb-32">
      <header className="pb-3 border-b border-border flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-headline">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground font-mono">共 {localProjects.length} 个研究项目</p>
        </div>
        <Link
          to="/settings"
          title="设置"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Settings size={16} />
          <span className="hidden sm:inline">设置</span>
        </Link>
      </header>

      <div className="grid grid-cols-[380px_1fr] gap-8 max-lg:grid-cols-1">
        {/* 左侧项目列表 */}
        <Card className="p-5 self-start">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary/10 text-primary">
              <FolderOpen size={16} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">Projects</p>
              <h3 className="text-base font-semibold text-foreground font-headline">My Projects</h3>
            </div>
          </div>

          <div className="grid gap-2 mt-4">
            {localProjects.map((project) => (
              <button
                className={`w-full text-left rounded-lg p-3 cursor-pointer transition-all ${
                  project.projectId === selectedProject.projectId
                    ? 'bg-primary/10 border border-primary/20'
                    : 'border border-transparent hover:bg-accent'
                }`}
                key={project.projectId}
                onClick={() => handleSelectProject(project)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium text-foreground">{project.title}</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-primary font-mono">{project.projectId}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.projectId, project.title);
                      }}
                      title="删除项目"
                      type="button"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{project.researchGoal}</p>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground font-mono">
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
              <div className="grid gap-2 p-3 border border-primary/20 rounded-lg bg-primary/5">
                <Input
                  autoFocus
                  className="font-mono"
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddProject();
                    if (e.key === 'Escape') setShowNewProject(false);
                  }}
                  placeholder="项目名称"
                  type="text"
                  value={newProjectTitle}
                />
                <Textarea
                  className="font-mono resize-y"
                  onChange={(e) => setNewProjectGoal(e.target.value)}
                  placeholder="Research goal (optional)"
                  rows={2}
                  value={newProjectGoal}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddProject} type="button">
                    创建
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setShowNewProject(false)} type="button">
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-dashed text-muted-foreground hover:text-primary hover:border-primary/30 font-mono text-xs"
                onClick={() => setShowNewProject(true)}
                type="button"
              >
                <Plus size={14} />
                New Project
              </Button>
            )}
          </div>
        </Card>

        {/* 右侧主内容 */}
        <section className="grid gap-8">
          {/* Hero 卡片 */}
          <Card className="p-6 grid grid-cols-[1.5fr_0.8fr] gap-6 max-lg:grid-cols-1">
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">{selectedProject.projectId}</p>
              <h2 className="text-xl font-bold text-foreground font-headline">{selectedProject.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{selectedProject.researchGoal}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-4 text-center bg-muted">
                <span className="block text-2xl font-bold text-primary font-headline">{localFlows.length}</span>
                <span className="block mt-1 text-xs text-muted-foreground font-mono">Flows</span>
              </div>
              <div className="rounded-lg p-4 text-center bg-muted">
                <span className="block text-2xl font-bold text-primary font-headline">{selectedProject.docs.length}</span>
                <span className="block mt-1 text-xs text-muted-foreground font-mono">Background</span>
              </div>
              <div className="rounded-lg p-4 text-center bg-muted">
                <span className="block text-2xl font-bold text-primary font-headline">{selectedProject.claims.length}</span>
                <span className="block mt-1 text-xs text-muted-foreground font-mono">Linked Claims</span>
              </div>
            </div>
          </Card>

          {/* Flow 网络画布 */}
          <div>
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Project Contour</p>
                <h2 className="text-xl font-bold text-foreground font-headline">研究推进轮廓</h2>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={contextSelectMode ? 'secondary' : 'outline'}
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={toggleContextSelectMode}
                  title="开启后可多选 Flow 和文档，作为 AI 对话上下文"
                  type="button"
                >
                  <span className={`w-2 h-2 rounded-full ${contextSelectMode ? 'bg-primary' : 'bg-muted-foreground'}`} />
                  {contextSelectMode ? '多选模式' : '单选模式'}
                </Button>
                {!contextSelectMode && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
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
              <h2 className="text-xl font-bold text-foreground font-headline">建议优先阅读的项目文档</h2>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
              {selectedProject.docs.map((doc) => {
                const isDocSelected = selectedDocs.has(doc.id);
                const cardContent = (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="inline-flex items-center gap-2 text-muted-foreground">
                        <FolderOpen size={16} />
                        <span className="text-xs font-mono">{doc.type.replace('_', ' ')}</span>
                      </div>
                      {!contextSelectMode && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteDoc(doc.id, doc.title);
                          }}
                          title="删除文档"
                          type="button"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                      {contextSelectMode && isDocSelected && (
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-foreground font-headline mb-1">{doc.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{doc.summary}</p>
                  </>
                );

                return contextSelectMode ? (
                  <Card
                    className={`p-5 transition-all cursor-pointer ${
                      isDocSelected
                        ? 'border-primary/50 bg-primary/5'
                        : 'hover:border-primary/25 hover:shadow-md'
                    }`}
                    key={doc.id}
                    onClick={() => toggleDocSelection(doc.id)}
                  >
                    {cardContent}
                  </Card>
                ) : (
                  <Card className="transition-all hover:border-primary/25 hover:shadow-md" key={doc.id}>
                    <Link
                      className="block p-5"
                      to={`/project/${selectedProject.projectId}/docs/${doc.id}`}
                    >
                      {cardContent}
                    </Link>
                  </Card>
                );
              })}

              {showNewDoc ? (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Plus size={16} className="text-primary" />
                    <span className="text-xs text-primary font-semibold font-mono">New</span>
                  </div>
                  <div className="grid gap-3">
                    <Input
                      autoFocus
                      className="font-mono"
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
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                      onChange={(e) => setNewDocType(e.target.value)}
                      value={newDocType}
                    >
                      <option value="background">Background</option>
                      <option value="project_overview">Project Overview</option>
                      <option value="question_set">Question Set</option>
                      <option value="glossary">Glossary</option>
                    </select>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddDoc} type="button">
                        创建
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setShowNewDoc(false)} type="button">
                        取消
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Button
                  variant="outline"
                  className="flex flex-col items-center justify-center gap-2.5 min-h-[140px] border-dashed rounded-xl p-5 text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5"
                  onClick={() => setShowNewDoc(true)}
                  type="button"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <Plus size={16} />
                    <span className="text-xs font-semibold font-mono">New</span>
                  </div>
                  <h3 className="text-base font-semibold text-primary font-headline">New Document</h3>
                  <p className="text-xs text-muted-foreground font-mono">添加新的背景文档</p>
                </Button>
              )}
            </div>
          </div>

          {/* AI 上下文选择器 — 底部浮动操作栏 */}
          {contextSelectMode && (
            <ContextActionBar
              onClear={clearAllSelections}
              onDiscuss={() => {}}
              selectedDocCount={selectedDocs.size}
              selectedFlowCount={selectedFlows.size}
            />
          )}
        </section>
      </div>

      {/* 底部 AI 聊天面板（始终可见） */}
      <BottomChatPanel
        initialContext={contextItems.length > 0 ? contextItems : undefined}
        onClearContext={() => {
          clearAllSelections();
        }}
      />
    </div>
  );
}
