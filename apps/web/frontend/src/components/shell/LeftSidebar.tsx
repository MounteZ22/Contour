import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Map,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { useAtom } from 'jotai';
import { showToast } from '../Toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { currentProjectIdAtom, sidebarCollapsedAtom } from '../../state/shell';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import type { ProjectData } from '@contour/shared';
import { cn } from '@/lib/utils';

function projectInitial(title: string) {
  return title.trim().slice(0, 1).toUpperCase() || 'P';
}

export function LeftSidebar({
  forceExpanded = false,
  onClose,
  onRefresh,
  projects,
}: {
  forceExpanded?: boolean;
  onClose?: () => void;
  onRefresh: () => void;
  projects: ProjectData[];
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const displayCollapsed = forceExpanded ? false : collapsed;
  const [currentProjectId, setCurrentProjectId] = useAtom(currentProjectIdAtom);
  const { sessions, deleteSession } = useAgentSessions(currentProjectId ?? undefined);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectGoal, setNewProjectGoal] = useState('');

  const pinnedSessions = useMemo(() => sessions.filter((session) => session.pinned), [sessions]);
  const recentSessions = useMemo(() => sessions.filter((session) => !session.pinned).slice(0, 8), [sessions]);

  const handleSelectProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    navigate('/contour');
  };

  const handleDeleteSession = (sessionId: string, title: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`确定要删除会话「${title}」吗？此操作不可撤销。`)) return;
    deleteSession(sessionId);
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
      // 使用后端返回的实际 projectId（目录名），而非本地生成的 ID
      if (result.data?.projectId) {
        setCurrentProjectId(result.data.projectId);
      }
    } catch (err) {
      showToast(`创建项目请求失败：${(err as Error).message}`, 'error');
      return;
    }
    setNewProjectTitle('');
    setNewProjectGoal('');
    setShowNewProject(false);
    onRefresh();
    navigate('/contour');
  };

  const handleDeleteProject = async (project: ProjectData) => {
    if (!confirm(`确定要删除项目 "${project.title}" 吗？此操作将删除项目下的所有 Flow、文档和数据，不可撤销。`)) return;
    try {
      const res = await fetch(`/api/project/${project.projectId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) {
        showToast(`删除项目失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`删除项目请求失败：${(err as Error).message}`, 'error');
      return;
    }
    if (currentProjectId === project.projectId) {
      const remaining = projects.filter((p) => p.projectId !== project.projectId);
      setCurrentProjectId(remaining.length > 0 ? remaining[0].projectId : null);
    }
    onRefresh();
  };

  return (
    <aside
      className={cn(
        'h-screen shrink-0 border-r border-border bg-surface flex flex-col transition-[width] duration-200',
        displayCollapsed ? 'w-[68px]' : 'w-[280px]',
      )}
    >
      {/* Header */}
      <div className="h-[52px] px-3 flex items-center justify-between border-b border-border">
        <button
          className="min-w-0 flex items-center gap-2 text-left"
          onClick={() => navigate('/contour')}
          type="button"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-strong text-accent-on flex items-center justify-center font-headline font-bold text-[15px]">
            C
          </div>
          {!displayCollapsed && (
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold font-headline leading-tight text-text-primary">Contour</h1>
              <p className="text-[10px] text-text-tertiary font-mono">Agent + Research Map</p>
            </div>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={forceExpanded ? onClose : () => setCollapsed((value) => !value)}
          title={forceExpanded ? '关闭导航' : displayCollapsed ? '展开侧栏' : '收起侧栏'}
          type="button"
        >
          {forceExpanded ? <X size={16} /> : displayCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="p-3 grid gap-1.5 border-b border-border">
        <NavLink
          to="/contour"
          className={({ isActive }) =>
            cn(
              'h-9 rounded-[6px] px-3 inline-flex items-center gap-2 text-sm transition-colors',
              displayCollapsed && 'justify-center px-0',
              isActive ? 'bg-accent-subtle-bg text-accent-subtle-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
            )
          }
          title="Contour 视图"
        >
          <Map size={16} />
          {!displayCollapsed && <span>Contour</span>}
        </NavLink>
        <NavLink
          to="/agent"
          className={({ isActive }) =>
            cn(
              'h-9 rounded-[6px] px-3 inline-flex items-center gap-2 text-sm transition-colors',
              displayCollapsed && 'justify-center px-0',
              isActive ? 'bg-accent-subtle-bg text-accent-subtle-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
            )
          }
          title="Agent 会话"
        >
          <Bot size={16} />
          {!displayCollapsed && <span>Agent</span>}
        </NavLink>
      </nav>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Projects section */}
        <section>
          {!displayCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-mono">Projects</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowNewProject((value) => !value)}
                title="新建项目"
                type="button"
              >
                <Plus size={14} />
              </Button>
            </div>
          )}

          <div className="grid gap-1.5">
            {projects.map((project) => {
              const active = project.projectId === currentProjectId;
              return (
                <button
                  className={cn(
                    'group w-full rounded-[6px] border text-left transition-colors',
                    displayCollapsed ? 'h-10 flex items-center justify-center px-0' : 'p-2.5',
                    active
                      ? 'bg-accent-subtle-bg'
                      : 'border-transparent text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                  )}
                  key={project.projectId}
                  onClick={() => handleSelectProject(project.projectId)}
                  title={project.title}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                >
                  {displayCollapsed ? (
                    <span className="text-xs font-bold font-headline">{projectInitial(project.title)}</span>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className={cn('text-sm font-medium truncate', active ? 'text-accent-subtle-text' : 'text-text-primary')}>
                          {project.title}
                        </h3>
                        <p className={cn('mt-1 text-[11px] font-mono truncate', active ? 'text-text-tertiary' : 'text-text-secondary')}>
                          {project.flows.length} Flows · {project.docs.length} Docs
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-danger hover:bg-danger-subtle-bg"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteProject(project);
                        }}
                        title="删除项目"
                        type="button"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  )}
                </button>
              );
            })}

            {!displayCollapsed && showNewProject && (
              <div className="grid gap-2 rounded-[6px] border bg-surface-sunken p-3">
                <Input
                  autoFocus
                  className="font-mono"
                  onChange={(event) => setNewProjectTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddProject();
                    if (event.key === 'Escape') setShowNewProject(false);
                  }}
                  placeholder="项目名称"
                  value={newProjectTitle}
                />
                <Textarea
                  className="font-mono resize-y"
                  onChange={(event) => setNewProjectGoal(event.target.value)}
                  placeholder="Research goal"
                  rows={2}
                  value={newProjectGoal}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddProject} type="button">
                    创建
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewProject(false)} type="button">
                    取消
                  </Button>
                </div>
              </div>
            )}

          </div>
        </section>

        {!displayCollapsed && (
          <>
            {pinnedSessions.length > 0 && (
              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-mono">Pinned</p>
                {pinnedSessions.map((session) => (
                  <div key={session.id} className="group relative flex items-center">
                    <NavLink
                      to={`/agent/${session.id}`}
                      className="flex-1 rounded-[6px] px-3 py-2 text-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary truncate"
                    >
                      {session.title}
                    </NavLink>
                    <button
                      className="absolute right-1 z-10 hidden shrink-0 rounded-[3px] p-1 text-text-secondary hover:bg-error hover:text-white group-hover:block"
                      title="删除会话"
                      onClick={(e) => handleDeleteSession(session.id, session.title, e)}
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-mono">Sessions</p>
              {recentSessions.length === 0 ? (
                <div className="rounded-[6px] border border-border/60 p-3 text-xs text-text-secondary">
                  还没有会话。可以从 Contour 多选后开始讨论。
                </div>
              ) : (
                recentSessions.map((session) => (
                  <div key={session.id} className="group relative flex items-center">
                    <NavLink
                      to={`/agent/${session.id}`}
                      className={({ isActive }) =>
                        cn(
                          'flex-1 flex items-start gap-2 rounded-[6px] px-3 py-2 text-sm transition-colors',
                          isActive ? 'bg-accent-subtle-bg text-accent-subtle-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                        )
                      }
                    >
                      <MessageSquare size={14} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 truncate">{session.title}</span>
                    </NavLink>
                    <button
                      className="absolute right-1 z-10 hidden shrink-0 rounded-[3px] p-1 text-text-secondary hover:bg-error hover:text-white group-hover:block"
                      title="删除会话"
                      onClick={(e) => handleDeleteSession(session.id, session.title, e)}
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border grid gap-1.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'h-9 rounded-[6px] px-3 inline-flex items-center gap-2 text-sm transition-colors',
              displayCollapsed && 'justify-center px-0',
              isActive ? 'bg-accent-subtle-bg text-accent-subtle-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
            )
          }
          title="设置"
        >
          <Settings size={16} />
          {!displayCollapsed && <span>设置</span>}
        </NavLink>
      </div>
    </aside>
  );
}
