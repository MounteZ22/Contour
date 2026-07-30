import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { FolderOpen, LayoutGrid, Map, Plus, Shield, Trash2 } from 'lucide-react';
import { showToast } from '../components/Toast';
import { ContextActionBar } from '../components/ContextActionBar';
import { ContourMap, type ContourMapHandle } from '../components/ContourMap';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { CONFIDENCE_COLOR_MAP, CONFIDENCE_BG_MAP } from '../constants/claimColors';
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

  const [contextSelectMode, setContextSelectMode] = useState(false);
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [newClaimTitle, setNewClaimTitle] = useState('');

  const contourMapRef = useRef<ContourMapHandle>(null);

  useEffect(() => {
    setContextSelectMode(false);
    setSelectedFlows(new Set());
    setSelectedDocs(new Set());
    setSelectedClaims(new Set());
    setShowNewClaim(false);
    setNewClaimTitle('');
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
    // 直接用标题作为文件名，替换掉文件系统不安全的字符
    const docId = newDocTitle.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
          docId,
          title: newDocTitle.trim(),
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
    setShowNewDoc(false);
    onRefresh();
  };

  const handleAddClaim = async () => {
    if (!newClaimTitle.trim()) return;
    const newId = `CLM_${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
          claimId: newId,
          title: newClaimTitle.trim(),
        }),
      });
      const result = await res.json();
      if (!result.success) {
        showToast(`创建 Claim 失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`创建 Claim 请求失败：${(err as Error).message}`, 'error');
      return;
    }

    setNewClaimTitle('');
    setShowNewClaim(false);
    onRefresh();
  };

  const handleDeleteClaim = async (claimId: string, title: string) => {
    if (!confirm(`确定要删除 Claim "${title}" 吗？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/claims/${claimId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) {
        showToast(`删除 Claim 失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`删除 Claim 请求失败：${(err as Error).message}`, 'error');
      return;
    }
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
        setChatContextItems([]);
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

  const toggleClaimSelection = (claimId: string) => {
    setSelectedClaims((prev) => {
      const next = new Set(prev);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  };

  const clearAllSelections = () => {
    setSelectedFlows(new Set());
    setSelectedDocs(new Set(project.docs.map((doc) => doc.id)));
    setSelectedClaims(new Set());
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
    ...Array.from(selectedClaims).map((id) => {
      const claim = project.claims.find((item) => item.claimId === id);
      return { id, title: claim?.title ?? id, type: 'claim' as const };
    }),
  ];

  const handleDiscuss = () => {
    if (contextItems.length === 0) {
      showToast('请至少选择一个 Flow 或文档', 'error');
      return;
    }
    setChatContextItems(contextItems);
    const session = createSession(contextItems, project.projectId);
    navigate(`/agent/${session.id}`);
  };

  return (
    <div className="h-full overflow-y-auto p-8 pb-28">
      <header className="pb-5 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-heading-lg font-bold text-text-primary font-headline truncate">{project.title}</h1>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-caption font-mono text-accent-strong font-semibold">{flows.length} Flows</span>
              <span className="text-border">·</span>
              <span className="text-caption font-mono text-muted-foreground">{project.docs.length} Docs</span>
              <span className="text-border">·</span>
              <span className="text-caption font-mono text-muted-foreground">{project.claims.length} Claims</span>
            </div>
          </div>
          {project.researchGoal && (
            <p className="max-w-3xl text-sm text-muted-foreground leading-relaxed">{project.researchGoal}</p>
          )}
        </div>
        <Button
          variant={contextSelectMode ? 'secondary' : 'outline'}
          size="sm"
          className="rounded-full text-xs shrink-0"
          onClick={toggleContextSelectMode}
          title="开启后可多选 Flow 和文档，作为 Agent 会话上下文"
          type="button"
        >
          <span className={`w-2 h-2 rounded-full ${contextSelectMode ? 'bg-accent-strong' : 'bg-muted-foreground'}`} />
          {contextSelectMode ? '多选模式' : '单选模式'}
        </Button>
      </header>

      <section className="grid gap-8 mt-4">
        <div>
          <div className="flex items-end justify-between gap-4 mb-3">
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-1">Project Contour</p>
              <h2 className="text-xl font-bold text-text-primary font-headline">项目轮廓</h2>
            </div>
            {!contextSelectMode && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Map size={14} />
                <span>点击节点进入 Flow · 拖拽调整位置 · 节点旁 + 创建新 Flow</span>
              </div>
            )}
          </div>

          <ContourMap
            ref={contourMapRef}
            claims={project.claims}
            contextSelectMode={contextSelectMode}
            flows={flows}
            onCreateFlow={handleCreateFlowFromNode}
            onDeleteFlow={handleDeleteFlow}
            onToggleFlowSelection={toggleFlowSelection}
            projectId={project.projectId}
            selectedFlowIds={selectedFlows}
            onPositionSaved={onRefresh}
            onLayoutSaved={onRefresh}
          />
        </div>

        <div>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-1">Background</p>
              <h2 className="text-xl font-bold text-text-primary font-headline">背景文档</h2>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {project.docs.map((doc) => {
              const isDocSelected = selectedDocs.has(doc.id);
              const cardContent = (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                      <FolderOpen size={16} />
                      <span className="text-sm font-semibold text-text-primary font-headline">{doc.id}</span>
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
                      <div className="w-6 h-6 rounded-md bg-accent-subtle-bg flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-accent-strong" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{doc.summary}</p>
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {doc.tags.map((tag) => (
                        <span key={tag} className="text-caption font-mono px-1.5 py-0.5 rounded-sm bg-surface text-text-secondary border border-border/30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              );

              return contextSelectMode ? (
                <Card
                  className={`p-6 transition-all cursor-pointer ${
                    isDocSelected
                      ? 'border-accent-strong/50 bg-accent-subtle-bg'
                      : 'hover:border-accent-strong/25'
                  }`}
                  key={doc.id}
                  onClick={() => toggleDocSelection(doc.id)}
                >
                  {cardContent}
                </Card>
              ) : (
                <Card className="transition-all hover:border-accent-strong/25" key={doc.id}>
                  <Link className="block p-6" to={`/project/${project.projectId}/docs/${doc.id}`}>
                    {cardContent}
                  </Link>
                </Card>
              );
            })}

            {showNewDoc ? (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Plus size={16} className="text-accent-strong" />
                  <span className="text-caption text-accent-strong font-semibold font-mono">New</span>
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
                className="flex flex-col items-center justify-center gap-2.5 min-h-[140px] border-dashed rounded-xl p-6 text-muted-foreground hover:text-accent-strong hover:border-accent-strong/30"
                onClick={() => setShowNewDoc(true)}
                type="button"
              >
                <div className="flex items-center gap-2 text-accent-strong">
                  <Plus size={16} />
                  <span className="text-caption font-semibold font-mono">New</span>
                </div>
                <h3 className="text-base font-semibold text-accent-strong font-headline">New Document</h3>
                <p className="text-xs text-muted-foreground font-mono">添加新的背景文档</p>
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-1">Claims</p>
              <h2 className="text-xl font-bold text-text-primary font-headline">研究判断</h2>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {project.claims.map((claim) => {
              const isClaimSelected = selectedClaims.has(claim.claimId);
              const cc = CONFIDENCE_COLOR_MAP[claim.confidence] ?? '#6b7280';
              const cb = CONFIDENCE_BG_MAP[claim.confidence] ?? '#f3f4f6';

              const cardContent = (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                      <Shield size={16} />
                      <span className="text-xs font-mono">{claim.claimId}</span>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold font-mono"
                      style={{ backgroundColor: cb, color: cc, border: `1px solid ${cc}` }}
                    >
                      {claim.confidence}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-foreground font-headline mb-1">{claim.title}</h3>
                  {claim.tags && claim.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {claim.tags.map((tag) => (
                        <span key={tag} className="text-caption font-mono px-1.5 py-0.5 rounded-sm bg-surface text-text-secondary border border-border/30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              );

              return contextSelectMode ? (
                <Card
                  className={`p-6 transition-all cursor-pointer ${
                    isClaimSelected
                      ? 'border-accent-strong/50 bg-accent-subtle-bg'
                      : 'hover:border-accent-strong/25'
                  }`}
                  key={claim.claimId}
                  onClick={() => toggleClaimSelection(claim.claimId)}
                >
                  {cardContent}
                </Card>
              ) : (
                <Card className="transition-all hover:border-accent-strong/25" key={claim.claimId}>
                  <Link className="block p-6" to={`/project/${project.projectId}/claims/${claim.claimId}`}>
                    {cardContent}
                  </Link>
                </Card>
              );
            })}

            {showNewClaim ? (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Plus size={16} className="text-accent-strong" />
                  <span className="text-caption text-accent-strong font-semibold font-mono">New</span>
                </div>
                <div className="grid gap-3">
                  <input
                    autoFocus
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                    onChange={(event) => setNewClaimTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleAddClaim();
                      if (event.key === 'Escape') setShowNewClaim(false);
                    }}
                    placeholder="Claim 标题"
                    value={newClaimTitle}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddClaim} type="button">
                      创建
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowNewClaim(false)} type="button">
                      取消
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="flex flex-col items-center justify-center gap-2.5 min-h-[140px] border-dashed rounded-xl p-6 text-muted-foreground hover:text-accent-strong hover:border-accent-strong/30"
                onClick={() => setShowNewClaim(true)}
                type="button"
              >
                <div className="flex items-center gap-2 text-accent-strong">
                  <Plus size={16} />
                  <span className="text-caption font-semibold font-mono">New</span>
                </div>
                <h3 className="text-base font-semibold text-accent-strong font-headline">New Claim</h3>
                <p className="text-xs text-muted-foreground font-mono">记录新的研究判断</p>
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
          selectedClaimCount={selectedClaims.size}
        />
      )}
    </div>
  );
}
