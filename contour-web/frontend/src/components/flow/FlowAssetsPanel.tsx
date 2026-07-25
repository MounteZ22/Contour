import { FilePlus2, Link2, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { showToast } from '../Toast';
import { Button } from '../ui/button';
import {
  addFlowLink,
  deleteFlowAttachment,
  fetchFlowAssets,
  removeFlowLink,
  uploadFlowAttachment,
} from '../../state/flowAssets';
import type { FlowLink } from '../../types';

interface FlowAssetsPanelProps {
  projectId: string;
  flowId: string;
  attachments: string[];
  links: FlowLink[];
  onRefresh: () => void;
}

export function FlowAssetsPanel({
  projectId,
  flowId,
  attachments,
  links,
  onRefresh,
}: FlowAssetsPanelProps) {
  const [assets, setAssets] = useState({ attachments, links });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkPath, setLinkPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setAssets({ attachments, links });
    void fetchFlowAssets(flowId, projectId)
      .then((nextAssets) => {
        if (!cancelled) setAssets(nextAssets);
      })
      .catch((error) => {
        // 父级传入的数据可作为请求失败时的降级展示。
        console.warn('[FlowAssets] 加载 Flow 资料失败:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [attachments, flowId, links, projectId]);

  const runMutation = async (action: string, operation: () => Promise<void>, successMessage: string) => {
    setBusyAction(action);
    try {
      await operation();
      showToast(successMessage, 'success');
      onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败，请重试', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await runMutation(
      'upload',
      async () => {
        const nextAttachments = await uploadFlowAttachment(projectId, flowId, file);
        setAssets((current) => ({ ...current, attachments: nextAttachments }));
      },
      `已上传附件“${file.name}”`,
    );
  };

  const handleDeleteAttachment = async (filename: string) => {
    if (!window.confirm(`确定删除附件“${filename}”吗？此操作不可撤销。`)) return;
    await runMutation(
      `attachment:${filename}`,
      async () => {
        const nextAttachments = await deleteFlowAttachment(projectId, flowId, filename);
        setAssets((current) => ({ ...current, attachments: nextAttachments }));
      },
      `已删除附件“${filename}”`,
    );
  };

  const handleAddLink = async (event: FormEvent) => {
    event.preventDefault();
    const label = linkLabel.trim();
    const path = linkPath.trim();
    if (!label || !path) {
      showToast('请填写链接名称和本机绝对路径', 'error');
      return;
    }
    await runMutation(
      'add-link',
      async () => {
        const nextLinks = await addFlowLink(projectId, flowId, path, label);
        setAssets((current) => ({ ...current, links: nextLinks }));
        setLinkLabel('');
        setLinkPath('');
        setShowLinkForm(false);
      },
      '链接已添加',
    );
  };

  const handleRemoveLink = async (link: FlowLink) => {
    await runMutation(
      `link:${link.path}`,
      async () => {
        const nextLinks = await removeFlowLink(projectId, flowId, link.path);
        setAssets((current) => ({ ...current, links: nextLinks }));
      },
      `已移除链接“${link.label}”`,
    );
  };

  const isBusy = busyAction !== null;

  return (
    <section className="rounded-lg bg-surface-sunken px-5 py-4 shadow-sm">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle-bg/25 text-accent-strong">
            <Paperclip size={16} />
          </div>
          <div>
            <p className="text-label font-mono font-medium uppercase text-accent-strong">Flow 资料</p>
            <h3 className="text-sm font-semibold text-text-primary">附件与本地文件链接</h3>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <input
            className="sr-only"
            disabled={isBusy}
            onChange={handleUpload}
            ref={fileInputRef}
            type="file"
          />
          <Button
            className="min-w-0"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            title="上传附件，单个文件最大 3 MiB"
            type="button"
            variant="outline"
          >
            {busyAction === 'upload' ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
            上传附件
          </Button>
          <Button
            className="min-w-0"
            disabled={isBusy}
            onClick={() => setShowLinkForm((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            {showLinkForm ? <X /> : <Plus />}
            {showLinkForm ? '取消' : '添加链接'}
          </Button>
        </div>
      </div>

      {showLinkForm && (
        <form className="mt-4 grid grid-cols-[minmax(120px,0.45fr)_minmax(220px,1fr)_auto] gap-2 max-md:grid-cols-1" onSubmit={handleAddLink}>
          <label className="sr-only" htmlFor={`flow-link-label-${flowId}`}>链接名称</label>
          <input
            className="h-9 min-w-0 rounded-md bg-surface-raised px-3 text-sm text-text-primary shadow-sm outline-none ring-1 ring-border focus:ring-accent-strong/50"
            id={`flow-link-label-${flowId}`}
            maxLength={200}
            onChange={(event) => setLinkLabel(event.target.value)}
            placeholder="显示名称，例如：原始数据"
            value={linkLabel}
          />
          <label className="sr-only" htmlFor={`flow-link-path-${flowId}`}>本机绝对路径</label>
          <input
            className="h-9 min-w-0 rounded-md bg-surface-raised px-3 font-mono text-xs text-text-primary shadow-sm outline-none ring-1 ring-border focus:ring-accent-strong/50"
            id={`flow-link-path-${flowId}`}
            onChange={(event) => setLinkPath(event.target.value)}
            placeholder="本机绝对路径，例如 D:\\资料\\data.xlsx"
            value={linkPath}
          />
          <Button disabled={isBusy} size="sm" type="submit">
            {busyAction === 'add-link' ? <Loader2 className="animate-spin" /> : <Link2 />}
            保存链接
          </Button>
        </form>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 max-lg:grid-cols-1">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-text-primary">附件</h4>
            <span className="text-caption font-mono text-text-secondary">{assets.attachments.length}</span>
          </div>
          {assets.attachments.length === 0 ? (
            <p className="py-2 text-xs text-text-secondary">还没有附件</p>
          ) : (
            <ul className="grid gap-1">
              {assets.attachments.map((filename) => (
                <li className="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 hover:bg-surface-raised" key={filename}>
                  <Paperclip className="shrink-0 text-text-secondary" size={14} />
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary" title={filename}>{filename}</span>
                  <button
                    aria-label={`删除附件 ${filename}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    disabled={isBusy}
                    onClick={() => handleDeleteAttachment(filename)}
                    title="删除附件"
                    type="button"
                  >
                    {busyAction === `attachment:${filename}` ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 lg:border-l lg:border-border/60 lg:pl-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-text-primary">本地文件链接</h4>
            <span className="text-caption font-mono text-text-secondary">{assets.links.length}</span>
          </div>
          {assets.links.length === 0 ? (
            <p className="py-2 text-xs text-text-secondary">还没有链接</p>
          ) : (
            <ul className="grid gap-1">
              {assets.links.map((link) => (
                <li className="flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-raised" key={link.path}>
                  <Link2 className="shrink-0 text-accent-strong" size={14} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary" title={link.label}>{link.label}</p>
                    <p className="truncate font-mono text-[11px] text-text-secondary" title={link.path}>{link.path}</p>
                  </div>
                  <button
                    aria-label={`移除链接 ${link.label}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    disabled={isBusy}
                    onClick={() => handleRemoveLink(link)}
                    title="移除链接"
                    type="button"
                  >
                    {busyAction === `link:${link.path}` ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
