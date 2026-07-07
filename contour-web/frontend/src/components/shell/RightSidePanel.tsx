import { useMemo, useState } from 'react';
import { PanelRightClose } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useAtom } from 'jotai';
import { Button } from '../ui/button';
import { FileTree, type FileTreeNode } from '../agent/FileTree';
import { rightPanelOpenAtom, rightPanelWidthAtom } from '../../state/shell';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import type { AIContextItem, Claim, Flow, ProjectData, ProjectDoc } from '../../types';

type PanelTab = 'session' | 'project';

function flowToTree(flow: Flow, prefix: string): FileTreeNode {
  return {
    id: `${prefix}:flow:${flow.flowId}`,
    name: `${flow.flowId} · ${flow.title}`,
    path: `flows/${flow.flowId}`,
    children: [
      {
        id: `${prefix}:flow:${flow.flowId}:summary`,
        name: 'summary.md',
        path: `flows/${flow.flowId}/summary.md`,
        content: `# ${flow.title}\n\n${flow.summary || '暂无摘要。'}`,
      },
      ...flow.sections.map((section) => ({
        id: `${prefix}:flow:${flow.flowId}:section:${section.id}`,
        name: section.filename || `${section.title}.md`,
        path: `flows/${flow.flowId}/${section.filename || section.id}`,
        content: section.content,
      })),
    ],
  };
}

function docToTree(doc: ProjectDoc, prefix: string): FileTreeNode {
  return {
    id: `${prefix}:doc:${doc.id}`,
    name: `${doc.title}.md`,
    path: `docs/${doc.id}.md`,
    content: doc.content,
  };
}

function buildProjectFiles(project: ProjectData): FileTreeNode[] {
  return [
    {
      id: 'project:flows',
      name: 'Flows',
      path: 'flows',
      children: project.flows.map((flow) => flowToTree(flow, 'project')),
    },
    {
      id: 'project:docs',
      name: 'Background',
      path: 'docs',
      children: project.docs.map((doc) => docToTree(doc, 'project')),
    },
    {
      id: 'project:claims',
      name: 'Claims',
      path: 'claims',
      children: project.claims.map((claim) => ({
        id: `project:claim:${claim.claimId}`,
        name: `${claim.claimId}.md`,
        path: `claims/${claim.claimId}.md`,
        content: `# ${claim.title}\n\n${claim.content}`,
      })),
    },
  ];
}

function claimToTree(claim: Claim, prefix: string): FileTreeNode {
  return {
    id: `${prefix}:claim:${claim.claimId}`,
    name: `${claim.claimId}.md`,
    path: `claims/${claim.claimId}.md`,
    content: `# ${claim.title}\n\n${claim.content}`,
  };
}

function buildSessionFiles(project: ProjectData, contextItems: AIContextItem[]): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];

  for (const item of contextItems) {
    if (item.type === 'flow') {
      const flow = project.flows.find((candidate) => candidate.flowId === item.id);
      if (flow) nodes.push(flowToTree(flow, 'session'));
    } else if (item.type === 'claim') {
      const claim = project.claims.find((candidate) => candidate.claimId === item.id);
      if (claim) nodes.push(claimToTree(claim, 'session'));
    } else {
      const doc = project.docs.find((candidate) => candidate.id === item.id);
      if (doc) nodes.push(docToTree(doc, 'session'));
    }
  }

  return nodes;
}

export function RightSidePanel({ project }: { project: ProjectData }) {
  const { sessionId } = useParams();
  const { getSession } = useAgentSessions();
  const [tab, setTab] = useState<PanelTab>('session');
  const [, setRightPanelOpen] = useAtom(rightPanelOpenAtom);
  const [rightPanelWidth] = useAtom(rightPanelWidthAtom);
  const session = getSession(sessionId);

  const sessionFiles = useMemo(
    () => buildSessionFiles(project, session?.contextItems ?? []),
    [project, session?.contextItems],
  );
  const projectFiles = useMemo(() => buildProjectFiles(project), [project]);

  return (
    <aside
      className="h-screen shrink-0 border-l border-border bg-surface flex flex-col transition-[width] duration-200"
      style={{ width: rightPanelWidth }}
    >
      <header className="h-12 shrink-0 border-b border-border px-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-accent-strong">Files</p>
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
              tab === 'session' ? 'bg-surface-raised text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setTab('session')}
            type="button"
          >
            会话文件
          </button>
          <button
            className={`h-8 rounded-[4px] text-xs font-medium transition-colors ${
              tab === 'project' ? 'bg-surface-raised text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setTab('project')}
            type="button"
          >
            项目文件
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {tab === 'session' ? (
          <FileTree nodes={sessionFiles} emptyText="当前会话还没有上下文文件。可以在 Contour 视图多选 Flow / 文档后开始讨论。" />
        ) : (
          <FileTree nodes={projectFiles} emptyText="当前项目还没有可展示的文件。" />
        )}
      </div>
    </aside>
  );
}
