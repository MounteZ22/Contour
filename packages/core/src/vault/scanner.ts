import fs from 'node:fs/promises';
import path from 'node:path';
import type { Claim, Flow, FlowSection, ProjectData, ProjectDoc } from '@contour/shared';
import { getFlowLinks, getString, getStringArray, parseMarkdownFile } from './parser.js';

const FLOW_SUMMARY_FILE = 'flow_summary.md';
const LEGACY_FLOW_SUMMARY_FILE = 'context_summary.md';

export async function scanAllProjects(vaultsDir: string, legacyVault: string): Promise<ProjectData[]> {
  const projects: ProjectData[] = [];

  // 1. 扫描 vaults/ 多项目目录
  try {
    const entries = await fs.readdir(vaultsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
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
    const exists = projects.some((p) => p.projectId === legacy.projectId);
    if (!exists) {
      projects.push(legacy);
    }
  }

  return projects;
}

async function scanProject(projectDir: string): Promise<ProjectData | null> {
  // 目录不存在时直接跳过（避免遗留的 legacy_vault 路径产生幽灵项目）
  try {
    const stat = await fs.stat(projectDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  const basename = path.basename(projectDir);
  const projectId = basename;
  const title = basename.replace(/_/g, ' ');
  const docs: ProjectDoc[] = [];

  // 扫描 background/ 目录
  const projectDocsDir = path.join(projectDir, 'background');
  try {
    const files = await fs.readdir(projectDocsDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(projectDocsDir, file);
      const parsed = await parseMarkdownFile(filePath);
      if (!parsed) continue;

      const docId = file.replace(/\.md$/, '');
      const docTitle = parsed.title || docId;
      const fm = parsed.frontmatter;

      docs.push({
        id: docId,
        title: docTitle,
        content: parsed.content,
        summary: makeSummary(parsed.content),
        tags: getStringArray(fm, 'tags'),
      });
    }
  } catch {
    // background/ 目录不存在
  }

  // 扫描 flows/ 目录
  const flows: Flow[] = [];
  const flowsDir = path.join(projectDir, 'flows');
  try {
    if (await isSafeDirectory(projectDir, flowsDir)) {
      const entries = await fs.readdir(flowsDir, { withFileTypes: true });
      const scannedIds = new Set<string>();
      for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
        const flowDir = path.join(flowsDir, entry.name);
        if (!(await isSafeDirectory(flowsDir, flowDir))) continue;
        const flow = await scanFlow(flowDir);
        if (flow) {
          flows.push(flow);
          scannedIds.add(flow.flowId);
        }
      }
      for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith('.md'))) {
        const flowFile = path.join(flowsDir, entry.name);
        if (!(await isSafeFile(flowsDir, flowFile))) continue;
        const flow = await scanLegacyFlowFile(flowFile);
        if (flow && !scannedIds.has(flow.flowId)) flows.push(flow);
      }
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
    researchGoal: '',
    currentStage: '',
    projectDir,
    docs,
    flows,
    claims,
  };
}

async function scanFlow(flowDir: string): Promise<Flow | null> {
  const flowId = path.basename(flowDir).split('_')[0] || '';
  const flowMdPath = path.join(flowDir, 'flow.md');

  if (!(await isSafeFile(flowDir, flowMdPath))) return null;
  const flowMd = await parseMarkdownFile(flowMdPath);
  if (!flowMd) {
    console.warn(`[scanner] missing flow.md in ${flowDir}, skipping`);
    return null;
  }

  const fm = flowMd.frontmatter;
  const sectionsDir = path.join(flowDir, 'sections');
  const hasSectionsDir = await isSafeDirectory(flowDir, sectionsDir);

  let sections: FlowSection[] = [];

  if (hasSectionsDir) {
    // 新版：sections/ 子目录
    try {
      const files = await fs.readdir(sectionsDir);
      const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
      for (const file of mdFiles) {
        const sectionFile = path.join(sectionsDir, file);
        if (!(await isSafeFile(sectionsDir, sectionFile))) continue;
        const parsed = await parseMarkdownFile(sectionFile);
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
        .filter((f) => f.endsWith('.md') && f !== 'flow.md' && f !== FLOW_SUMMARY_FILE && f !== LEGACY_FLOW_SUMMARY_FILE)
        .sort();
      for (const file of mdFiles) {
        const sectionFile = path.join(flowDir, file);
        if (!(await isSafeFile(flowDir, sectionFile))) continue;
        const parsed = await parseMarkdownFile(sectionFile);
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

  // 读取新摘要文件；旧项目没有新文件时兼容读取旧名称。
  let summary = '';
  const preferredSummaryPath = path.join(flowDir, FLOW_SUMMARY_FILE);
  const summaryFiles = await pathEntryExists(preferredSummaryPath)
    ? [FLOW_SUMMARY_FILE]
    : [LEGACY_FLOW_SUMMARY_FILE];
  for (const summaryFile of summaryFiles) {
    const summaryPath = path.join(flowDir, summaryFile);
    if (!(await isSafeFile(flowDir, summaryPath))) continue;
    try {
      const summaryParsed = await parseMarkdownFile(summaryPath);
      if (summaryParsed) {
        const text = summaryParsed.content.replace(/#+\s+.*\n/g, '').trim();
        summary = text.length > 200 ? text.slice(0, 200) + '...' : text;
        break;
      }
    } catch {
      // ignore
    }
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
    attachments: await scanAttachments(flowDir),
    links: getFlowLinks(fm),
    sections,
    position,
  };
}

async function scanAttachments(flowDir: string): Promise<string[]> {
  try {
    const attachmentsDir = path.join(flowDir, 'attachments');
    const stats = await fs.lstat(attachmentsDir);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return [];
    const entries = await fs.readdir(attachmentsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    // 旧 Flow 没有 attachments/ 时视为空列表，不主动修改磁盘。
    return [];
  }
}

async function scanLegacyFlowFile(filePath: string): Promise<Flow | null> {
  if (!(await isSafeFile(path.dirname(filePath), filePath))) return null;
  const parsed = await parseMarkdownFile(filePath);
  if (!parsed) return null;

  const fm = parsed.frontmatter;
  const fallbackId = path.basename(filePath, '.md').split('_')[0] || '';
  const flowId = getString(fm, 'flow_id', fallbackId);
  return {
    flowId,
    title: getString(fm, 'title', parsed.title || flowId),
    status: getString(fm, 'status', 'in_progress') as Flow['status'],
    type: getString(fm, 'stage', 'general'),
    created: getString(fm, 'created', ''),
    updated: getString(fm, 'updated', ''),
    parentFlows: getStringArray(fm, 'parent_flows'),
    linkedClaims: getStringArray(fm, 'related_claims'),
    tags: getStringArray(fm, 'tags'),
    openUncertainties: getStringArray(fm, 'open_uncertainties'),
    summary: makeSummary(parsed.content),
    attachments: [],
    links: getFlowLinks(fm),
    sections: [{
      id: 'flow',
      title: parsed.title || flowId,
      filename: path.basename(filePath),
      content: parsed.content,
    }],
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

async function isSafeDirectory(parentDir: string, targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    return isWithinDirectory(await fs.realpath(parentDir), await fs.realpath(targetPath));
  } catch {
    return false;
  }
}

async function isSafeFile(parentDir: string, targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isFile() || stats.isSymbolicLink()) return false;
    return isWithinDirectory(await fs.realpath(parentDir), await fs.realpath(targetPath));
  } catch {
    return false;
  }
}

function isWithinDirectory(parentDir: string, targetPath: string): boolean {
  const relative = path.relative(parentDir, targetPath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function pathEntryExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}
