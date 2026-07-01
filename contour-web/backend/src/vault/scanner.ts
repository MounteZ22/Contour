import fs from 'node:fs/promises';
import path from 'node:path';
import type { Claim, Flow, FlowSection, ProjectData, ProjectDoc } from '../types.js';
import { getString, getStringArray, parseMarkdownFile } from './parser.js';

export async function scanAllProjects(vaultsDir: string, legacyVault: string): Promise<ProjectData[]> {
  const projects: ProjectData[] = [];

  // 1. 扫描 vaults/ 多项目目录
  try {
    const entries = await fs.readdir(vaultsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('PRJ_')) {
        const project = await scanProject(path.join(vaultsDir, entry.name));
        if (project) projects.push(project);
      }
    }
  } catch {
    // vaults/ 不存在，忽略
  }

  // 2. 始终同时读取 legacy example_vault 作为演示/示例项目
  const legacy = await scanProject(legacyVault);
  if (legacy) {
    legacy.projectId = 'PRJ_001';
    // 避免 ID 冲突：如果 vaults 里已有 PRJ_001，跳过 legacy
    const exists = projects.some((p) => p.projectId === legacy.projectId);
    if (!exists) {
      projects.push(legacy);
    }
  }

  return projects;
}

async function scanProject(projectDir: string): Promise<ProjectData | null> {
  const basename = path.basename(projectDir);
  const parts = basename.split('_');
  const projectId = (parts.length >= 2 ? `${parts[0]}_${parts[1]}` : parts[0]) || 'PRJ_001';

  let title = 'Untitled Project';
  let researchGoal = '';
  let currentStage = '';
  const docs: ProjectDoc[] = [];

  // 扫描 project/ 目录
  const projectDocsDir = path.join(projectDir, 'project');
  try {
    const files = await fs.readdir(projectDocsDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(projectDocsDir, file);
      const parsed = await parseMarkdownFile(filePath);
      if (!parsed) continue;

      const docId = file.replace(/\.md$/, '');
      const docTitle = parsed.title || docId;

      if (docId === 'project_brief') {
        // 从 project_brief.md 内容中提取项目信息
        const { extractedTitle, extractedGoal, extractedStage } = extractProjectBrief(parsed.content);
        title = extractedTitle || docTitle;
        researchGoal = extractedGoal;
        currentStage = extractedStage;
      }

      docs.push({
        id: docId,
        title: docTitle,
        type: inferDocType(docId),
        content: parsed.content,
        summary: makeSummary(parsed.content),
      });
    }
  } catch {
    // project/ 目录不存在
  }

  // 扫描 flows/ 目录
  const flows: Flow[] = [];
  const flowsDir = path.join(projectDir, 'flows');
  try {
    const entries = await fs.readdir(flowsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const flow = await scanFlow(path.join(flowsDir, entry.name));
      if (flow) flows.push(flow);
    }
  } catch {
    // flows/ 目录不存在
  }

  // 扫描 claims/ 目录
  const claims: Claim[] = [];
  const claimsDir = path.join(projectDir, 'claims');
  try {
    const files = await fs.readdir(claimsDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const claim = await scanClaim(path.join(claimsDir, file));
      if (claim) claims.push(claim);
    }
  } catch {
    // claims/ 目录不存在
  }

  return {
    projectId,
    title,
    researchGoal,
    currentStage,
    docs,
    flows,
    claims,
  };
}

