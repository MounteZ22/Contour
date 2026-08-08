import type { ProjectLoader } from '../vault/loader.js';
import { validateId } from '../vault/validate.js';
import type { Flow, ProjectDoc } from '@contour/shared';

export function createVaultTools(loader: Pick<ProjectLoader, 'loadProjects'>) {
  async function scopedProjects(projectId?: string) {
    const projects = await loader.loadProjects();
    return projectId ? projects.filter((project) => project.projectId === projectId) : projects;
  }

  async function getFlowDetail(flowId: string, projectId?: string): Promise<string> {
    validateId(flowId, 'flowId');
    const flow = (await scopedProjects(projectId)).flatMap((project) => project.flows).find((item) => item.flowId === flowId);
    return flow ? formatFlow(flow) : JSON.stringify({ error: `Flow "${flowId}" 不存在` });
  }

  async function searchFlows(query: string, projectId?: string): Promise<string> {
    if (!query || typeof query !== 'string') return JSON.stringify({ error: '搜索关键词不能为空' });
    const q = query.toLowerCase();
    const matches = (await scopedProjects(projectId)).flatMap((project) => project.flows).filter((flow) =>
      flow.title.toLowerCase().includes(q) || flow.summary.toLowerCase().includes(q) || flow.tags.some((tag) => tag.toLowerCase().includes(q)) || flow.flowId.toLowerCase().includes(q));
    if (matches.length === 0) return JSON.stringify({ results: [], message: `未找到匹配 "${query}" 的 Flow` });
    return JSON.stringify({ results: matches.map((flow) => ({ flowId: flow.flowId, title: flow.title, status: flow.status, summary: flow.summary, tags: flow.tags, openUncertainties: flow.openUncertainties, sectionCount: flow.sections.length })) }, null, 2);
  }

  async function getDoc(docId: string, projectId?: string): Promise<string> {
    validateId(docId, 'docId');
    const doc = (await scopedProjects(projectId)).flatMap((project) => project.docs).find((item) => item.id === docId);
    return doc ? formatDoc(doc) : JSON.stringify({ error: `文档 "${docId}" 不存在` });
  }

  return { getFlowDetail, searchFlows, getDoc };
}

function formatFlow(flow: Flow): string {
  let result = `# ${flow.title} (${flow.flowId})\n- 状态：${flow.status}\n- 摘要：${flow.summary}\n- 标签：${flow.tags.join(', ') || '无'}\n- 未解决问题：${flow.openUncertainties.join(', ') || '无'}\n\n- 附件：${flow.attachments.join(', ') || '无'}\n- 外部链接：${flow.links.map((link) => `${link.label} (${link.path})`).join(', ') || '无'}\n\n`;
  for (const section of flow.sections) result += `## ${section.title}\n${section.content}\n\n`;
  return result;
}

function formatDoc(doc: ProjectDoc): string {
  return `# ${doc.title} (${doc.id})\n${doc.tags?.length ? `- 标签：${doc.tags.join(', ')}\n` : ''}- 摘要：${doc.summary}\n\n${doc.content}`;
}

export type VaultTools = ReturnType<typeof createVaultTools>;
