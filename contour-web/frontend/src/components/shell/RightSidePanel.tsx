import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Loader2, PanelRightClose } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useAtom } from 'jotai';
import { Button } from '../ui/button';
import { FileTree, type FileTreeNode } from '../agent/FileTree';
import { rightPanelOpenAtom, rightPanelWidthAtom } from '../../state/shell';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import { getProjectConfig } from '../../state/projectConfig';
import {
  findFlowEntry,
  hostBasename,
  joinHostPath,
  listDirectory,
  type FileEntry,
} from '../../state/fileBrowser';
import type { AIContextItem, Claim, Flow, ProjectConfig, ProjectData, ProjectDoc } from '../../types';

type PanelTab = 'session' | 'project';

function fileNode(entry: FileEntry, prefix: string, flowId?: string): FileTreeNode {
  return {
    id: `${prefix}:${entry.path}`,
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    lazy: entry.kind === 'directory',
    loadType: entry.kind === 'directory' ? 'directory' : undefined,
    flowId,
  };
}

function flowToTree(flow: Flow, flowsPath: string, prefix: string): FileTreeNode {
  return {
    id: `${prefix}:flow:${flow.flowId}`,
    name: `${flow.flowId} · ${flow.title}`,
    path: flowsPath,
    kind: 'directory',
    flowId: flow.flowId,
    lazy: true,
    loadType: 'flow',
    actions: false,
    flowAttachments: flow.attachments,
    flowLinks: flow.links,
  };
}

function docToTree(doc: ProjectDoc, projectDir: string, prefix: string): FileTreeNode {
  return {
    id: `${prefix}:doc:${doc.id}`,
    name: `${doc.title}.md`,
    path: joinHostPath(joinHostPath(projectDir, 'background'), `${doc.id}.md`),
    kind: 'file',
  };
}

function claimToTree(claim: Claim, projectDir: string, prefix: string): FileTreeNode {
  return {
    id: `${prefix}:claim:${claim.claimId}`,
    name: `${claim.claimId}.md`,
    path: joinHostPath(joinHostPath(projectDir, 'claims'), `${claim.claimId}.md`),
    kind: 'file',
  };
}

function buildProjectFiles(project: ProjectData, config: ProjectConfig): FileTreeNode[] {
  if (!config.projectDir) return [];
  const prefix = `${project.projectId}:project`;

  const roots: FileTreeNode[] = [{
    id: `${prefix}:vault`,
    name: `Vault · ${project.title}`,
    path: config.projectDir,
    kind: 'directory',
    lazy: true,
    loadType: 'vault',
  }];

  if (config.attachedDirectories.length > 0) {
    roots.push({
      id: `${prefix}:attached-directories`,
      name: '附加文件夹',
      path: '',
      kind: 'directory',
      actions: false,
      defaultExpanded: true,
      children: config.attachedDirectories.map((entry) => ({
        id: `${prefix}:attached-directory:${entry.path}`,
        name: hostBasename(entry.path),
        path: entry.path,
        kind: 'directory',
        available: entry.available,
        lazy: entry.available,
        loadType: entry.available ? 'directory' : undefined,
      })),
    });
  }

  if (config.attachedFiles.length > 0) {
    roots.push({
      id: `${prefix}:attached-files`,
      name: '附加文件',
      path: '',
      kind: 'directory',
      actions: false,
      defaultExpanded: true,
      children: config.attachedFiles.map((entry) => ({
        id: `${prefix}:attached-file:${entry.path}`,
        name: hostBasename(entry.path),
        path: entry.path,
        kind: 'file',
        available: entry.available,
      })),
    });
  }

  return roots;
}

function buildSessionFiles(
  project: ProjectData,
  config: ProjectConfig,
  contextItems: AIContextItem[],
): FileTreeNode[] {
  if (!config.projectDir) return [];
  const flowsPath = joinHostPath(config.projectDir, 'flows');
  const prefix = `${project.projectId}:session`;
  const nodes: FileTreeNode[] = [];

  for (const item of contextItems) {
    if (item.type === 'flow') {
      const flow = project.flows.find((candidate) => candidate.flowId === item.id);
      if (flow) nodes.push(flowToTree(flow, flowsPath, prefix));
    } else if (item.type === 'claim') {
      const claim = project.claims.find((candidate) => candidate.claimId === item.id);
      if (claim) nodes.push(claimToTree(claim, config.projectDir, prefix));
    } else {
      const doc = project.docs.find((candidate) => candidate.id === item.id);
      if (doc) nodes.push(docToTree(doc, config.projectDir, prefix));
    }
  }

  return nodes;
}

