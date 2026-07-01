import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { ApiResponse } from '../types.js';
import { invalidateCache, loadProjects } from '../vault/loader.js';
import { validateId, ValidationError } from '../vault/validate.js';
import { findProjectDir, findProjectDirForDoc, extractFrontmatterText } from '../vault/locate.js';
import { atomicWriteFile } from '../vault/atomic.js';
import { yamlSafeValue, parseFrontmatter, stringifyWithFrontmatter } from '../vault/yaml-utils.js';

const router = Router();

// POST /api/docs - 创建新背景文档
router.post('/', async (req, res) => {
  try {
    const { projectId, docId, title } = req.body as {
      projectId?: string;
      docId?: string;
      title?: string;
    };

    if (!projectId || !docId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'projectId, docId and title are required' };
      res.status(400).json(response);
      return;
    }

    validateId(projectId, 'projectId');

    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(404).json(response);
      return;
    }

    const safeTitle = yamlSafeValue(title);
    const targetFile = path.join(projectDir, 'background', `${docId}.md`);
    const content = `---
id: ${docId}
title: ${safeTitle}
tags: []
---

# ${title}

在此输入内容...
`;
    await atomicWriteFile(targetFile, content);
    invalidateCache();

    const response: ApiResponse<{ docId: string }> = { success: true, data: { docId } };
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

// PUT /api/docs/:docId - 更新文档内容和 frontmatter 字段
router.put('/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const { content, tags } = req.body as { content?: string; tags?: string[] };

    if (content === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'content is required' };
      res.status(400).json(response);
      return;
    }

    // docId 允许中文等字符，不校验格式

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

    const targetFile = path.join(projectDir, 'background', `${docId}.md`);

    let finalContent = content;
    try {
      const existing = await fs.readFile(targetFile, 'utf-8');
      const parsed = parseFrontmatter(existing);
      if (parsed) {
        if (tags !== undefined) parsed.fm['tags'] = tags;
        finalContent = stringifyWithFrontmatter(parsed.fm, content);
      } else {
        const fmText = extractFrontmatterText(existing);
        if (fmText !== null) {
          finalContent = `---\n${fmText}\n---\n${content}`;
        }
      }
    } catch {
      // 文件不存在或无 frontmatter
    }

    await atomicWriteFile(targetFile, finalContent);
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

// DELETE /api/docs/:docId - 删除文档
router.delete('/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    // docId 允许中文等字符，不校验格式
    const projectDir = await findProjectDirForDoc(docId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Doc not found' };
      res.status(404).json(response);
      return;
    }

    const targetFile = path.join(projectDir, 'background', `${docId}.md`);
    try {
      await fs.unlink(targetFile);
    } catch {
      // 文件不存在，忽略
    }

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
