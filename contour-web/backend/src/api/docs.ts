import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse } from '../types.js';
import { invalidateCache, loadProjects } from '../vault/loader.js';

const router = Router();

// POST /api/docs - 创建新背景文档
router.post('/', async (req, res) => {
  try {
    const { projectId, docId, title, type } = req.body as {
      projectId?: string;
      docId?: string;
      title?: string;
      type?: string;
    };

    if (!projectId || !docId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'projectId, docId and title are required' };
      res.status(400).json(response);
      return;
    }

    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(404).json(response);
      return;
    }

    const targetFile = path.join(projectDir, 'project', `${docId}.md`);
    const content = `---
id: ${docId}
title: ${title}
type: ${type || 'background'}
---

# ${title}

在此输入内容...
`;
    await fs.writeFile(targetFile, content, 'utf-8');
    invalidateCache();

    const response: ApiResponse<{ docId: string }> = { success: true, data: { docId } };
    res.status(201).json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// PUT /api/docs/:docId
router.put('/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const { content } = req.body as { content?: string };

    if (content === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'content is required' };
      res.status(400).json(response);
      return;
    }

    const projects = await loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
    const doc = projects.flatMap((p) => p.docs).find((d) => d.id === docId);
    if (!doc) {
      const response: ApiResponse<never> = { success: false, error: 'Doc not found' };
      res.status(404).json(response);
      return;
    }

    const projectDir = await findProjectDirForDoc(docId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(500).json(response);
      return;
    }

    const targetFile = path.join(projectDir, 'project', `${docId}.md`);

    // 保持 frontmatter 文本不变
    let finalContent = content;
    try {
      const existing = await fs.readFile(targetFile, 'utf-8');
      const fmText = extractFrontmatterText(existing);
      if (fmText !== null) {
        finalContent = `---\n${fmText}\n---\n${content}`;
      }
    } catch {
      // 文件不存在或无 frontmatter
    }

    await fs.writeFile(targetFile, finalContent, 'utf-8');
    invalidateCache();

    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
  } catch (err) {
    const response: ApiResponse<never> = { success: false, error: (err as Error).message };
    res.status(500).json(response);
  }
});

// DELETE /api/docs/:docId - 删除文档
router.delete('/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const projectDir = await findProjectDirForDoc(docId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Doc not found' };
      res.status(404).json(response);
      return;
    }

    const targetFile = path.join(projectDir, 'project', `${docId}.md`);
    try {
      await fs.unlink(targetFile);
    } catch {
      // 文件不存在，忽略
    }

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

async function findProjectDirForDoc(docId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDocsDir = path.join(CONFIG.VAULTS_DIR, entry.name, 'project');
      try {
        const files = await fs.readdir(projectDocsDir);
        if (files.includes(`${docId}.md`)) {
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

export default router;
