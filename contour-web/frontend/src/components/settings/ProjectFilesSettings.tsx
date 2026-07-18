import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  AlertCircle,
  CheckCircle2,
  File,
  FolderOpen,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { showToast } from '../Toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { currentProjectIdAtom } from '../../state/shell';
import {
  addAttachedDirectory,
  addAttachedFile,
  getProjectConfig,
  removeAttachedDirectory,
  removeAttachedFile,
} from '../../state/projectConfig';
import type { ProjectConfig, ProjectPathEntry } from '../../types';
import { SettingsCard, SettingsSection } from './primitives';

type PathKind = 'folder' | 'file';

interface PathSectionProps {
  entries: ProjectPathEntry[];
  kind: PathKind;
  busyPath: string | null;
  onAdd: (path: string) => Promise<void>;
  onRemove: (path: string) => Promise<void>;
}

const PATH_CONTENT = {
  folder: {
    title: '附加文件夹',
    description: '登记供 Agent 使用的文件夹及其中资料。',
    placeholder: '例如：D:\\Research\\参考资料',
    empty: '还没有添加文件夹',
    addLabel: '添加文件夹',
    icon: FolderOpen,
  },
  file: {
    title: '附加文件',
    description: '登记供 Agent 使用的单个文件。',
    placeholder: '例如：D:\\Research\\实验记录.xlsx',
    empty: '还没有添加文件',
    addLabel: '添加文件',
    icon: File,
  },
} as const;

function PathStatus({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs text-success">
      <CheckCircle2 size={12} />
      可用
    </span>
  ) : (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-xs text-warning"
      title="路径当前无法访问，但配置仍会保留"
    >
      <AlertCircle size={12} />
      暂不可用
    </span>
  );
}

function PathSection({ entries, kind, busyPath, onAdd, onRemove }: PathSectionProps) {
  const [path, setPath] = useState('');
  const [adding, setAdding] = useState(false);
  const content = PATH_CONTENT[kind];
  const Icon = content.icon;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPath = path.trim();
    if (!normalizedPath || adding) return;

    setAdding(true);
    try {
      await onAdd(normalizedPath);
      setPath('');
    } catch {
      // 上层已经用 Toast 告知失败原因，保留输入便于用户修改后重试。
    } finally {
      setAdding(false);
    }
  };

  return (
    <SettingsSection description={content.description} title={content.title}>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={`attached-${kind}-path`}>
          {kind === 'folder' ? '文件夹绝对路径' : '文件绝对路径'}
        </label>
        <Input
          className="min-w-0 flex-1 font-mono"
          disabled={adding}
          id={`attached-${kind}-path`}
          onChange={(event) => setPath(event.target.value)}
          placeholder={content.placeholder}
          spellCheck={false}
          value={path}
        />
        <Button className="shrink-0" disabled={!path.trim() || adding} type="submit">
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          {content.addLabel}
        </Button>
      </form>
      <p className="text-xs leading-relaxed text-text-tertiary">
        当前网页版需要粘贴完整路径。路径只保存在这台电脑上。
      </p>

      <SettingsCard>
        {entries.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-text-secondary">
            <Icon size={16} />
            {content.empty}
          </div>
        ) : (
          entries.map((entry) => {
            const removing = busyPath === entry.path;
            return (
              <div className="flex items-center gap-3 px-4 py-3" key={entry.path}>
                <Icon className="shrink-0 text-text-secondary" size={16} />
                <span className="min-w-0 flex-1 break-all font-mono text-sm text-text-primary">
                  {entry.path}
                </span>
                <PathStatus available={entry.available} />
                <Button
                  aria-label={`移除 ${entry.path}`}
                  className="h-8 w-8 shrink-0 text-text-secondary hover:bg-danger-subtle-bg hover:text-danger"
                  disabled={removing}
                  onClick={() => onRemove(entry.path)}
                  size="icon"
                  title="移除"
                  type="button"
                  variant="ghost"
                >
                  {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </div>
            );
          })
        )}
      </SettingsCard>
    </SettingsSection>
  );
}

