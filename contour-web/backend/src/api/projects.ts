/**
 * projects — 项目附加目录管理 API
 *
 * 管理配置中项目的附加目录列表。项目由 VAULTS_DIR 的 basename 确定。
 * 数据存储已在 projectManager 中处理，此路由提供 HTTP API 供前端调用。
 */

import { Router } from "express";
import { stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  getAttachedDirectories,
  attachDirectory,
  detachDirectory,
} from "../services/projectManager.js";

const router = Router();

/** 系统目录黑名单（防止路径穿越附加敏感目录） */
const FORBIDDEN_DIRS = new Set([
  "/Windows", "/System32", "/SysWOW64", "/System Volume Information",
  "/etc", "/sys", "/proc", "/dev", "/boot", "/root", "/var/log", "/var/run",
  "/Library", "/System", "/Applications/Xcode.app",
]);

/** 校验路径安全：不指向系统目录、不越权 */
function validateAttachmentPath(absPath: string): void {
  // 拒绝根目录
  const normalized = path.normalize(absPath).replace(/\\/g, "/").replace(/\/$/, "");
  if (normalized === "" || normalized === "/" || /^[A-Z]:\/$/i.test(normalized)) {
    throw new Error("不允许附加根目录");
  }

  // 拒绝系统关键目录
  for (const forbidden of FORBIDDEN_DIRS) {
    const f = forbidden.replace(/\\/g, "/");
    if (normalized === f || normalized.startsWith(f + "/")) {
      throw new Error(`不允许附加系统目录: ${forbidden}`);
    }
  }

  // 拒绝 .contour / .contour-dev 数据目录自身（防止循环引用）
  const homeDir = path.normalize(os.homedir()).replace(/\\/g, "/").replace(/\/$/, "");
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

    // 安全校验：拒绝系统目录和越权路径
    validateAttachmentPath(absPath);

    // 异步检查路径是否存在且为目录
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
