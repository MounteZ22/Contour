import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { Flow } from '@contour/shared';
import type { ApiResponse } from '../types.js';
import { coreServices } from '../core.js';
import { validateId, ValidationError } from '@contour/core/vault';
import { extractFrontmatterText } from '@contour/core/vault';
import { atomicCreateFile, atomicWriteFile } from '@contour/core/vault';
import { yamlSafeValue, parseFrontmatter, stringifyWithFrontmatter } from '@contour/core/vault';
import {
  FlowAssetError,
  validateVaultProjectId,
} from '@contour/core/services';
import { FlowSummaryError } from '@contour/core/services';

const { loadProjects, invalidateCache, findFlowDir, findProjectDir } = coreServices.vault;
const { addFlowLink, deleteFlowAttachment, removeFlowLink, uploadFlowAttachment } = coreServices.flowAssets;
const { createFlowSummaryDraft, getFlowSummary, saveFlowSummary } = coreServices.flowSummary;

const router = Router();

function safeFlowDirectorySuffix(title: string): string {
  return title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'flow';
}

/**
 * 解析 flow 所在的项目目录。
 *
 * 修改操作使用显式的 projectId 通过 findProjectDir 精确定位，避免跨项目
 * flowId 碰撞导致位置/状态/删除等操作误操作其他项目的 Flow。
 *
 * projectId 来源：
 *   - DELETE: req.query.projectId
 *   - PUT/POST: req.body.projectId
 */
async function resolveProjectDir(projectId: string): Promise<string | null> {
  validateVaultProjectId(projectId);
  return findProjectDir(projectId);
}

/** 写入或删除 Flow 时必须显式指定项目，避免同名 Flow 误操作。 */
function requireProjectId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError('projectId is required');
  }
  validateVaultProjectId(value);
  return value;
}

