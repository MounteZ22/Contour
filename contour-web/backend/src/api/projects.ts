/**
 * projects — 项目附加目录管理 API
 *
 * 管理配置中项目的附加目录列表。项目由 VAULTS_DIR 的 basename 确定。
 * 数据存储已在 projectManager 中处理，此路由提供 HTTP API 供前端调用。
 */

import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  getProjectName,
  getAttachedDirectories,
  attachDirectory,
  detachDirectory,
} from "../services/projectManager.js";

const router = Router();

/**
 * GET /api/projects/:name/attachments
 *
 * 返回指定项目的附加目录列表
 */
router.get("/:name/attachments", (_req, res) => {
  try {
    const projectName = _req.params.name;
    if (!projectName) {
      res.status(400).json({ success: false, error: "项目名不能为空" });
      return;
    }

    const dirs = getAttachedDirectories(projectName);
    res.json({ success: true, data: { attachedDirectories: dirs } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/projects/:name/attachments
 *
 * 添加附加目录到指定项目
 * Body: { path: string }
 */
router.post("/:name/attachments", (req, res) => {
  try {
    const projectName = req.params.name;
    if (!projectName) {
      res.status(400).json({ success: false, error: "项目名不能为空" });
      return;
    }

    const { path: dirPath } = req.body as { path?: string };
    if (!dirPath) {
      res.status(400).json({ success: false, error: "缺少 path 参数" });
      return;
    }

    const absPath = path.resolve(dirPath);
    if (!existsSync(absPath)) {
      res.status(400).json({ success: false, error: `目录不存在: ${absPath}` });
      return;
    }

    const config = attachDirectory(absPath, projectName);
    res.json({
      success: true,
      data: { attachedDirectories: config.attachedDirectories },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * DELETE /api/projects/:name/attachments
 *
 * 从指定项目中移除附加目录
 * Body: { path: string }
 */
router.delete("/:name/attachments", (req, res) => {
  try {
    const projectName = req.params.name;
    if (!projectName) {
      res.status(400).json({ success: false, error: "项目名不能为空" });
      return;
    }

    const { path: dirPath } = req.body as { path?: string };
    if (!dirPath) {
      res.status(400).json({ success: false, error: "缺少 path 参数" });
      return;
    }

    const config = detachDirectory(dirPath, projectName);
    res.json({
      success: true,
      data: { attachedDirectories: config.attachedDirectories },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
