/**
 * projects — 项目附加目录管理 API
 *
 * 管理配置中项目的附加目录列表。项目由 VAULTS_DIR 的 basename 确定。
 * 数据存储已在 projectManager 中处理，此路由提供 HTTP API 供前端调用。
 */

import { Router } from "express";
import type { WebHostContext } from '../host.js';
import { stat, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function createProjectsRouter(context: WebHostContext): Router {
const { getAttachedDirectories, attachDirectory, detachDirectory } = context.coreServices.projects;

const router = Router();

/** 校验路径安全：基于用户主目录白名单 + 符号链接解析 */
async function validateAttachmentPath(absPath: string): Promise<void> {
  // 解析符号链接 / junction，防止绕过检查
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(absPath);
  } catch {
    throw new Error("无法解析路径，请确认路径存在且可访问");
  }

  // 规范化路径用于比较
  const normalized = path.normalize(resolvedPath).replace(/\\/g, "/").replace(/\/$/, "");

  // 拒绝根目录
  if (normalized === "" || normalized === "/" || /^[A-Z]:\/$/i.test(normalized)) {
    throw new Error("不允许附加根目录");
  }

  // 白名单：只允许用户主目录下的路径
  const homeDir = path.normalize(os.homedir()).replace(/\\/g, "/").replace(/\/$/, "");
  if (normalized !== homeDir && !normalized.startsWith(homeDir + "/")) {
    throw new Error("只允许附加用户主目录下的路径");
  }

  // 拒绝 .contour / .contour-dev 数据目录自身（防止循环引用）
  const contourDir = `${homeDir}/.contour`;
  const contourDevDir = `${homeDir}/.contour-dev`;
  if (normalized === contourDir || normalized.startsWith(contourDir + "/") ||
      normalized === contourDevDir || normalized.startsWith(contourDevDir + "/")) {
    throw new Error("不允许附加 Contour 自身的数据目录");
  }
}

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
router.post("/:name/attachments", async (req, res) => {
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

    // 先检查路径是否存在且为目录（realpath 需要路径存在）
    try {
      const stats = await stat(absPath);
      if (!stats.isDirectory()) {
        res.status(400).json({ success: false, error: `路径不是目录: ${absPath}` });
        return;
      }
    } catch {
      res.status(400).json({ success: false, error: `目录不存在: ${absPath}` });
      return;
    }

    // 安全校验：解析符号链接 + 白名单检查
    await validateAttachmentPath(absPath);

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

return router;
}