export function buildFlowChildren(node: FileTreeNode, entry: FileEntry): FileTreeNode[] {
  const flowId = node.flowId ?? node.name.split(' · ')[0];
  if (entry.kind === 'file') {
    return [{
      id: `${node.id}:flow-md`,
      name: 'flow.md',
      path: entry.path,
      kind: 'file',
      flowId,
    }];
  }

  const attachmentsPath = joinHostPath(entry.path, 'attachments');
  return [
    {
      id: `${node.id}:flow-md`,
      name: 'flow.md',
      path: joinHostPath(entry.path, 'flow.md'),
      kind: 'file',
      flowId,
    },
    {
      id: `${node.id}:attachments`,
      name: 'attachments',
      path: attachmentsPath,
      kind: 'directory',
      flowId,
      lazy: (node.flowAttachments?.length ?? 0) > 0,
      loadType: (node.flowAttachments?.length ?? 0) > 0 ? 'directory' : undefined,
      children: (node.flowAttachments?.length ?? 0) > 0 ? undefined : [],
    },
    {
      id: `${node.id}:links`,
      name: '链接文件',
      path: entry.path,
      kind: 'directory',
      actions: false,
      children: (node.flowLinks ?? []).map((link) => ({
        id: `${node.id}:link:${link.path}`,
        name: link.label || hostBasename(link.path),
        path: link.path,
        kind: 'file',
        flowId,
      })),
    },
  ];
}

export function RightSidePanel({ project }: { project: ProjectData }) {
  const { sessionId } = useParams();
  const { getSession } = useAgentSessions();
  const [tab, setTab] = useState<PanelTab>('session');
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [, setRightPanelOpen] = useAtom(rightPanelOpenAtom);
  const [rightPanelWidth] = useAtom(rightPanelWidthAtom);
  const session = getSession(sessionId);

  useEffect(() => {
    let active = true;
    setConfig(null);
    setConfigError(null);
    getProjectConfig(project.projectId)
      .then((nextConfig) => {
        if (active) setConfig(nextConfig);
      })
      .catch((error) => {
        if (active) setConfigError(error instanceof Error ? error.message : '读取项目文件配置失败');
      });
    return () => {
      active = false;
    };
  }, [project.projectId]);

  const loadChildren = useCallback(async (node: FileTreeNode): Promise<FileTreeNode[]> => {
    if (node.loadType === 'vault') {
      const entries = await listDirectory(project.projectId, node.path);
      return entries.map((entry) => {
        if (entry.kind === 'directory' && entry.name.toLowerCase() === 'flows') {
          return {
            id: `${node.id}:flows`,
            name: 'Flows',
            path: entry.path,
            kind: 'directory' as const,
            actions: false,
            children: project.flows.map((flow) => flowToTree(flow, entry.path, `${node.id}:flows`)),
          };
        }
        return fileNode(entry, node.id);
      });
    }
    if (node.loadType === 'flow') {
      const flowId = node.flowId ?? node.name.split(' · ')[0];
      const entry = findFlowEntry(await listDirectory(project.projectId, node.path), flowId);
      if (!entry) throw new Error(`找不到 ${flowId} 的文件目录`);
      return buildFlowChildren(node, entry);
    }
    const entries = await listDirectory(project.projectId, node.path, node.flowId);
    return entries.map((entry) => fileNode(entry, node.id, node.flowId));
  }, [project, project.projectId]);

  const sessionFiles = useMemo(
    () => config ? buildSessionFiles(project, config, session?.contextItems ?? []) : [],
    [config, project, session?.contextItems],
  );
  const projectFiles = useMemo(
    () => config ? buildProjectFiles(project, config) : [],
    [config, project],
  );

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex h-screen w-full max-w-[420px] shrink-0 flex-col bg-surface shadow-lg transition-[width] duration-200 md:static md:z-auto md:max-w-none md:w-[var(--right-panel-width)]"
      style={{ '--right-panel-width': `${rightPanelWidth}px` } as CSSProperties}
    >
      <header className="h-12 shrink-0 border-b border-border px-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-normal text-accent-strong">Files</p>
          <h2 className="font-headline text-[14px] font-semibold text-text-primary">文件面板</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setRightPanelOpen(false)}
          title="收起文件面板"
          type="button"
        >
          <PanelRightClose size={16} />
        </Button>
      </header>

      <div className="p-3 border-b border-border">
        <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-surface-sunken p-1">
          <button
            className={`h-8 rounded-[4px] text-xs font-medium transition-colors ${
              tab === 'session' ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setTab('session')}
            type="button"
          >
            会话文件
          </button>
          <button
            className={`h-8 rounded-[4px] text-xs font-medium transition-colors ${
              tab === 'project' ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setTab('project')}
            type="button"
          >
            项目文件
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {!config && !configError && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-text-secondary">
            <Loader2 size={14} className="animate-spin" />
            正在读取文件目录
          </div>
        )}
        {configError && (
          <div className="rounded-[6px] bg-error/10 p-3 text-xs leading-relaxed text-error">{configError}</div>
        )}
        {config && tab === 'session' && (
          <FileTree
            nodes={sessionFiles}
            emptyText="当前会话还没有上下文文件。可以在 Contour 视图多选 Flow / 文档后开始讨论。"
            projectId={project.projectId}
            loadChildren={loadChildren}
          />
        )}
        {config && tab === 'project' && (
          <FileTree
            nodes={projectFiles}
            emptyText="当前项目还没有可展示的文件。"
            projectId={project.projectId}
            loadChildren={loadChildren}
          />
        )}
      </div>
    </aside>
  );
}
