import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse, Flow } from '../types.js';
import { invalidateCache, loadProjects } from '../vault/loader.js';

const router = Router();

// GET /api/flows - 所有 flow 列表（不含 sections 全文）
router.get('/', async (_req, res) => {
  try {
    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const flows = projects.flatMap((p) =>
      p.flows.map((f) => ({
        flowId: f.flowId,
        title: f.title,
        status: f.status,
        type: f.type,
        created: f.created,
        updated: f.updated,
        parentFlows: f.parentFlows,
        linkedClaims: f.linkedClaims,
        tags: f.tags,
        openUncertainties: f.openUncertainties,
        summary: f.summary,
      }))
    );
    const response: ApiResponse<{ flows: Omit<Flow, 'sections'>[] }> = { success: true, data: { flows } };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// GET /api/flows/:flowId?projectId=xxx - 单个 flow 完整信息
router.get('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { projectId } = req.query;
    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);

    let flow: Flow | undefined;
    if (projectId && typeof projectId === 'string') {
      const project = projects.find((p) => p.projectId === projectId);
      flow = project?.flows.find((f) => f.flowId === flowId);
    }
    if (!flow) {
      flow = projects.flatMap((p) => p.flows).find((f) => f.flowId === flowId);
    }

    if (!flow) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<Flow> = { success: true, data: flow };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// POST /api/flows - 创建新 flow
router.post('/', async (req, res) => {
  try {
    const { projectId, flowId, title, type, parentFlows } = req.body as {
      projectId?: string;
      flowId?: string;
      title?: string;
      type?: string;
      parentFlows?: string[];
    };

    if (!projectId || !flowId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'projectId, flowId and title are required' };
      res.status(400).json(response);
      return;
    }

    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const project = projects.find((p) => p.projectId === projectId);
    if (!project) {
      const response: ApiResponse<never> = { success: false, error: 'Project not found' };
      res.status(404).json(response);
      return;
    }

    // 确定 flow 目录路径
    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(500).json(response);
      return;
    }

    const flowDir = path.join(projectDir, 'flows', `${flowId}_${title.replace(/\s+/g, '_').toLowerCase()}`);
    await fs.mkdir(flowDir, { recursive: true });
    await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const flowMd = `---
flow_id: ${flowId}
title: ${title}
status: in_progress
stage: ${type || 'general'}
created: "${today}"
updated: "${today}"
parent_flows: ${JSON.stringify(parentFlows || [])}
related_claims: []
related_assets: []
tags: []
---

# ${flowId} ${title}
`;
    const sectionMd = `# ${flowId} ${title}

## 1. Why this flow exists

在此描述本 Flow 的目标和动机。

## 2. Inputs

- 前置 Flow

## 3. What was done

待记录。

## 4. Key observations

待记录。

## 5. Interpretation

待记录。

## 6. Decision

待记录。

## 7. Uncertainties

待记录。

## 8. Next steps

待规划。
`;
    await fs.writeFile(path.join(flowDir, 'flow.md'), flowMd, 'utf-8');
    await fs.writeFile(path.join(flowDir, 'sections', 'flow.md'), sectionMd, 'utf-8');
    await fs.writeFile(path.join(flowDir, 'context_summary.md'), '', 'utf-8');
    await fs.writeFile(path.join(flowDir, 'assets.yaml'), '[]\n', 'utf-8');

    invalidateCache();
    const response: ApiResponse<{ flowId: string }> = { success: true, data: { flowId } };
    res.status(201).json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// PUT /api/flows/:flowId - 更新 flow frontmatter
router.put('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { status } = req.body as { status?: string };

    if (status === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'status is required' };
      res.status(400).json(response);
      return;
    }

    const projectDir = await findProjectDirForFlow(flowId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowsDir = path.join(projectDir, 'flows');
    const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
    const flowDirName = flowEntries.find((e) => e.isDirectory() && e.name.startsWith(flowId))?.name;
    if (!flowDirName) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }
    const flowDir = path.join(flowsDir, flowDirName);

    const flowMdPath = path.join(flowDir, 'flow.md');
    let raw = '';
    try {
      raw = await fs.readFile(flowMdPath, 'utf-8');
    } catch {
      const response: ApiResponse<never> = { success: false, error: 'flow.md not found' };
      res.status(404).json(response);
      return;
    }

    const fmText = extractFrontmatterText(raw);
    if (fmText !== null) {
      let updatedFm = fmText.replace(/^status:.*/m, `status: ${status}`);
      if (!/^status:/m.test(updatedFm)) updatedFm += `\nstatus: ${status}`;
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
      await fs.writeFile(flowMdPath, `---\n${updatedFm}\n---\n${body}`, 'utf-8');
      await updateFlowTimestamp(flowDir);
    }

    invalidateCache();
    const response: ApiResponse<{ status: string }> = { success: true, data: { status } };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// DELETE /api/flows/:flowId - 删除整个 flow
router.delete('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const projectDir = await findProjectDirForFlow(flowId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowsDir = path.join(projectDir, 'flows');
    const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
    const flowDirName = flowEntries.find((e) => e.isDirectory() && e.name.startsWith(flowId))?.name;
    if (!flowDirName) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

    await fs.rm(path.join(flowsDir, flowDirName), { recursive: true, force: true });
    invalidateCache();
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// DELETE /api/flows/:flowId/sections/:sectionId - 删除 section
router.delete('/:flowId/sections/:sectionId', async (req, res) => {
  try {
    const { flowId, sectionId } = req.params;
    const projectDir = await findProjectDirForFlow(flowId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowsDir = path.join(projectDir, 'flows');
    const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
    const flowDirName = flowEntries.find((e) => e.isDirectory() && e.name.startsWith(flowId))?.name;
    if (!flowDirName) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }
    const flowDir = path.join(flowsDir, flowDirName);

    let targetFile: string;
    const sectionsDir = path.join(flowDir, 'sections');
    const hasSectionsDir = await fs.stat(sectionsDir).then((s) => s.isDirectory()).catch(() => false);

    if (hasSectionsDir) {
      targetFile = path.join(sectionsDir, `${sectionId}.md`);
    } else if (sectionId === 'flow') {
      targetFile = path.join(flowDir, 'flow.md');
    } else {
      targetFile = path.join(flowDir, `${sectionId}.md`);
    }

    try {
      await fs.unlink(targetFile);
    } catch {
      // 文件不存在，忽略
    }

    await updateFlowTimestamp(flowDir);
    invalidateCache();
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// POST /api/flows/:flowId/sections - 创建新 section
router.post('/:flowId/sections', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { sectionId, title } = req.body as { sectionId?: string; title?: string };

    if (!sectionId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'sectionId and title are required' };
      res.status(400).json(response);
      return;
    }

    const projectDir = await findProjectDirForFlow(flowId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowsDir = path.join(projectDir, 'flows');
    const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
    const flowDirName = flowEntries.find((e) => e.isDirectory() && e.name.startsWith(flowId))?.name;
    if (!flowDirName) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }
    const flowDir = path.join(flowsDir, flowDirName);

    // 确保 sections/ 目录存在
    const sectionsDir = path.join(flowDir, 'sections');
    await fs.mkdir(sectionsDir, { recursive: true });

    const filename = `${sectionId}.md`;
    const sectionContent = `---
section_id: ${sectionId}
title: ${title}
---

# ${title}

在此输入内容...
`;
    await fs.writeFile(path.join(sectionsDir, filename), sectionContent, 'utf-8');
    await updateFlowTimestamp(flowDir);
    invalidateCache();

    const response: ApiResponse<{ sectionId: string }> = { success: true, data: { sectionId } };
    res.status(201).json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// PUT /api/flows/:flowId/sections/:sectionId
router.put('/:flowId/sections/:sectionId', async (req, res) => {
  try {
    const { flowId, sectionId } = req.params;
    const { content } = req.body as { content?: string };

    if (content === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'content is required' };
      res.status(400).json(response);
      return;
    }

    const projectDir = await findProjectDirForFlow(flowId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(500).json(response);
      return;
    }

    const flowsDir = path.join(projectDir, 'flows');
    const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
    const flowDirName = flowEntries.find((e) => e.isDirectory() && e.name.startsWith(flowId))?.name;
    if (!flowDirName) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }
    const flowDir = path.join(flowsDir, flowDirName);

    let targetFile: string;
    const sectionsDir = path.join(flowDir, 'sections');
    const hasSectionsDir = await fs.stat(sectionsDir).then((s) => s.isDirectory()).catch(() => false);

    if (hasSectionsDir) {
      targetFile = path.join(sectionsDir, `${sectionId}.md`);
    } else if (sectionId === 'flow') {
      targetFile = path.join(flowDir, 'flow.md');
    } else {
      targetFile = path.join(flowDir, `${sectionId}.md`);
    }

    let finalContent = content;
    try {
      const existing = await fs.readFile(targetFile, 'utf-8');
      const fmText = extractFrontmatterText(existing);
      if (fmText !== null) {
        finalContent = `---\n${fmText}\n---\n${content}`;
      }
    } catch {
      // 文件不存在
    }

    await fs.writeFile(targetFile, finalContent, 'utf-8');
    await updateFlowTimestamp(flowDir);
    invalidateCache();

    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

function extractFrontmatterText(raw: string): string | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : null;
}

async function updateFlowTimestamp(flowDir: string) {
  const flowMdPath = path.join(flowDir, 'flow.md');
  try {
    const raw = await fs.readFile(flowMdPath, 'utf-8');
    const fmText = extractFrontmatterText(raw);
    if (fmText !== null) {
      const today = new Date().toISOString().split('T')[0];
      const updatedFm = fmText.replace(/^updated:.*/m, `updated: "${today}"`);
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
      await fs.writeFile(flowMdPath, `---\n${updatedFm}\n---\n${body}`, 'utf-8');
    }
  } catch {
    // ignore
  }
}

async function findProjectDirForFlow(flowId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const flowsDir = path.join(CONFIG.VAULTS_DIR, entry.name, 'flows');
      try {
        const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
        if (flowEntries.some((e) => e.isDirectory() && e.name.startsWith(flowId))) {
          return path.join(CONFIG.VAULTS_DIR, entry.name);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // vaults/ 不存在
  }
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}

async function findProjectDir(projectId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(projectId)) {
        return path.join(CONFIG.VAULTS_DIR, entry.name);
      }
    }
  } catch {
    // vaults/ 不存在
  }
  // 回退 legacy
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}

// PUT /api/flows/:flowId/position - 更新 Flow 在 Contour Map 中的位置
router.put('/:flowId/position', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { x, y } = req.body as { x?: number; y?: number };

    if (typeof x !== 'number' || typeof y !== 'number') {
      const response: ApiResponse<never> = { success: false, error: 'x and y coordinates are required' };
      res.status(400).json(response);
      return;
    }

    const projectDir = await findProjectDirForFlow(flowId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowsDir = path.join(projectDir, 'flows');
    const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
    const flowDirName = flowEntries.find((e) => e.isDirectory() && e.name.startsWith(flowId))?.name;
    if (!flowDirName) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }
    const flowDir = path.join(flowsDir, flowDirName);

    const flowMdPath = path.join(flowDir, 'flow.md');
    let raw = '';
    try {
      raw = await fs.readFile(flowMdPath, 'utf-8');
    } catch {
      const response: ApiResponse<never> = { success: false, error: 'flow.md not found' };
      res.status(404).json(response);
      return;
    }

    const fmText = extractFrontmatterText(raw);
    if (fmText !== null) {
      let updatedFm = fmText.replace(/^position_x:.*/m, `position_x: ${x}`);
      if (!/^position_x:/m.test(updatedFm)) updatedFm += `\nposition_x: ${x}`;
      let updatedFm2 = updatedFm.replace(/^position_y:.*/m, `position_y: ${y}`);
      if (!/^position_y:/m.test(updatedFm2)) updatedFm2 += `\nposition_y: ${y}`;
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
      await fs.writeFile(flowMdPath, `---\n${updatedFm2}\n---\n${body}`, 'utf-8');
    }

    invalidateCache();
    const response: ApiResponse<{ x: number; y: number }> = { success: true, data: { x, y } };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

export default router;
