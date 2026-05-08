import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse, ProjectData } from '../types.js';
import { invalidateCache, loadProjects } from '../vault/loader.js';

const router = Router();

// GET /api/project - 返回所有项目
router.get('/', async (_req, res) => {
  try {
    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const response: ApiResponse<{ projects: ProjectData[] }> = { success: true, data: { projects } };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
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

    const projectDir = path.join(CONFIG.VAULTS_DIR, `${projectId}_${title.replace(/\s+/g, '_').toLowerCase()}`);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'project'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'flows'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'claims'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'data_library'), { recursive: true });

    const briefContent = `---
project_id: ${projectId}
title: ${title}
research_goal: "${researchGoal || ''}"
current_stage: "刚创建"
---

# ${title}

## Research Goal

${researchGoal || '待补充研究目标'}

## Current Stage

项目刚创建。
`;
    await fs.writeFile(path.join(projectDir, 'project', 'project_brief.md'), briefContent, 'utf-8');

    invalidateCache();
    const response: ApiResponse<{ projectId: string }> = { success: true, data: { projectId } };
    res.status(201).json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// DELETE /api/project/:projectId
router.delete('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
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
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

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
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}

export default router;
