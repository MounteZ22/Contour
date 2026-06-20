import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { FolderOpen, Map, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { showToast } from '../components/Toast';
import { ContextActionBar } from '../components/ContextActionBar';
import { ContourMap } from '../components/ContourMap';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { chatContextItemsAtom } from '../state/chat';
import { useAgentSessions } from '../hooks/useAgentSessions';
import type { ShellOutletContext } from '../components/shell/ShellLayout';
import type { AIContextItem } from '../types';

export function ContourView() {
  const navigate = useNavigate();
  const { onRefresh, project, projects } = useOutletContext<ShellOutletContext>();
  const { createSession } = useAgentSessions();
  const setChatContextItems = useSetAtom(chatContextItemsAtom);

  const flows = project?.flows ?? [];
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState('background');

  const [contextSelectMode, setContextSelectMode] = useState(false);
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setContextSelectMode(false);
    setSelectedFlows(new Set());
    setSelectedDocs(new Set());
  }, [project?.projectId]);

  if (!project) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FolderOpen size={32} className="mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold font-headline">暂无项目</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            请先在左侧栏创建一个项目，Contour 视图会在这里显示研究路径。
          </p>
        </div>
      </div>
    );
  }

  const handleCreateFlowFromNode = async (parentFlowId: string, title: string) => {
    const newId = `F${crypto.randomUUID().slice(0, 8)}`;

    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
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
          projectId: project.projectId,
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

  const handleDeleteFlow = async (flowId: string, title: string) => {
    if (!confirm(`确定要删除 Flow "${title}" 吗？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/flows/${flowId}?projectId=${project.projectId}`, { method: 'DELETE' });
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

  const toggleContextSelectMode = () => {
    setContextSelectMode((prev) => {
      const next = !prev;
      if (next) {
        setSelectedDocs(new Set(project.docs.map((doc) => doc.id)));
      } else {
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
    setSelectedDocs(new Set(project.docs.map((doc) => doc.id)));
  };

  const contextItems: AIContextItem[] = [
    ...Array.from(selectedFlows).map((id) => {
      const flow = flows.find((item) => item.flowId === id);
      return { id, title: flow?.title ?? id, type: 'flow' as const };
    }),
    ...Array.from(selectedDocs).map((id) => {
      const doc = project.docs.find((item) => item.id === id);
      return { id, title: doc?.title ?? id, type: 'doc' as const };
    }),
  ];

  const handleDiscuss = () => {
    if (contextItems.length === 0) {
      showToast('请至少选择一个 Flow 或文档', 'error');
      return;
    }
    setChatContextItems(contextItems);
    const session = createSession(contextItems);
    navigate(`/agent/${session.id}`);
  };

  return (
    <div className="h-full overflow-y-auto p-8 pb-28">
      <header className="pb-4 border-b border-border flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">
            {projects.length} Projects · 当前项目
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground font-headline">{project.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground leading-relaxed">{project.researchGoal}</p>
        </div>
        <Button
          variant={contextSelectMode ? 'secondary' : 'outline'}
          size="sm"
          className="rounded-full text-xs"
          onClick={toggleContextSelectMode}
          title="开启后可多选 Flow 和文档，作为 Agent 会话上下文"
          type="button"
        >
          <span className={`w-2 h-2 rounded-full ${contextSelectMode ? 'bg-primary' : 'bg-muted-foreground'}`} />
          {contextSelectMode ? '多选模式' : '单选模式'}
        </Button>
      </header>

      <section className="grid gap-8 mt-8">
        <Card className="p-6 grid grid-cols-[1.4fr_0.9fr] gap-6 max-lg:grid-cols-1">
          <div>
            <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">{project.projectId}</p>
            <h2 className="text-xl font-bold text-foreground font-headline">研究认知资产</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Contour 视图用于维护 Flow、背景文档和论断之间的结构关系；讨论和生成工作统一进入 Agent 会话。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg p-4 text-center bg-muted">
              <span className="block text-2xl font-bold text-primary font-headline">{flows.length}</span>
              <span className="block mt-1 text-xs text-muted-foreground font-mono">Flows</span>
            </div>
            <div className="rounded-lg p-4 text-center bg-muted">
              <span className="block text-2xl font-bold text-primary font-headline">{project.docs.length}</span>
              <span className="block mt-1 text-xs text-muted-foreground font-mono">Background</span>
            </div>
            <div className="rounded-lg p-4 text-center bg-muted">
              <span className="block text-2xl font-bold text-primary font-headline">{project.claims.length}</span>
              <span className="block mt-1 text-xs text-muted-foreground font-mono">Claims</span>
            </div>
          </div>
        </Card>

        <div>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Project Contour</p>
              <h2 className="text-xl font-bold text-foreground font-headline">研究推进轮廓</h2>
            </div>
            {!contextSelectMode && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Map size={14} />
                <span>点击节点进入 Flow · 拖拽调整位置 · 节点旁 + 创建新 Flow</span>
              </div>
            )}
          </div>

          <ContourMap
            contextSelectMode={contextSelectMode}
            flows={flows}
            onCreateFlow={handleCreateFlowFromNode}
            onDeleteFlow={handleDeleteFlow}
            onToggleFlowSelection={toggleFlowSelection}
            projectId={project.projectId}
            selectedFlowIds={selectedFlows}
          />
        </div>

        <div>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-1">Background</p>
              <h2 className="text-xl font-bold text-foreground font-headline">项目背景文档</h2>
            </div>
            {contextSelectMode && (
              <Button size="sm" onClick={handleDiscuss} type="button">
                <MessageCircle size={14} />
                与 Agent 讨论
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {project.docs.map((doc) => {
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
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
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
                  <Link className="block p-5" to={`/project/${project.projectId}/docs/${doc.id}`}>
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
                    onChange={(event) => setNewDocTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleAddDoc();
                      if (event.key === 'Escape') setShowNewDoc(false);
                    }}
                    placeholder="文档标题"
                    value={newDocTitle}
                  />
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                    onChange={(event) => setNewDocType(event.target.value)}
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
                    <Button variant="ghost" size="sm" onClick={() => setShowNewDoc(false)} type="button">
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
      </section>

      {contextSelectMode && (
        <ContextActionBar
          onClear={clearAllSelections}
          onDiscuss={handleDiscuss}
          selectedDocCount={selectedDocs.size}
          selectedFlowCount={selectedFlows.size}
        />
      )}
    </div>
  );
}
