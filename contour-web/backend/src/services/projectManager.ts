/**
 * projectManager — 项目隔离数据管理
 *
 * 每个项目对应 VAULTS_DIR 的 basename（如 "Contour-dev"），数据存储在
 * ~/.contour[-dev]/projects/{项目名}/ 目录下，包括：
 * - config.json — 项目配置（附加目录等）
 *
 * 后续可扩展为多项目支持。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PROJECTS_DIR } from "../config.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface ProjectConfig {
  /** D 盘项目目录绝对路径（如 D:/Contour-dev/示例研究项目） */
  projectDir: string;
  /** 附加目录绝对路径列表 */
  attachedDirectories: string[];
}

// ── 路径工具 ───────────────────────────────────────────────────────────────

/**
 * 确保项目目录存在并返回路径，自动初始化 config.json
 *
 * @param projectId — C 盘存储用的项目名（如 "示例研究项目"）
 * @param projectDir — 可选，D 盘项目目录绝对路径，首次创建时写入 config.json
 * @returns ~/.contour[-dev]/projects/{projectId}/
 */
export function ensureProjectDir(projectId: string, projectDir?: string): string {
  const dir = path.join(PROJECTS_DIR, projectId);
  const configPath = path.join(dir, "config.json");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // 确保 config.json 始终存在，首次创建时写入 projectDir
  if (!existsSync(configPath)) {
    const defaultConfig: ProjectConfig = {
      projectDir: projectDir ?? "",
      attachedDirectories: [],
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
  } else if (projectDir) {
    // config 已存在但 caller 传了 projectDir → 更新（处理 D 盘目录改名等情况）
    const existing = getProjectConfig(projectId);
    if (existing.projectDir !== projectDir) {
      existing.projectDir = projectDir;
      writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");
    }
  }

  return dir;
}

// ── 项目配置 ───────────────────────────────────────────────────────────────

/** config.json 的绝对路径 */
function configFilePath(projectId: string): string {
  return path.join(ensureProjectDir(projectId), "config.json");
}

/**
 * 读取项目配置，不存在时返回默认值
 */
export function getProjectConfig(projectId: string): ProjectConfig {
  const filePath = configFilePath(projectId);
  try {
    if (!existsSync(filePath)) return { projectDir: "", attachedDirectories: [] };
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProjectConfig>;
    return { projectDir: parsed.projectDir ?? "", attachedDirectories: parsed.attachedDirectories ?? [] };
  } catch {
    return { projectDir: "", attachedDirectories: [] };
  }
}

/**
 * 保存项目配置
 */
export function saveProjectConfig(config: ProjectConfig, projectId: string): void {
  const filePath = configFilePath(projectId);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

// ── 附加目录管理 ───────────────────────────────────────────────────────────

/**
 * 获取项目的附加目录列表（仅返回路径存在的有效目录）
 */
export function getAttachedDirectories(projectId: string): string[] {
  const config = getProjectConfig(projectId);
  return config.attachedDirectories.filter((d) => existsSync(d));
}

/**
 * 添加附加目录
 *
 * @throws 如果目录不存在
 */
export function attachDirectory(dirPath: string, projectId: string): ProjectConfig {
  if (!existsSync(dirPath)) {
    throw new Error(`目录不存在: ${dirPath}`);
  }

  const absPath = path.resolve(dirPath);
  const config = getProjectConfig(projectId);

  if (!config.attachedDirectories.includes(absPath)) {
    config.attachedDirectories.push(absPath);
    saveProjectConfig(config, projectId);
  }

  return config;
}

/**
 * 移除附加目录
 */
export function detachDirectory(dirPath: string, projectId: string): ProjectConfig {
  const absPath = path.resolve(dirPath);
  const config = getProjectConfig(projectId);
  config.attachedDirectories = config.attachedDirectories.filter(
    (d) => path.resolve(d) !== absPath,
  );
  saveProjectConfig(config, projectId);
  return config;
}

/**
 * 清理已不存在的附加目录路径
 */
export function cleanupStaleAttachedPaths(projectId: string): void {
  const config = getProjectConfig(projectId);
  const before = config.attachedDirectories.length;
  config.attachedDirectories = config.attachedDirectories.filter((d) =>
    existsSync(d),
  );
  if (config.attachedDirectories.length !== before) {
    saveProjectConfig(config, projectId);
  }
}

/**
 * 列出所有已存在的项目
 *
 * @returns 项目名称数组（子目录名）
 */
export function listProjects(): string[] {
  try {
    if (!existsSync(PROJECTS_DIR)) return [];
    return readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}
