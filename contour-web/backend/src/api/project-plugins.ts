/** 项目插件配置 API。仅管理声明，绝不在此路由中启动 MCP 或加载技能。 */

import { Router, type Response } from "express";
import { ValidationError } from "../vault/validate.js";
import { findProjectDir } from "../vault/locate.js";
import { ensureProjectDir, validateProjectId } from "../services/projectManager.js";
import {
  addMcpServer,
  addSkillDirectory,
  getProjectPluginConfig,
  removeMcpServer,
  removeSkillDirectory,
  setMcpServerEnabled,
  setSkillDirectoryEnabled,
} from "../services/project-plugin-config.js";

const router = Router();

async function ensureKnownProject(storageId: string): Promise<void> {
  validateProjectId(storageId);
  const projectDir = await findProjectDir(storageId);
  if (projectDir) ensureProjectDir(storageId, projectDir);
}

function itemId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/i.test(value)) {
    throw new ValidationError(`${label} ID 无效`);
  }
  return value;
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("请求体必须是对象");
  return value as Record<string, unknown>;
}

function handleError(error: unknown, res: Response): void {
  if (error instanceof ValidationError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  console.error("[项目插件配置 API]", error);
  res.status(500).json({ success: false, error: "Internal server error" });
}

router.get("/:storageId/plugins", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    res.json({ success: true, data: getProjectPluginConfig(req.params.storageId) });
  } catch (error) {
    handleError(error, res);
  }
});

router.post("/:storageId/plugins/mcp", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    const body = bodyObject(req.body);
    res.json({ success: true, data: addMcpServer(req.params.storageId, {
      name: body.name,
      command: body.command,
      args: body.args,
      env: body.env,
      toolLimit: body.toolLimit,
    }) });
  } catch (error) {
    handleError(error, res);
  }
});

router.patch("/:storageId/plugins/mcp/:serverId", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    const body = bodyObject(req.body);
    res.json({ success: true, data: setMcpServerEnabled(req.params.storageId, itemId(req.params.serverId, "MCP 服务"), body.enabled) });
  } catch (error) {
    handleError(error, res);
  }
});

router.delete("/:storageId/plugins/mcp/:serverId", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    res.json({ success: true, data: removeMcpServer(req.params.storageId, itemId(req.params.serverId, "MCP 服务")) });
  } catch (error) {
    handleError(error, res);
  }
});

router.post("/:storageId/plugins/skills", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    const body = bodyObject(req.body);
    res.json({ success: true, data: addSkillDirectory(req.params.storageId, body.path) });
  } catch (error) {
    handleError(error, res);
  }
});

router.patch("/:storageId/plugins/skills/:skillId", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    const body = bodyObject(req.body);
    res.json({ success: true, data: setSkillDirectoryEnabled(req.params.storageId, itemId(req.params.skillId, "技能目录"), body.enabled) });
  } catch (error) {
    handleError(error, res);
  }
});

router.delete("/:storageId/plugins/skills/:skillId", async (req, res) => {
  try {
    await ensureKnownProject(req.params.storageId);
    res.json({ success: true, data: removeSkillDirectory(req.params.storageId, itemId(req.params.skillId, "技能目录")) });
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
