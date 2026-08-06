/** 项目本机配置 API：管理外部文件夹与文件授权范围。 */

import { Router, type Response } from "express";
import { ValidationError } from "@contour/core/vault";
import { coreServices } from '../core.js';
import { validateProjectId } from '@contour/core/services';

const { attachDirectory, attachFile, detachDirectory, detachFile, getProjectConfigStatus, ensureProjectDir } = coreServices.projects;
const { findProjectDir } = coreServices.vault;

const router = Router();

function requirePath(body: unknown): string {
  if (!body || typeof body !== "object" || typeof (body as { path?: unknown }).path !== "string") {
    throw new ValidationError("缺少 path 参数");
  }
  return (body as { path: string }).path;
}

async function ensureKnownProjectConfig(projectId: string): Promise<void> {
  validateProjectId(projectId);
  const projectDir = await findProjectDir(projectId);
  if (projectDir) ensureProjectDir(projectId, projectDir);
}

async function sendConfig(res: Response, projectId: string): Promise<void> {
  await ensureKnownProjectConfig(projectId);
  res.json({ success: true, data: getProjectConfigStatus(projectId) });
}

function handleError(error: unknown, res: Response): void {
  if (error instanceof ValidationError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  console.error("[项目配置 API]", error);
  res.status(500).json({ success: false, error: "Internal server error" });
}

router.get("/:projectId/config", async (req, res) => {
  try {
    await sendConfig(res, req.params.projectId);
  } catch (error) {
    handleError(error, res);
  }
});

router.post("/:projectId/folders", async (req, res) => {
  try {
    attachDirectory(requirePath(req.body), req.params.projectId);
    await sendConfig(res, req.params.projectId);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete("/:projectId/folders", async (req, res) => {
  try {
    detachDirectory(requirePath(req.body), req.params.projectId);
    await sendConfig(res, req.params.projectId);
  } catch (error) {
    handleError(error, res);
  }
});

router.post("/:projectId/files", async (req, res) => {
  try {
    attachFile(requirePath(req.body), req.params.projectId);
    await sendConfig(res, req.params.projectId);
  } catch (error) {
    handleError(error, res);
  }
});

router.delete("/:projectId/files", async (req, res) => {
  try {
    detachFile(requirePath(req.body), req.params.projectId);
    await sendConfig(res, req.params.projectId);
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