export function ProjectFilesSettings() {
  const projectId = useAtomValue(currentProjectIdAtom);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadConfig = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (!projectId) {
      setConfig(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextConfig = await getProjectConfig(projectId);
      if (requestId === loadRequestRef.current) setConfig(nextConfig);
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const addPath = async (kind: PathKind, path: string) => {
    if (!projectId) return;
    try {
      const nextConfig = kind === 'folder'
        ? await addAttachedDirectory(projectId, path)
        : await addAttachedFile(projectId, path);
      setConfig(nextConfig);
      showToast(`${kind === 'folder' ? '文件夹' : '文件'}已添加`, 'success');
    } catch (err) {
      showToast(`添加失败：${(err as Error).message}`, 'error');
      throw err;
    }
  };

  const removePath = async (kind: PathKind, path: string) => {
    if (!projectId || busyPath) return;
    setBusyPath(path);
    try {
      const nextConfig = kind === 'folder'
        ? await removeAttachedDirectory(projectId, path)
        : await removeAttachedFile(projectId, path);
      setConfig(nextConfig);
      showToast(`${kind === 'folder' ? '文件夹' : '文件'}已移除`, 'success');
    } catch (err) {
      showToast(`移除失败：${(err as Error).message}`, 'error');
    } finally {
      setBusyPath(null);
    }
  };

  if (!projectId) {
    return (
      <SettingsSection description="设置 Agent 可以读取的项目外部资料。" title="项目文件">
        <SettingsCard divided={false}>
          <div className="px-6 py-10 text-center">
            <HardDrive className="mx-auto text-text-tertiary" size={28} />
            <p className="mt-3 text-sm font-medium text-text-primary">请先选择一个项目</p>
            <p className="mt-1 text-sm text-text-secondary">在左侧项目列表中选中项目后，再配置它可以访问的资料。</p>
          </div>
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
        <Loader2 className="animate-spin" size={18} />
        正在读取项目文件设置...
      </div>
    );
  }

  if (error && !config) {
    return (
      <SettingsSection description="设置 Agent 可以读取的项目外部资料。" title="项目文件">
        <SettingsCard divided={false}>
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <AlertCircle className="text-danger" size={28} />
            <p className="mt-3 text-sm font-medium text-text-primary">项目文件设置加载失败</p>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
            <Button className="mt-4" onClick={loadConfig} size="sm" type="button" variant="outline">
              <RefreshCw />
              重试
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-8">
      <SettingsSection
        description="这些位置会加入 Agent 的可读取范围；Contour 不会复制或移动原文件。"
        title="项目文件"
      >
        <SettingsCard divided={false}>
          <div className="flex items-start gap-3 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle-bg text-accent-subtle-text">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">项目文件夹</p>
              <p className="mt-1 break-all font-mono text-sm text-text-secondary">{config.projectDir}</p>
              <p className="mt-1 text-xs text-text-tertiary">项目自身的文件始终可用，不需要重复添加。</p>
            </div>
          </div>
        </SettingsCard>
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-danger-subtle-bg px-3 py-2 text-sm text-danger-subtle-text">
            <span>刷新失败：{error}。当前仍显示上一次成功读取的内容。</span>
            <Button onClick={loadConfig} size="sm" type="button" variant="ghost">
              <RefreshCw />
              重试
            </Button>
          </div>
        )}
      </SettingsSection>

      <PathSection
        busyPath={busyPath}
        entries={config.attachedDirectories}
        kind="folder"
        onAdd={(path) => addPath('folder', path)}
        onRemove={(path) => removePath('folder', path)}
      />
      <PathSection
        busyPath={busyPath}
        entries={config.attachedFiles}
        kind="file"
        onAdd={(path) => addPath('file', path)}
        onRemove={(path) => removePath('file', path)}
      />
    </div>
  );
}