async function scanFlow(flowDir: string): Promise<Flow | null> {
  const flowId = path.basename(flowDir).split('_')[0] || '';
  const flowMdPath = path.join(flowDir, 'flow.md');

  const flowMd = await parseMarkdownFile(flowMdPath);
  if (!flowMd) {
    console.warn(`[scanner] missing flow.md in ${flowDir}, skipping`);
    return null;
  }

  const fm = flowMd.frontmatter;
  const sectionsDir = path.join(flowDir, 'sections');
  let hasSectionsDir = false;
  try {
    const stat = await fs.stat(sectionsDir);
    hasSectionsDir = stat.isDirectory();
  } catch {
    hasSectionsDir = false;
  }

  let sections: FlowSection[] = [];

  if (hasSectionsDir) {
    // 新版：sections/ 子目录
    try {
      const files = await fs.readdir(sectionsDir);
      const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
      for (const file of mdFiles) {
        const parsed = await parseMarkdownFile(path.join(sectionsDir, file));
        if (!parsed) continue;
        const sectionId = file.replace(/\.md$/, '');
        sections.push({
          id: sectionId,
          title: parsed.title || sectionId,
          filename: file,
          content: parsed.content,
        });
      }
    } catch {
      // ignore
    }
  } else {
    // 旧版兼容：flow.md 正文作为 sections[0]，其他 .md 文件作为额外 sections
    sections.push({
      id: 'flow',
      title: 'Flow Overview',
      filename: 'flow.md',
      content: flowMd.content,
    });

    try {
      const files = await fs.readdir(flowDir);
      const mdFiles = files
        .filter((f) => f.endsWith('.md') && f !== 'flow.md' && f !== 'context_summary.md')
        .sort();
      for (const file of mdFiles) {
        const parsed = await parseMarkdownFile(path.join(flowDir, file));
        if (!parsed) continue;
        const sectionId = file.replace(/\.md$/, '');
        sections.push({
          id: sectionId,
          title: parsed.title || sectionId,
          filename: file,
          content: parsed.content,
        });
      }
    } catch {
      // ignore
    }
  }

  // 读取 context_summary.md，限制长度
  let summary = '';
  try {
    const summaryParsed = await parseMarkdownFile(path.join(flowDir, 'context_summary.md'));
    if (summaryParsed) {
      const text = summaryParsed.content.replace(/#+\s+.*\n/g, '').trim();
      summary = text.length > 200 ? text.slice(0, 200) + '...' : text;
    }
  } catch {
    // ignore
  }

  const posX = fm['position_x'];
  const posY = fm['position_y'];
  const position = (typeof posX === 'number' && typeof posY === 'number')
    ? { x: posX, y: posY }
    : undefined;

  return {
    flowId: getString(fm, 'flow_id', flowId),
    title: getString(fm, 'title', flowMd.title || flowId),
    status: getString(fm, 'status', 'in_progress') as Flow['status'],
    type: getString(fm, 'stage', 'general'),
    created: getString(fm, 'created', ''),
    updated: getString(fm, 'updated', ''),
    parentFlows: getStringArray(fm, 'parent_flows'),
    linkedClaims: getStringArray(fm, 'related_claims'),
    tags: getStringArray(fm, 'tags'),
    openUncertainties: getStringArray(fm, 'open_uncertainties'),
    summary,
    sections,
    position,
  };
}

async function scanClaim(filePath: string): Promise<Claim | null> {
  const parsed = await parseMarkdownFile(filePath);
  if (!parsed) return null;

  const fm = parsed.frontmatter;
  const content = parsed.content;
  const title = parsed.title || path.basename(filePath, '.md');

  return {
    claimId: getString(fm, 'claim_id', path.basename(filePath, '.md')),
    title,
    content,
    confidence: (getString(fm, 'confidence', 'medium') as Claim['confidence']),
    status: (getString(fm, 'status', 'tentative') as Claim['status']),
    tags: getStringArray(fm, 'tags'),
  };
}

function extractProjectBrief(content: string): { extractedTitle: string; extractedGoal: string; extractedStage: string } {
  let extractedTitle = '';
  let extractedGoal = '';
  let extractedStage = '';

  // 提取第一个 H1 作为标题
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) extractedTitle = h1Match[1].trim();

  // 提取 Research Goal 段落
  const goalMatch = content.match(/##\s+Research Goal\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (goalMatch) extractedGoal = goalMatch[1].trim();

  // 提取 Current Stage 段落
  const stageMatch = content.match(/##\s+Current Stage\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (stageMatch) extractedStage = stageMatch[1].trim();

  return { extractedTitle, extractedGoal, extractedStage };
}

function inferDocType(docId: string): string {
  if (docId.includes('brief') || docId.includes('overview')) return 'project_overview';
  if (docId.includes('question')) return 'question_set';
  if (docId.includes('terminology') || docId.includes('glossary')) return 'glossary';
  return 'background';
}

function makeSummary(content: string): string {
  // 取第一段非空文本，限制长度
  const paragraphs = content
    .replace(/#+\s+.*/g, '')
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const first = paragraphs[0] || '';
  return first.length > 120 ? first.slice(0, 120) + '...' : first;
}
