import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse, ProjectData } from '../types.js';
import { invalidateCache, loadProjects } from '../vault/loader.js';
import { validateId, ValidationError } from '../vault/validate.js';
import { findProjectDir } from '../vault/locate.js';
import { atomicWriteFile } from '../vault/atomic.js';
import { yamlSafeValue } from '../vault/yaml-utils.js';

const router = Router();

// GET /api/project - 返回所有项目
router.get('/', async (req, res) => {
  try {
    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const response: ApiResponse<{ projects: ProjectData[] }> = { success: true, data: { projects } };
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

// POST /api/projects - 创建新项目
router.post('/', async (req, res) => {
  try {
    const { projectId, title, researchGoal } = req.body as {
      projectId?: string;
      title?: string;
      researchGoal?: string;
    };

    if (!projectId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'projectId and title are required' };
      res.status(400).json(response);
      return;
    }

    validateId(projectId, 'projectId');

    const safeTitle = yamlSafeValue(title);
    const safeGoal = yamlSafeValue(researchGoal || '');
    const projectDir = path.join(CONFIG.VAULTS_DIR, `${projectId}_${title.replace(/\s+/g, '_').toLowerCase()}`);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'background'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'flows'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'claims'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'data_library'), { recursive: true });

    const briefContent = `---
project_id: ${projectId}
title: ${safeTitle}
research_goal: ${safeGoal}
current_stage: "刚创建"
---

# ${title}

## Research Goal

${researchGoal || '待补充研究目标'}

## Current Stage

项目刚创建。
`;
    await atomicWriteFile(path.join(projectDir, 'background', 'project_brief.md'), briefContent);

    invalidateCache();
    // 返回目录名作为实际 projectId，与扫描器一致
    const actualProjectId = path.basename(projectDir);
    const response: ApiResponse<{ projectId: string }> = { success: true, data: { projectId: actualProjectId } };
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

// DELETE /api/project/:projectId
router.delete('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    validateId(projectId, 'projectId');
    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project not found' };
      res.status(404).json(response);
      return;
    }
    await fs.rm(projectDir, { recursive: true, force: true });
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

export default router;
