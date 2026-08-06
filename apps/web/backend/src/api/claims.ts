import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { Claim } from '@contour/shared';
import type { ApiResponse } from '../types.js';
import { coreServices } from '../core.js';
import { validateId, ValidationError } from '@contour/core/vault';
import { extractFrontmatterText } from '@contour/core/vault';
import { atomicWriteFile } from '@contour/core/vault';
import { yamlSafeValue, parseFrontmatter, stringifyWithFrontmatter } from '@contour/core/vault';

const { loadProjects, findProjectDir, findProjectDirForClaim, invalidateCache } = coreServices.vault;

const router = Router();

// GET /api/claims - 所有 claims
router.get('/', async (req, res) => {
  try {
    const projects = await loadProjects();
    const claims = projects.flatMap((p) => p.claims);
    const response: ApiResponse<{ claims: Claim[] }> = { success: true, data: { claims } };
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

// GET /api/claims/:claimId?projectId=xxx - 单个 claim
router.get('/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    const { projectId } = req.query;
    const projects = await loadProjects();

    let claim: Claim | undefined;
    if (projectId && typeof projectId === 'string') {
      const project = projects.find((p) => p.projectId === projectId);
      claim = project?.claims.find((c) => c.claimId === claimId);
    }
    if (!claim) {
      claim = projects.flatMap((p) => p.claims).find((c) => c.claimId === claimId);
    }

    if (!claim) {
      const response: ApiResponse<never> = { success: false, error: 'Claim not found' };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<Claim> = { success: true, data: claim };
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

// POST /api/claims - 创建新 claim
router.post('/', async (req, res) => {
  try {
    const { projectId, claimId, title } = req.body as {
      projectId?: string;
      claimId?: string;
      title?: string;
    };

    if (!projectId || !claimId || !title) {
      const response: ApiResponse<never> = { success: false, error: 'projectId, claimId and title are required' };
      res.status(400).json(response);
      return;
    }

    validateId(projectId, 'projectId');
    validateId(claimId, 'claimId');

    const projectDir = await findProjectDir(projectId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Project directory not found' };
      res.status(404).json(response);
      return;
    }

    const safeTitle = yamlSafeValue(title);
    const claimsDir = path.join(projectDir, 'claims');
    await fs.mkdir(claimsDir, { recursive: true });

    const content = `---
claim_id: ${claimId}
title: ${safeTitle}
confidence: medium
status: tentative
tags: []
---

在此写下你的判断内容...

`;
    await atomicWriteFile(path.join(claimsDir, `${claimId}.md`), content);
    invalidateCache();

    const response: ApiResponse<{ claimId: string }> = { success: true, data: { claimId } };
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

// PUT /api/claims/:claimId - 更新 claim 内容和 frontmatter 字段
router.put('/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    const { content, confidence, status, tags } = req.body as {
      content?: string;
      confidence?: 'low' | 'medium' | 'high';
      status?: 'tentative' | 'active' | 'revised' | 'weakened' | 'superseded' | 'rejected';
      tags?: string[];
    };

    if (content === undefined) {
      const response: ApiResponse<never> = { success: false, error: 'content is required' };
      res.status(400).json(response);
      return;
    }

    validateId(claimId, 'claimId');

    const projectDir = await findProjectDirForClaim(claimId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Claim not found' };
      res.status(404).json(response);
      return;
    }

    const targetFile = path.join(projectDir, 'claims', `${claimId}.md`);

    // 读取现有文件，更新 frontmatter 字段
    let finalContent = content;
    try {
      const existing = await fs.readFile(targetFile, 'utf-8');
      const parsed = parseFrontmatter(existing);
      if (parsed) {
        // 只更新传入了的字段
        if (confidence !== undefined) parsed.fm['confidence'] = confidence;
        if (status !== undefined) parsed.fm['status'] = status;
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

// DELETE /api/claims/:claimId - 删除 claim
router.delete('/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    validateId(claimId, 'claimId');

    const projectDir = await findProjectDirForClaim(claimId);
    if (!projectDir) {
      const response: ApiResponse<never> = { success: false, error: 'Claim not found' };
      res.status(404).json(response);
      return;
    }

    const targetFile = path.join(projectDir, 'claims', `${claimId}.md`);
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
