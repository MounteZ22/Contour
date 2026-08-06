import { CONFIG } from '../config.js';
import { loadProjects } from '../vault/loader.js';
import { validateId } from '../vault/validate.js';
import type { Flow, ProjectDoc } from '@contour/shared';

async function scopedProjects(projectId?: string) {
  const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
  return projectId ? projects.filter((project) => project.projectId === projectId) : projects;
}

/** 读取指定 Flow 的完整内容 */
export async function getFlowDetail(flowId: string, projectId?: string): Promise<string> {
  validateId(flowId, 'flowId');

  const projects = await scopedProjects(projectId);
  const flow = projects.flatMap((p) => p.flows).find((f) => f.flowId === flowId);

  if (!flow) {
    return JSON.stringify({ error: `Flow "${flowId}" 不存在` });
  }

  return formatFlow(flow);
}

/** 按关键词搜索 Flow */
export async function searchFlows(query: string, projectId?: string): Promise<string> {
  if (!query || typeof query !== 'string') {
    return JSON.stringify({ error: '搜索关键词不能为空' });
  }

  const projects = await scopedProjects(projectId);
  const allFlows = projects.flatMap((p) => p.flows);
  const q = query.toLowerCase();

  const matches = allFlows.filter(
    (f) =>
      f.title.toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q) ||
      f.tags.some((t) => t.toLowerCase().includes(q)) ||
      f.flowId.toLowerCase().includes(q),
  );

  if (matches.length === 0) {
    return JSON.stringify({ results: [], message: `未找到匹配 "${query}" 的 Flow` });
  }

  // 返回摘要信息（不含 section 内容，避免过长）
  const summaries = matches.map((f) => ({
    flowId: f.flowId,
    title: f.title,
    status: f.status,
    summary: f.summary,
    tags: f.tags,
    openUncertainties: f.openUncertainties,
    sectionCount: f.sections.length,
  }));

  return JSON.stringify({ results: summaries }, null, 2);
}

/** 读取指定 Doc 的完整内容 */
export async function getDoc(docId: string, projectId?: string): Promise<string> {
  validateId(docId, 'docId');

  const projects = await scopedProjects(projectId);
  const doc = projects.flatMap((p) => p.docs).find((d) => d.id === docId);

  if (!doc) {
    return JSON.stringify({ error: `文档 "${docId}" 不存在` });
  }

  return formatDoc(doc);
}

function formatFlow(flow: Flow): string {
  let result = `# ${flow.title} (${flow.flowId})\n`;
  result += `- 状态：${flow.status}\n`;
  result += `- 摘要：${flow.summary}\n`;
  result += `- 标签：${flow.tags.join(', ') || '无'}\n`;
  result += `- 未解决问题：${flow.openUncertainties.join(', ') || '无'}\n\n`;
  result += `- 附件：${flow.attachments.join(', ') || '无'}\n`;
  result += `- 外部链接：${flow.links.map((link) => `${link.label} (${link.path})`).join(', ') || '无'}\n\n`;

  for (const section of flow.sections) {
    result += `## ${section.title}\n${section.content}\n\n`;
  }

  return result;
}

function formatDoc(doc: ProjectDoc): string {
  let result = `# ${doc.title} (${doc.id})\n`;
  if (doc.tags && doc.tags.length > 0) {
    result += `- 标签：${doc.tags.join(', ')}\n`;
  }
  result += `- 摘要：${doc.summary}\n\n`;
  result += doc.content;
  return result;
}
