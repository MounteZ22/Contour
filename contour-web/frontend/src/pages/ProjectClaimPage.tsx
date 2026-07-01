import { ArrowLeft, Bot, Edit3, Eye, FileStack, Library, Shield, Tag } from 'lucide-react';
import { useState } from 'react';
import { showToast } from '../components/Toast';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import { MarkdownArticle } from '../components/MarkdownArticle';
import type { Claim, ProjectData } from '../types';

const CONFIDENCE_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  medium: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  high: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
};

const STATUS_LABELS: Record<string, string> = {
  tentative: 'Tentative',
  active: 'Active',
  revised: 'Revised',
  weakened: 'Weakened',
  superseded: 'Superseded',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  tentative: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  active: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  revised: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  weakened: { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },
  superseded: { bg: '#e5e7eb', text: '#4b5563', border: '#6b7280' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

export function ProjectClaimPage() {
  const { project } = useOutletContext<{ project: ProjectData; projects: ProjectData[] }>();
  const { claimId } = useParams();
  const [localClaims, setLocalClaims] = useState(project.claims);
  const activeClaim = localClaims.find((claim) => claim.claimId === claimId) ?? localClaims[0];

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(activeClaim?.content ?? '');

  if (!activeClaim) {
    return null;
  }

  const handleEdit = () => {
    setEditedContent(activeClaim.content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const previousClaims = localClaims;
    setLocalClaims((prev) =>
      prev.map((claim) =>
        claim.claimId === activeClaim.claimId ? { ...claim, content: editedContent } : claim
      )
    );
    setIsEditing(false);

    try {
      const res = await fetch(`/api/claims/${activeClaim.claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });
      const result = await res.json();
      if (!result.success) {
        setLocalClaims(previousClaims);
        setIsEditing(true);
        showToast(`保存 Claim 失败：${result.error}`, 'error');
      }
    } catch (err) {
      setLocalClaims(previousClaims);
      setIsEditing(true);
      showToast(`保存 Claim 请求失败：${(err as Error).message}`, 'error');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const cc = CONFIDENCE_COLORS[activeClaim.confidence] ?? CONFIDENCE_COLORS.medium;
  const sc = STATUS_COLORS[activeClaim.status] ?? STATUS_COLORS.tentative;

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
        <Link
          className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-primary-fixed-dim"
          to="/contour"
        >
          <ArrowLeft size={16} />
          Back to Contour
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface font-medium">Claims</span>
      </div>

      <header className="flex items-start justify-between gap-3 border border-outline-variant rounded-xl p-5 bg-surface-container max-md:flex-col max-md:items-start">
        <div className="grid gap-2">
          <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary mb-0.5">
            Research Claim
          </p>
          <h2 className="text-xl font-bold text-on-background font-headline">{activeClaim.title}</h2>
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-on-surface-variant bg-surface-container-high border border-outline-variant/40"
                  >
                    <Tag size={10} />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <Link
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer transition-colors hover:bg-primary-container/15 hover:border-primary/25 font-mono"
            to="/agent"
          >
            <Bot size={14} />
            去 Agent 讨论
          </Link>
          {isEditing ? (
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono"
                onClick={handleSave}
                type="button"
              >
                保存
              </button>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono"
                onClick={handleCancel}
                type="button"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-outline-variant/40 bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer transition-colors hover:bg-primary-container/15 hover:border-primary/25 font-mono"
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
        <aside className="border border-outline-variant bg-surface-container rounded-xl p-5 sticky top-[122px] max-xl:static">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <Shield size={18} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">Project Claims</p>
              <h3 className="text-base font-semibold text-on-surface font-headline">Research judgments</h3>
            </div>
          </div>

          <div className="grid gap-3 mt-4">
            {localClaims.map((claim) => (
              <NavLink
                className={({ isActive }) =>
                  `w-full text-left border rounded-lg p-3 flex flex-col gap-1.5 cursor-pointer transition-all ${
                    isActive
                      ? 'border-primary/20 bg-primary-container/5'
                      : 'border-transparent bg-surface-container-low/50 hover:border-primary/20 hover:bg-primary-container/5'
                  }`
                }
                key={claim.claimId}
                to={`/project/${project.projectId}/claims/${claim.claimId}`}
              >
                <strong className="text-sm text-on-surface leading-snug">{claim.title}</strong>
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
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {claim.claimId}
                  </span>
                </div>
              </NavLink>
            ))}
          </div>
        </aside>

        <section className="border border-outline-variant bg-surface-container rounded-xl p-5 min-h-[70vh]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-primary-container/20 text-primary">
              <FileStack size={18} />
            </div>
            <div>
              <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-primary">
                {isEditing ? '编辑模式' : 'Claim 阅读器'}
              </p>
              <h3 className="text-base font-semibold text-on-surface font-headline">{activeClaim.title}</h3>
            </div>
            {isEditing ? (
              <Edit3 size={16} className="text-primary" />
            ) : (
              <Eye size={16} className="text-primary" />
            )}
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60vh] mt-4 p-5 rounded-lg bg-surface-container-lowest border border-primary/25 text-on-surface font-mono text-sm leading-7 resize-y outline-none focus:border-primary/40"
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
