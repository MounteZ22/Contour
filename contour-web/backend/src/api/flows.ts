import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse, Flow } from '../types.js';
import { invalidateCache, loadProjects } from '../vault/loader.js';
import { validateId, ValidationError } from '../vault/validate.js';
import { findProjectDir, findProjectDirForFlow, extractFrontmatterText } from '../vault/locate.js';
import { atomicWriteFile } from '../vault/atomic.js';
import { yamlSafeValue, parseFrontmatter, stringifyWithFrontmatter } from '../vault/yaml-utils.js';

const router = Router();

/**
 * 解析 flow 所在的项目目录。
 *
 * 优先使用显式的 projectId 通过 findProjectDir 精确定位，避免跨项目 flowId
 * 碰撞（多个项目各有同名 F001-F005 等 flow 时，findProjectDirForFlow 只
 * 返回第一个匹配，导致位置/状态/删除等操作误操作其他项目的 flow）。
 *
 * projectId 来源：
 *   - GET/DELETE: req.query.projectId
 *   - PUT/POST:   req.body.projectId
 */
async function resolveProjectDir(flowId: string, projectId?: string): Promise<string | null> {
  if (projectId) {
    const dir = await findProjectDir(projectId);
    if (dir) return dir;
    // 如果 projectId 传了但目录不存在，fallthrough 到扫描逻辑
  }
  return findProjectDirForFlow(flowId);
}

// GET /api/flows - 所有 flow 列表（不含 sections 全文）
router.get('/', async (req, res) => {
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
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
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
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
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

    validateId(projectId, 'projectId');
    validateId(flowId, 'flowId');

    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const project = projects.find((p) => p.projectId === projectId);
    if (!project) {
      const response: ApiResponse<never> = { success: false, error: 'Project not found' };
      res.status(404).json(response);
      return;
    }

    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(500).json(response);
      return;
    }

    const safeTitle = yamlSafeValue(title);
    const flowDir = path.join(projectDir, 'flows', `${flowId}_${title.replace(/\s+/g, '_').toLowerCase()}`);
    await fs.mkdir(flowDir, { recursive: true });
    await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const flowMd = `---
flow_id: ${flowId}
title: ${safeTitle}
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
    await atomicWriteFile(path.join(flowDir, 'flow.md'), flowMd);
    await atomicWriteFile(path.join(flowDir, 'sections', 'flow.md'), sectionMd);
    await atomicWriteFile(path.join(flowDir, 'context_summary.md'), '');
    await atomicWriteFile(path.join(flowDir, 'assets.yaml'), '[]\n');

    invalidateCache();
    const response: ApiResponse<{ flowId: string }> = { success: true, data: { flowId } };
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/flows/:flowId - 更新 flow frontmatter
router.put('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { status, projectId } = req.body as { status?: string; projectId?: string };

    if (status === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'status is required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');

    const projectDir = await resolveProjectDir(flowId, projectId);
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

    const parsed = parseFrontmatter(raw);
    if (parsed) {
      parsed.fm['status'] = status;
      const updated = stringifyWithFrontmatter(parsed.fm, parsed.body);
      await atomicWriteFile(flowMdPath, updated);
      await updateFlowTimestamp(flowDir);
    }

    invalidateCache();
    const response: ApiResponse<{ status: string }> = { success: true, data: { status } };
    res.json(response);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/flows/:flowId - 删除整个 flow
router.delete('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const queryProjectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    validateId(flowId, 'flowId');
    const projectDir = await resolveProjectDir(flowId, queryProjectId);
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
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/flows/:flowId/sections/:sectionId - 删除 section
router.delete('/:flowId/sections/:sectionId', async (req, res) => {
  try {
    const { flowId, sectionId } = req.params;
    const queryProjectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    validateId(flowId, 'flowId');
    validateId(sectionId, 'sectionId');
    const projectDir = await resolveProjectDir(flowId, queryProjectId);
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
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/flows/:flowId/sections - 创建新 section
router.post('/:flowId/sections', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { sectionId, title, projectId } = req.body as { sectionId?: string; title?: string; projectId?: string };

    if (!sectionId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'sectionId and title are required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');
    validateId(sectionId, 'sectionId');

    const projectDir = await resolveProjectDir(flowId, projectId);
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

    const sectionsDir = path.join(flowDir, 'sections');
    await fs.mkdir(sectionsDir, { recursive: true });

    const safeTitle = yamlSafeValue(title);
    const filename = `${sectionId}.md`;
    const sectionContent = `---
section_id: ${sectionId}
title: ${safeTitle}
---

# ${title}

在此输入内容...
`;
    await atomicWriteFile(path.join(sectionsDir, filename), sectionContent);
    await updateFlowTimestamp(flowDir);
    invalidateCache();

    const response: ApiResponse<{ sectionId: string }> = { success: true, data: { sectionId } };
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/flows/:flowId/sections/:sectionId
router.put('/:flowId/sections/:sectionId', async (req, res) => {
  try {
    const { flowId, sectionId } = req.params;
    const { content, projectId } = req.body as { content?: string; projectId?: string };

    if (content === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'content is required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');
    validateId(sectionId, 'sectionId');

    const projectDir = await resolveProjectDir(flowId, projectId);
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

    await atomicWriteFile(targetFile, finalContent);
    await updateFlowTimestamp(flowDir);
    invalidateCache();

    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/flows/:flowId/position - 更新 Flow 在 Contour Map 中的位置
router.put('/:flowId/position', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { x, y, projectId } = req.body as { x?: number; y?: number; projectId?: string };

    if (typeof x !== 'number' || typeof y !== 'number') {
      const response: ApiResponse<never> = { success: false, error: 'x and y coordinates are required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');

    const projectDir = await resolveProjectDir(flowId, projectId);
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

    const parsed = parseFrontmatter(raw);
    if (parsed) {
      parsed.fm['position_x'] = x;
      parsed.fm['position_y'] = y;
      const updated = stringifyWithFrontmatter(parsed.fm, parsed.body);
      await atomicWriteFile(flowMdPath, updated);
    }

    invalidateCache();
    const response: ApiResponse<{ x: number; y: number }> = { success: true, data: { x, y } };
    res.json(response);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

async function updateFlowTimestamp(flowDir: string) {
  const flowMdPath = path.join(flowDir, 'flow.md');
  try {
    const raw = await fs.readFile(flowMdPath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    if (parsed) {
      const today = new Date().toISOString().split('T')[0];
      parsed.fm['updated'] = today;
      const updated = stringifyWithFrontmatter(parsed.fm, parsed.body);
      await atomicWriteFile(flowMdPath, updated);
    }
  } catch {
    // ignore
  }
}

export default router;
