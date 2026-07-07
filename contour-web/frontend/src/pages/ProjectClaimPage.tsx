import { ArrowLeft, Bot, Edit3, Eye, FileStack, Library, Shield, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import { MarkdownArticle } from '../components/MarkdownArticle';
import { TagEditor } from '../components/shared/TagEditor';
import { useOptimisticMutation } from '../hooks/useOptimisticMutation';
import type { Claim, ProjectData } from '../types';
import { CONFIDENCE_COLORS, STATUS_COLORS } from '../constants/claimColors';

const CONFIDENCE_OPTIONS = ['low', 'medium', 'high'] as const;
const STATUS_OPTIONS = ['tentative', 'active', 'revised', 'weakened', 'superseded', 'rejected'] as const;

const CONFIDENCE_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};


const STATUS_LABELS: Record<string, string> = {
  tentative: 'Tentative',
  active: 'Active',
  revised: 'Revised',
  weakened: 'Weakened',
  superseded: 'Superseded',
  rejected: 'Rejected',
};

const selectBase = `w-full rounded-lg border border-border/60 bg-surface-raised px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-strong/40`;

export function ProjectClaimPage() {
  const { project } = useOutletContext<{ project: ProjectData; projects: ProjectData[] }>();
  const { claimId } = useParams();
  const [localClaims, setLocalClaims] = useState(project.claims);
  const activeClaim = localClaims.find((claim) => claim.claimId === claimId) ?? localClaims[0];

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(activeClaim?.content ?? '');
  const [editedConfidence, setEditedConfidence] = useState<string>(activeClaim?.confidence ?? 'medium');
  const [editedStatus, setEditedStatus] = useState<string>(activeClaim?.status ?? 'tentative');
  const [editedTags, setEditedTags] = useState<string[]>(activeClaim?.tags ?? []);

  const { mutate, isPending } = useOptimisticMutation();

  if (!activeClaim) {
    return null;
  }

  const handleEdit = () => {
    setEditedContent(activeClaim.content);
    setEditedConfidence(activeClaim.confidence);
    setEditedStatus(activeClaim.status);
    setEditedTags([...activeClaim.tags]);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const previousClaims = localClaims;
    // 乐观更新
    setLocalClaims((prev) =>
      prev.map((claim) =>
        claim.claimId === activeClaim.claimId
          ? { ...claim, content: editedContent, confidence: editedConfidence as Claim['confidence'], status: editedStatus as Claim['status'], tags: editedTags }
          : claim
      )
    );
    setIsEditing(false);

    const ok = await mutate({
      optimistic: () => previousClaims,
      mutationFn: async () => {
        const res = await fetch(`/api/claims/${activeClaim.claimId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: editedContent,
            confidence: editedConfidence,
            status: editedStatus,
            tags: editedTags,
          }),
        });
        return res.json() as Promise<{ success: boolean; error?: string }>;
      },
      rollback: (prev) => {
        setLocalClaims(prev);
        setIsEditing(true);
      },
      errorMessage: '保存 Claim 失败',
    });
    if (!ok) {
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const cc = CONFIDENCE_COLORS[activeClaim.confidence] ?? CONFIDENCE_COLORS.medium;
  const sc = STATUS_COLORS[activeClaim.status] ?? STATUS_COLORS.tentative;

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2.5 text-body text-text-secondary">
        <Link
          className="inline-flex items-center gap-1.5 text-accent-strong transition-colors hover:text-accent-strong"
          to="/contour"
        >
          <ArrowLeft size={16} />
          Back to Contour
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-primary font-medium">Claims</span>
      </div>

      <header className="flex items-start justify-between gap-3 border border-border rounded-xl p-6 bg-surface-sunken max-md:flex-col max-md:items-start">
        <div className="grid gap-2">
          <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong mb-0.5">
            Research Claim
          </p>
          <h2 className="text-xl font-bold text-on-background font-headline">{activeClaim.title}</h2>
          {isEditing ? (
            <div className="flex items-center gap-3 flex-wrap">
              {/* 编辑模式下选择器 */}
              <div className="grid gap-1">
                <span className="text-caption font-mono text-text-secondary">Confidence</span>
                <select
                  className={selectBase}
                  value={editedConfidence}
                  onChange={(e) => setEditedConfidence(e.target.value)}
                >
                  {CONFIDENCE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{CONFIDENCE_LABELS[opt]}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <span className="text-caption font-mono text-text-secondary">Status</span>
                <select
                  className={selectBase}
                  value={editedStatus}
                  onChange={(e) => setEditedStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{STATUS_LABELS[opt]}</option>
                  ))}
                </select>
              </div>
              {/* 标签编辑 */}
              <TagEditor
                tags={editedTags}
                onTagsChange={setEditedTags}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {/* 信心等级徽标 */}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono"
                style={{
                  backgroundColor: cc.bg,
                  color: cc.text,
                  border: `1px solid ${cc.border}`,
                }}
              >
                <Shield size={11} />
                {CONFIDENCE_LABELS[activeClaim.confidence] ?? activeClaim.confidence}
              </span>
              {/* 状态徽标 */}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono"
                style={{
                  backgroundColor: sc.bg,
                  color: sc.text,
                  border: `1px solid ${sc.border}`,
                }}
              >
                {STATUS_LABELS[activeClaim.status] ?? activeClaim.status}
              </span>
              {/* 标签 */}
              {activeClaim.tags && activeClaim.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeClaim.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-caption font-mono text-text-secondary bg-surface border border-border/40"
                    >
                      <Tag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <Link
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono"
            to="/agent"
          >
            <Bot size={14} />
            去 Agent 讨论
          </Link>
          {isEditing ? (
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono"
                disabled={isPending}
                onClick={handleSave}
                type="button"
              >
                保存
              </button>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-danger-subtle-bg/25 border-danger/20 text-danger hover:bg-danger-subtle-bg/40 font-mono"
                onClick={handleCancel}
                type="button"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/40 bg-surface text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono"
              onClick={handleEdit}
              type="button"
            >
              <Edit3 size={14} />
              编辑
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[260px_1fr] gap-4 items-start max-xl:grid-cols-1">
        <aside className="border border-border bg-surface-sunken rounded-xl p-6 sticky top-[122px] max-xl:static">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
              <Shield size={18} />
            </div>
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">Project Claims</p>
              <h3 className="text-base font-semibold text-text-primary font-headline">Research judgments</h3>
            </div>
          </div>

          <div className="grid gap-3 mt-4">
            {localClaims.map((claim) => (
              <NavLink
                className={({ isActive }) =>
                  `w-full text-left border rounded-lg p-3 flex flex-col gap-1.5 cursor-pointer transition-all ${
                    isActive
                      ? 'border-accent-strong/20 bg-accent-subtle-bg/5'
                      : 'border-transparent bg-surface-sunken/50 hover:border-accent-strong/20 hover:bg-accent-subtle-bg/5'
                  }`
                }
                key={claim.claimId}
                to={`/project/${project.projectId}/claims/${claim.claimId}`}
              >
                <strong className="text-body text-text-primary leading-snug">{claim.title}</strong>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: CONFIDENCE_COLORS[claim.confidence]?.bg ?? '#f3f4f6',
                      color: CONFIDENCE_COLORS[claim.confidence]?.text ?? '#374151',
                    }}
                  >
                    {claim.confidence}
                  </span>
                  <span className="text-caption font-mono text-text-secondary">
                    {claim.claimId}
                  </span>
                </div>
              </NavLink>
            ))}
          </div>
        </aside>

        <section className="border border-border bg-surface-sunken rounded-xl p-6 min-h-[70vh]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-accent-subtle-bg/20 text-accent-strong">
              <FileStack size={18} />
            </div>
            <div>
              <p className="text-label font-mono font-medium uppercase tracking-wider text-accent-strong">
                {isEditing ? '编辑模式' : 'Claim 阅读器'}
              </p>
              <h3 className="text-base font-semibold text-text-primary font-headline">{activeClaim.title}</h3>
            </div>
            {isEditing ? (
              <Edit3 size={16} className="text-accent-strong" />
            ) : (
              <Eye size={16} className="text-accent-strong" />
            )}
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60vh] mt-4 p-5 rounded-lg bg-surface-raised border border-accent-strong/25 text-text-primary font-mono text-sm leading-7 resize-y outline-none focus:border-accent-strong/40"
              onChange={(e) => setEditedContent(e.target.value)}
              value={editedContent}
            />
          ) : (
            <MarkdownArticle content={activeClaim.content} />
          )}
        </section>
      </div>
    </div>
  );
}
