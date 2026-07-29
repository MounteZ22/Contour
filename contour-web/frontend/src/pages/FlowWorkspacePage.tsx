import { ArrowLeft, Bot, ChevronDown, Cpu, Edit3, Files, Loader2, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { showToast } from '../components/Toast';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { MarkdownArticle } from '../components/MarkdownArticle';
import { StatusBadge } from '../components/StatusBadge';
import { FlowAssetsPanel } from '../components/flow/FlowAssetsPanel';
import { useOptimisticMutation } from '../hooks/useOptimisticMutation';
import { useSessionModelSelection } from '../state/agentModelSelection';
import {
  fetchFlowSummary,
  flowSummaryStatesAtom,
  generateFlowSummaryDraft,
  initialFlowSummaryState,
  saveFlowSummary,
} from '../state/flowSummary';
import type { FlowStatus, ProjectData } from '../types';

export function FlowWorkspacePage() {
  const { onRefresh, project, projects } = useOutletContext<{ onRefresh: () => void; project: ProjectData; projects: ProjectData[] }>();
  const { flowId } = useParams();
  const initialFlow = project.flows.find((item) => item.flowId === flowId) ?? project.flows[0];

  const [localSections, setLocalSections] = useState(initialFlow.sections);
  const fallbackSection = localSections[0];
  const [activeSectionId, setActiveSectionId] = useState(fallbackSection?.id ?? '');
  const activeSection = localSections.find((section) => section.id === activeSectionId) ?? fallbackSection;

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  // 状态编辑
  const [flowStatus, setFlowStatus] = useState<FlowStatus>(initialFlow.status);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const { mutate, isPending } = useOptimisticMutation();
  const summaryKey = `${project.projectId}:${initialFlow.flowId}`;
  const [summaryStates, setSummaryStates] = useAtom(flowSummaryStatesAtom);
  const summaryState = summaryStates[summaryKey] ?? initialFlowSummaryState;
  const setSummaryState = useCallback((update: typeof initialFlowSummaryState | ((current: typeof initialFlowSummaryState) => typeof initialFlowSummaryState)) => {
    setSummaryStates((current) => {
      const previous = current[summaryKey] ?? initialFlowSummaryState;
      const next = typeof update === 'function' ? update(previous) : update;
      return { ...current, [summaryKey]: next };
    });
  }, [setSummaryStates, summaryKey]);
  const {
    options: summaryModelOptions,
    status: summaryModelStatus,
    selectedOption: selectedSummaryModel,
    selection: summaryModelSelection,
    selectModel: selectSummaryModel,
  } = useSessionModelSelection(`flow-summary:${summaryKey}`);

  useEffect(() => {
    setFlowStatus(initialFlow.status);
  }, [initialFlow.status]);

  // 点击外部关闭状态菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStatusChange = async (newStatus: FlowStatus) => {
    setShowStatusMenu(false);
    try {
      const res = await fetch(`/api/flows/${initialFlow.flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, projectId: project.projectId }),
      });
      const result = await res.json();
      if (result.success) {
        setFlowStatus(newStatus);
        onRefresh();
      } else {
        showToast(`更新状态失败：${result.error}`, 'error');
      }
    } catch (err) {
      showToast(`更新状态请求失败：${(err as Error).message}`, 'error');
    }
  };

  useEffect(() => {
    const currentFlow = project.flows.find((item) => item.flowId === flowId) ?? project.flows[0];
    setLocalSections(currentFlow.sections);
    setActiveSectionId(currentFlow.sections[0]?.id ?? '');
    setIsEditing(false);
    setShowNewSection(false);
  }, [flowId, project.flows]);

  useEffect(() => {
    let cancelled = false;
    setSummaryState(initialFlowSummaryState);
    fetchFlowSummary(project.projectId, initialFlow.flowId)
      .then((content) => {
        if (cancelled) return;
        setSummaryState({
          ...initialFlowSummaryState,
          content,
          savedContent: content,
          isLoading: false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setSummaryState({
          ...initialFlowSummaryState,
          isLoading: false,
          error: error instanceof Error ? error.message : '读取摘要失败',
        });
      });
    return () => { cancelled = true; };
  }, [initialFlow.flowId, project.projectId, setSummaryState]);

  if (!activeSection) {
    return (
      <div className="grid gap-6">
        <div className="flex items-center gap-2.5 text-body text-text-secondary">
          <Link className="inline-flex items-center gap-1.5 text-accent-strong transition-colors hover:text-accent-strong" to="/contour">
            <ArrowLeft size={16} />
            Back to Contour
          </Link>
        </div>
        <div className="border border-border rounded-xl p-10 bg-surface-sunken text-center">
          <p className="text-text-secondary">此 Flow 暂无 Section</p>
          <p className="text-text-secondary text-sm mt-2">
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
    const previousSections = localSections;
    setLocalSections((prev) =>
      prev.map((section) =>
        section.id === activeSection.id ? { ...section, content: editedContent } : section
      )
    );
    setIsEditing(false);

    const ok = await mutate({
      optimistic: () => previousSections,
      mutationFn: async () => {
        const res = await fetch(`/api/flows/${initialFlow.flowId}/sections/${activeSection.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedContent, projectId: project.projectId }),
        });
        return res.json() as Promise<{ success: boolean; error?: string }>;
      },
      rollback: (prev) => {
        setLocalSections(prev);
        setIsEditing(true);
      },
      errorMessage: '保存 Section 失败',
    });
    if (!ok) {
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) return;
    const newId = `section_${crypto.randomUUID().slice(0, 8)}`;
    const title = newSectionTitle.trim();

    try {
      const res = await fetch(`/api/flows/${initialFlow.flowId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: newId, title, projectId: project.projectId }),
      });
      const result = await res.json();
      if (!result.success) {
        showToast(`创建 Section 失败：${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`创建 Section 请求失败：${(err as Error).message}`, 'error');
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
        showToast(`删除 Section 失败：${result.error}`, 'error');
        return;
      }
      setLocalSections((prev) => prev.filter((s) => s.id !== sectionId));
      if (activeSectionId === sectionId) {
        const remaining = localSections.filter((s) => s.id !== sectionId);
        setActiveSectionId(remaining[0]?.id ?? '');
      }
      onRefresh();
    } catch (err) {
      showToast(`删除 Section 请求失败：${(err as Error).message}`, 'error');
    }
  };

  const handleGenerateSummary = async () => {
    if (!summaryModelSelection || summaryState.isGenerating) return;
    setSummaryState((current) => ({ ...current, isGenerating: true, error: null }));
    try {
      const { draft } = await generateFlowSummaryDraft(project.projectId, initialFlow.flowId, summaryModelSelection);
      setSummaryState((current) => ({
        ...current,
        content: draft,
        isEditing: true,
        isGenerating: false,
      }));
    } catch (error) {
      setSummaryState((current) => ({
        ...current,
        isGenerating: false,
        error: error instanceof Error ? error.message : '生成摘要草稿失败',
      }));
    }
  };

  const handleSaveSummary = async () => {
    if (summaryState.isSaving) return;
    setSummaryState((current) => ({ ...current, isSaving: true, error: null }));
    try {
      await saveFlowSummary(project.projectId, initialFlow.flowId, summaryState.content);
      setSummaryState((current) => ({
        ...current,
        savedContent: current.content,
        isSaving: false,
        isEditing: false,
      }));
      onRefresh();
      showToast('Flow 摘要已保存', 'success');
    } catch (error) {
      setSummaryState((current) => ({
        ...current,
        isSaving: false,
        error: error instanceof Error ? error.message : '保存摘要失败',
      }));
    }
  };

  const handleCancelSummary = () => {
    setSummaryState((current) => ({
      ...current,
      content: current.savedContent,
      isEditing: false,
      error: null,
    }));
  };

  return (
    <div className="grid h-full w-full min-w-0 max-w-full gap-6 overflow-x-hidden overflow-y-auto p-4 md:p-6">
      <div className="flex items-center gap-2.5 text-body text-text-secondary">
        <Link className="inline-flex items-center gap-1.5 text-accent-strong transition-colors hover:text-accent-strong" to="/contour">
          <ArrowLeft size={16} />
          Back to Contour
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-primary font-medium">{initialFlow.flowId}</span>
      </div>

      <header className="flex items-start justify-between gap-3 border border-border rounded-xl p-4 sm:p-6 bg-surface-sunken max-md:flex-col max-md:items-stretch">
        <div className="min-w-0">
          <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-0.5">{initialFlow.flowId}</p>
          <h2 className="break-words text-xl font-bold text-text-primary font-headline">{initialFlow.title}</h2>
        </div>
        <div className="flex min-w-0 items-center gap-3 flex-wrap">
          <Link
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono"
            to="/agent"
          >
            <Bot size={14} />
            去 Agent 讨论
          </Link>
          <div className="relative" ref={statusMenuRef}>
            <button
              className="cursor-pointer"
              onClick={() => setShowStatusMenu((prev) => !prev)}
              type="button"
            >
              <StatusBadge status={flowStatus} />
            </button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1.5 z-20 bg-surface-raised border border-border rounded-lg shadow-lg p-1.5 min-w-[140px]"
              >
                {(['in_progress', 'completed', 'archived', 'abandoned'] as FlowStatus[]).map((s) => (
                  <button
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                      s === flowStatus
                        ? 'bg-accent-strong/10 text-accent-strong'
                        : 'hover:bg-surface text-text-secondary'
                    }`}
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    type="button"
                  >
                    {s === 'in_progress' && '进行'}
                    {s === 'completed' && '完成'}
                    {s === 'archived' && '归档'}
                    {s === 'abandoned' && '放弃'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-caption text-text-secondary font-mono">{initialFlow.type.replace('_', ' ')}</span>
          <span className="break-words text-caption text-text-secondary font-mono">更新于 {initialFlow.updated}</span>
        </div>
      </header>

      <section className="grid gap-4 border border-border rounded-xl p-4 sm:p-6 bg-surface-sunken">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-8 h-8 shrink-0 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">AI Flow Summary</p>
              <h3 className="text-base font-semibold text-text-primary font-headline">摘要草稿</h3>
              <p className="mt-1 text-sm text-text-secondary">
                {selectedSummaryModel
                  ? `生成时会将当前完整 Flow 发送给 ${selectedSummaryModel.modelName}（${selectedSummaryModel.channelName}）。`
                  : summaryModelStatus === 'loading'
                    ? '正在读取可用模型。'
                    : '未找到可用模型，请先在设置中启用一个 Agent 兼容模型。'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
            <select
              aria-label="摘要模型选择"
              className="max-w-52 rounded-md border border-border/50 bg-surface px-2.5 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent-strong/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={summaryModelStatus !== 'ready' || summaryModelOptions.length === 0 || summaryState.isGenerating}
              onChange={(event) => {
                const option = summaryModelOptions.find((item) => `${item.channelId}:${item.modelId}` === event.target.value);
                if (option) selectSummaryModel(option);
              }}
              value={selectedSummaryModel ? `${selectedSummaryModel.channelId}:${selectedSummaryModel.modelId}` : ''}
            >
              {summaryModelOptions.length === 0 ? (
                <option value="">{summaryModelStatus === 'loading' ? '加载模型...' : '没有可用模型'}</option>
              ) : summaryModelOptions.map((option) => (
                <option key={`${option.channelId}:${option.modelId}`} value={`${option.channelId}:${option.modelId}`}>
                  {option.modelName} · {option.channelName}
                </option>
              ))}
            </select>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!summaryModelSelection || summaryState.isGenerating || summaryState.isSaving}
              onClick={handleGenerateSummary}
              title={selectedSummaryModel ? `使用 ${selectedSummaryModel.modelName} 生成草稿` : '请先选择可用模型'}
              type="button"
            >
              {summaryState.isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Cpu size={14} />}
              生成草稿
            </button>
          </div>
        </div>

        {summaryState.error && <p className="text-sm text-danger">{summaryState.error}</p>}

        {summaryState.isLoading ? (
          <div className="flex min-h-24 items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="animate-spin" size={16} />
            正在读取已保存的摘要...
          </div>
        ) : summaryState.isEditing ? (
          <div className="grid gap-3">
            <textarea
              aria-label="Flow 摘要草稿"
              className="min-h-44 w-full resize-y rounded-lg border border-accent-strong/25 bg-surface-raised p-4 font-mono text-sm leading-7 text-text-primary outline-none focus:border-accent-strong/40"
              maxLength={1200}
              onChange={(event) => setSummaryState((current) => ({ ...current, content: event.target.value }))}
              value={summaryState.content}
            />
            <div className="flex justify-between gap-3 max-sm:flex-col max-sm:items-start">
              <span className="text-xs text-text-secondary font-mono">{summaryState.content.length}/1200</span>
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={summaryState.isSaving}
                  onClick={handleSaveSummary}
                  type="button"
                >
                  {summaryState.isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  保存摘要
                </button>
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-danger-subtle-bg/25 border-danger/20 text-danger hover:bg-danger-subtle-bg/40 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={summaryState.isSaving}
                  onClick={handleCancelSummary}
                  type="button"
                >
                  <X size={14} />
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : summaryState.savedContent ? (
          <div className="grid gap-3">
            <MarkdownArticle content={summaryState.savedContent} />
            <div>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono"
                onClick={() => setSummaryState((current) => ({ ...current, isEditing: true, error: null }))}
                type="button"
              >
                <Edit3 size={14} />
                编辑摘要
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">尚未保存摘要。生成草稿后可先编辑，再确认保存。</p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-4 border border-border rounded-xl p-4 sm:p-6 bg-surface-sunken max-lg:grid-cols-1">
        <div className="min-w-0">
          <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-0.5">待解决的不确定性</p>
          <strong className="break-words text-body text-text-primary font-mono">{initialFlow.openUncertainties[0]}</strong>
        </div>
        <div className="min-w-0">
          <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-0.5">父节点</p>
          <strong className="break-words text-body text-text-primary font-mono">{initialFlow.parentFlows.length === 0 ? 'Root' : initialFlow.parentFlows.join(', ')}</strong>
        </div>
        <div className="min-w-0">
          <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-0.5">标签</p>
          <strong className="break-words text-body text-text-primary font-mono">{initialFlow.tags.join(' · ')}</strong>
        </div>
      </section>

      <FlowAssetsPanel
        attachments={initialFlow.attachments}
        flowId={initialFlow.flowId}
        links={initialFlow.links}
        onRefresh={onRefresh}
        projectId={project.projectId}
      />

      <div className="grid min-w-0 grid-cols-1 gap-4 items-start xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0 border border-border bg-surface-sunken rounded-xl p-6 xl:sticky xl:top-[122px]">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
              <Files size={18} />
            </div>
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">Sections</p>
              <h3 className="text-base font-semibold text-text-primary font-headline">Flow documents</h3>
            </div>
          </div>

          <div className="grid gap-3 mt-4">
            {localSections.map((section) => (
              <div
                className={`w-full text-left border rounded-lg p-3.5 flex items-center justify-between gap-2 cursor-pointer transition-all ${
                  section.id === activeSection.id
                    ? 'border-accent-strong/20 bg-accent-subtle-bg/5'
                    : 'border-transparent bg-surface-sunken/50 hover:border-accent-strong/20 hover:bg-accent-subtle-bg/5'
                }`}
                key={section.id}
              >
                <button
                  className="min-w-0 flex-1 grid gap-1.5 bg-transparent border-none text-inherit text-left p-0 cursor-pointer font-inherit"
                  onClick={() => {
                    setActiveSectionId(section.id);
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  <strong className="break-words text-body text-text-primary">{section.title}</strong>
                  <span className="text-caption text-text-secondary font-mono">{section.filename}</span>
                </button>
                <button
                  className="w-6 h-6 rounded-md border border-border/50 bg-surface text-text-secondary flex items-center justify-center cursor-pointer transition-colors hover:bg-danger/20 hover:border-danger/30 hover:text-danger"
                  onClick={() => handleDeleteSection(section.id, section.title)}
                  title="删除 Section"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {showNewSection ? (
              <div className="grid gap-2 p-3 border border-accent-strong/25 rounded-lg bg-accent-subtle-bg/5">
                <input
                  autoFocus
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface-raised text-text-primary text-sm outline-none focus:border-accent-strong/40 font-mono"
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
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono" onClick={handleAddSection} type="button">
                    添加
                  </button>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-danger-subtle-bg/25 border-danger/20 text-danger hover:bg-danger-subtle-bg/40 font-mono" onClick={() => setShowNewSection(false)} type="button">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button className="w-full text-left border border-dashed border-border rounded-lg p-3 bg-transparent text-text-secondary inline-flex items-center gap-2 cursor-pointer hover:border-accent-strong/40 hover:text-accent-strong hover:bg-surface-sunken transition-all" onClick={() => setShowNewSection(true)} type="button">
                <Plus size={14} />
                New Section
              </button>
            )}
          </div>
        </aside>

        <section className="min-w-0 border border-border bg-surface-sunken rounded-xl p-4 sm:p-6 min-h-[70vh]">
          <div className="flex items-start justify-between gap-3 mb-4 max-sm:flex-col">
            <div className="flex min-w-0 items-start gap-3">
              <div className="w-8 h-8 shrink-0 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">{isEditing ? '编辑模式' : '阅读区'}</p>
                <h3 className="break-words text-base font-semibold text-text-primary font-headline">{activeSection.title}</h3>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 items-center self-end sm:self-auto">
              {isEditing ? (
                <>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono disabled:opacity-50 disabled:cursor-not-allowed" disabled={isPending} onClick={handleSave} type="button">
                    保存
                  </button>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-danger-subtle-bg/25 border-danger/20 text-danger hover:bg-danger-subtle-bg/40 font-mono" onClick={handleCancel} type="button">
                    取消
                  </button>
                </>
              ) : (
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono" onClick={handleEdit} type="button">
                  <Edit3 size={14} />
                  编辑
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60vh] mt-4 p-5 rounded-lg bg-surface-raised border border-accent-strong/25 text-text-primary font-mono text-sm leading-7 resize-y outline-none focus:border-accent-strong/40"
              onChange={(e) => setEditedContent(e.target.value)}
              value={editedContent}
            />
          ) : (
            <MarkdownArticle content={activeSection.content} />
          )}
        </section>
      </div>
    </div>
  );
}
