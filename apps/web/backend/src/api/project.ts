import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ProjectData } from '@contour/shared';
import type { ApiResponse } from '../types.js';
import { coreServices } from '../core.js';
import { validateId, ValidationError } from '@contour/core/vault';
import { atomicWriteFile } from '@contour/core/vault';
import { yamlSafeValue } from '@contour/core/vault';
import { validateProjectId } from '@contour/core/services';

const { invalidateCache, loadProjects, findProjectDir } = coreServices.vault;
const { ensureProjectDir, getProjectConfig } = coreServices.projects;

const router = Router();

/** 过滤路径中的危险字符，防止路径穿越 */
function sanitizePathSegment(input: string): string {
  return input.replace(/\.\./g, '').replace(/[/\\:*?"<>|]/g, '_');
}

/** 将项目目录移动到回收站（软删除） */
async function moveToTrash(projectDir: string, projectName: string): Promise<void> {
  const trashDir = path.join(CONFIG.DATA_DIR, '.trash');
  await fs.mkdir(trashDir, { recursive: true });

  const timestamp = Date.now();
  const trashName = `${projectName}_${timestamp}`;
  const trashPath = path.join(trashDir, trashName);

  try {
    await fs.rename(projectDir, trashPath);
  } catch (err: unknown) {
    // 跨分区移动会抛出 EXDEV 错误，回退到复制后删除
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EXDEV') {
      console.log(`跨设备移动，使用复制+删除: ${projectDir} → ${trashPath}`);
      await fs.cp(projectDir, trashPath, { recursive: true });
      await fs.rm(projectDir, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
  console.log(`项目已移至回收站: ${trashPath}`);
}

// ── API ──

// GET /api/project - 返回所有项目
router.get('/', async (req, res) => {
  try {
    const projects = await loadProjects();
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

// POST /api/project - 创建新项目
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
    // 过滤 title 中的路径穿越字符，防止目录逃逸
    const rawPathTitle = sanitizePathSegment(title.replace(/\s+/g, '_').toLowerCase());
    // 限制目录名长度，防止文件系统路径过长
    const safePathTitle = rawPathTitle.slice(0, 100);
    const projectDir = path.join(CONFIG.VAULTS_DIR, `${projectId}_${safePathTitle}`);
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
    ensureProjectDir(actualProjectId, projectDir);
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
    // 软删除：移动到回收站而非永久删除
    const projectName = path.basename(projectDir);
    await moveToTrash(projectDir, projectName);
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

// ── @ 提及搜索 ────────────────────────────────────────────────────────────────

/** 提及建议项 */
interface MentionItem {
  type: 'file' | 'flow' | 'doc';
  name: string;
  path: string;
  /** Flow/Doc 的标题 */
  title?: string;
}

/** 递归搜索目录，收集名称匹配的文件 */
async function searchDirectory(
  dirPath: string,
  query: string,
  projectDir: string,
  maxDepth: number,
  maxResults: number,
  results: MentionItem[],
): Promise<void> {
  if (maxDepth <= 0 || results.length >= maxResults) return;
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // 跳过无法访问的目录
  }
  const lowerQuery = query.toLowerCase();
  // 先处理文件，再递归子目录（文件和当前目录结果优先）
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (entry.isFile() && entry.name.toLowerCase().includes(lowerQuery)) {
      const absolutePath = path.join(dirPath, entry.name);
      const relativePath = projectDir ? path.relative(projectDir, absolutePath) : absolutePath;
      // 去重
      if (!results.some((r) => r.type === 'file' && r.path === relativePath)) {
        results.push({ type: 'file', name: entry.name, path: relativePath });
      }
    }
  }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (entry.isDirectory()) {
      await searchDirectory(path.join(dirPath, entry.name), query, projectDir, maxDepth - 1, maxResults, results);
    }
  }
}

// GET /api/project/:projectId/search-mentions?q=xxx
router.get('/:projectId/search-mentions', async (req, res) => {
  try {
    const { projectId } = req.params;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!q) {
      res.json({ success: true, data: [] });
      return;
    }

    const lowerQuery = q.toLowerCase();
    const results: MentionItem[] = [];
    const MAX_RESULTS = 20;
    const MAX_SEARCH_DEPTH = 4;

    // 1. 搜索项目 Flows
    try {
      const projects = await loadProjects();
      const project = projects.find((p) => p.projectId === projectId);
      if (project) {
        // Flows
        for (const flow of project.flows) {
          if (results.length >= MAX_RESULTS) break;
          const nameMatch =
            flow.flowId.toLowerCase().includes(lowerQuery) ||
            flow.title.toLowerCase().includes(lowerQuery);
          if (nameMatch && !results.some((r) => r.type === 'flow' && r.path === flow.flowId)) {
            results.push({ type: 'flow', name: `${flow.flowId} · ${flow.title}`, path: flow.flowId, title: flow.title });
          }
        }
        // Docs
        for (const doc of project.docs) {
          if (results.length >= MAX_RESULTS) break;
          const nameMatch =
            doc.id.toLowerCase().includes(lowerQuery) ||
            doc.title.toLowerCase().includes(lowerQuery);
          if (nameMatch && !results.some((r) => r.type === 'doc' && r.path === doc.id)) {
            results.push({ type: 'doc', name: `${doc.title}.md`, path: doc.id, title: doc.title });
          }
        }
      }
    } catch {
      // 项目数据加载失败不影响文件搜索
    }

    // 2. 搜索授权目录中的文件
    try {
      const config = getProjectConfig(projectId);
      // 搜索项目主目录
      if (config.projectDir) {
        await searchDirectory(config.projectDir, q, config.projectDir, MAX_SEARCH_DEPTH, MAX_RESULTS, results);
      }
      // 搜索附加目录
      for (const dir of config.attachedDirectories) {
        if (results.length >= MAX_RESULTS) break;
        await searchDirectory(dir, q, dir, MAX_SEARCH_DEPTH, MAX_RESULTS, results);
      }
      // 搜索附加文件（直接匹配名称）
      for (const filePath of config.attachedFiles) {
        if (results.length >= MAX_RESULTS) break;
        const name = path.basename(filePath);
        if (name.toLowerCase().includes(lowerQuery) && !results.some((r) => r.type === 'file' && r.path === filePath)) {
          results.push({ type: 'file', name, path: filePath });
        }
      }
    } catch {
      // 配置文件读取失败时不阻断
    }

    const response: ApiResponse<MentionItem[]> = { success: true, data: results.slice(0, MAX_RESULTS) };
    res.json(response);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