// GET /api/flows - 所有 flow 列表（不含 sections 全文）
router.get('/', async (req, res) => {
  try {
    const projects = await loadProjects();
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
        attachments: f.attachments,
        links: f.links,
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
    const projects = await loadProjects();

    let flow: Flow | undefined;
    if (projectId && typeof projectId === 'string') {
      validateVaultProjectId(projectId);
      const project = projects.find((p) => p.projectId === projectId);
      flow = project?.flows.find((f) => f.flowId === flowId);
    } else {
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

// GET /api/flows/:flowId/summary?projectId=xxx - 读取完整摘要文本
router.get('/:flowId/summary', async (req, res) => {
  try {
    const content = await getFlowSummary(req.query.projectId, req.params.flowId);
    res.json({ success: true, data: { content } });
  } catch (err) {
    if (err instanceof FlowSummaryError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '读取 Flow 摘要失败' });
  }
});

// POST /api/flows/:flowId/summary/draft - 基于服务端重读的完整 Flow 生成草稿
router.post('/:flowId/summary/draft', async (req, res) => {
  try {
    const result = await createFlowSummaryDraft({
      projectId: req.body?.projectId,
      flowId: req.params.flowId,
      channelId: req.body?.channelId,
      model: req.body?.model,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof FlowSummaryError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '生成 Flow 摘要失败' });
  }
});

// PUT /api/flows/:flowId/summary - 保存用户确认后的摘要
router.put('/:flowId/summary', async (req, res) => {
  try {
    await saveFlowSummary(req.body?.projectId, req.params.flowId, req.body?.content);
    res.json({ success: true, data: null });
  } catch (err) {
    if (err instanceof FlowSummaryError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: '保存 Flow 摘要失败' });
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

    if (
      typeof projectId !== 'string' ||
      typeof flowId !== 'string' ||
      typeof title !== 'string' ||
      !projectId ||
      !flowId ||
      !title.trim()
    ) {
      const response: ApiResponse<never> = { success: false, error: 'projectId, flowId and title are required' };
      res.status(400).json(response);
      return;
    }

    validateVaultProjectId(projectId);
    validateId(flowId, 'flowId');

    const projects = await loadProjects();
    const project = projects.find((p) => p.projectId === projectId);
    if (!project) {
      const response: ApiResponse<never> = { success: false, error: 'Project not found' };
      res.status(404).json(response);
      return;
    }
    if (project.flows.some((flow) => flow.flowId === flowId)) {
      res.status(409).json({ success: false, error: 'Flow already exists' });
      return;
    }

    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(500).json(response);
      return;
    }
    if (await findFlowDir(projectDir, flowId)) {
      res.status(409).json({ success: false, error: 'Flow already exists' });
      return;
    }

    const safeTitle = yamlSafeValue(title);
    const flowDir = path.join(projectDir, 'flows', `${flowId}_${safeFlowDirectorySuffix(title)}`);
    await fs.mkdir(flowDir, { recursive: true });
    await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });
    await fs.mkdir(path.join(flowDir, 'attachments'), { recursive: true });

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
links: []
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
    await atomicWriteFile(path.join(flowDir, 'flow_summary.md'), '');
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

// POST /api/flows/:flowId/attachments - 以受限 base64 JSON 上传附件
router.post('/:flowId/attachments', async (req, res) => {
  try {
    const data = await uploadFlowAttachment({
      flowId: req.params.flowId,
      projectId: req.body?.projectId,
      filename: req.body?.filename,
      contentBase64: req.body?.contentBase64,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err instanceof FlowAssetError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/flows/:flowId/attachments/:filename - 幂等删除附件
router.delete('/:flowId/attachments/:filename', async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const data = await deleteFlowAttachment({
      flowId: req.params.flowId,
      projectId,
      filename: req.params.filename,
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof FlowAssetError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/flows/:flowId/links - 新增链接；同一路径再次提交时更新名称
router.post('/:flowId/links', async (req, res) => {
  try {
    const { created, links } = await addFlowLink({
      flowId: req.params.flowId,
      projectId: req.body?.projectId,
      path: req.body?.path,
      label: req.body?.label,
    });
    res.status(created ? 201 : 200).json({ success: true, data: { links } });
  } catch (err) {
    if (err instanceof FlowAssetError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/flows/:flowId/links - 按绝对路径幂等移除链接
router.delete('/:flowId/links', async (req, res) => {
  try {
    const data = await removeFlowLink({
      flowId: req.params.flowId,
      projectId: req.body?.projectId,
      path: req.body?.path,
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof FlowAssetError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
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
    const { status, projectId } = req.body as { status?: string; projectId?: unknown };

    if (status === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'status is required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');

    const projectDir = await resolveProjectDir(requireProjectId(projectId));
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowDir = await findFlowDir(projectDir, flowId);
    if (!flowDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

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
    if (!parsed) {
      res.status(422).json({ success: false, error: 'flow.md frontmatter 无效，未修改状态' });
      return;
    }
    parsed.fm['status'] = status;
    const updated = stringifyWithFrontmatter(parsed.fm, parsed.body);
    await atomicWriteFile(flowMdPath, updated);
    await updateFlowTimestamp(flowDir);

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
    const queryProjectId = requireProjectId(req.query.projectId);
    validateId(flowId, 'flowId');
    const projectDir = await resolveProjectDir(queryProjectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowDir = await findFlowDir(projectDir, flowId);
    if (!flowDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

    await fs.rm(flowDir, { recursive: true, force: true });
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
    const queryProjectId = requireProjectId(req.query.projectId);
    validateId(flowId, 'flowId');
    validateId(sectionId, 'sectionId');
    if (sectionId === 'flow') {
      throw new ValidationError('主 Flow Section 不能删除');
    }
    const projectDir = await resolveProjectDir(queryProjectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowDir = await findFlowDir(projectDir, flowId);
    if (!flowDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
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
    const { sectionId, title, projectId } = req.body as { sectionId?: string; title?: string; projectId?: unknown };

    if (!sectionId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'sectionId and title are required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');
    validateId(sectionId, 'sectionId');
    if (sectionId === 'flow') {
      throw new ValidationError('flow 是保留的主 Section ID');
    }

    const projectDir = await resolveProjectDir(requireProjectId(projectId));
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowDir = await findFlowDir(projectDir, flowId);
    if (!flowDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

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
    try {
      await atomicCreateFile(path.join(sectionsDir, filename), sectionContent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        res.status(409).json({ success: false, error: 'Section already exists' });
        return;
      }
      throw error;
    }
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
    const { content, projectId } = req.body as { content?: string; projectId?: unknown };

    if (content === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'content is required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');
    validateId(sectionId, 'sectionId');

    const projectDir = await resolveProjectDir(requireProjectId(projectId));
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(500).json(response);
      return;
    }

    const flowDir = await findFlowDir(projectDir, flowId);
    if (!flowDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

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
    const { x, y, projectId } = req.body as { x?: number; y?: number; projectId?: unknown };

    if (typeof x !== 'number' || typeof y !== 'number') {
      const response: ApiResponse<never> = { success: false, error: 'x and y coordinates are required' };
      res.status(400).json(response);
      return;
    }

    validateId(flowId, 'flowId');

    const projectDir = await resolveProjectDir(requireProjectId(projectId));
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow not found' };
      res.status(404).json(response);
      return;
    }

    const flowDir = await findFlowDir(projectDir, flowId);
    if (!flowDir) {
      const response: ApiResponse<never> = { success: false, error: 'Flow directory not found' };
      res.status(404).json(response);
      return;
    }

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
    if (!parsed) {
      res.status(422).json({ success: false, error: 'flow.md frontmatter 无效，未修改位置' });
      return;
    }
    parsed.fm['position_x'] = x;
    parsed.fm['position_y'] = y;
    const updated = stringifyWithFrontmatter(parsed.fm, parsed.body);
    await atomicWriteFile(flowMdPath, updated);

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
