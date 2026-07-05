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
import { PROJECTS_DIR, CONFIG } from "../config.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface ProjectConfig {
  /** 附加目录绝对路径列表 */
  attachedDirectories: string[];
}

// ── 路径工具 ───────────────────────────────────────────────────────────────

/**
 * 从 VAULTS_DIR 取 basename 作为项目名
 *
 * 例如 D:\Contour-dev → "Contour-dev"，D:\Contour → "Contour"
 */
export function getProjectName(): string {
  return path.basename(CONFIG.VAULTS_DIR);
}

/**
 * 确保项目目录存在并返回路径
 *
 * @param projectName - 项目名，缺省时从 VAULTS_DIR 自动获取
 * @returns ~/.contour[-dev]/projects/{name}/
 */
export function ensureProjectDir(projectName?: string): string {
  const name = projectName ?? getProjectName();
  const dir = path.join(PROJECTS_DIR, name);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── 项目配置 ───────────────────────────────────────────────────────────────

/** config.json 的绝对路径 */
function configFilePath(projectName?: string): string {
  return path.join(ensureProjectDir(projectName), "config.json");
}

/**
 * 读取项目配置，不存在时返回默认值
 */
export function getProjectConfig(projectName?: string): ProjectConfig {
  const filePath = configFilePath(projectName);
  try {
    if (!existsSync(filePath)) return { attachedDirectories: [] };
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return { attachedDirectories: [] };
  }
}

/**
 * 保存项目配置
 */
export function saveProjectConfig(config: ProjectConfig, projectName?: string): void {
  const filePath = configFilePath(projectName);
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
export function getAttachedDirectories(projectName?: string): string[] {
  const config = getProjectConfig(projectName);
  return config.attachedDirectories.filter((d) => existsSync(d));
}

/**
 * 添加附加目录
 *
 * @throws 如果目录不存在
 */
export function attachDirectory(dirPath: string, projectName?: string): ProjectConfig {
  if (!existsSync(dirPath)) {
    throw new Error(`目录不存在: ${dirPath}`);
  }

  const absPath = path.resolve(dirPath);
  const config = getProjectConfig(projectName);

  if (!config.attachedDirectories.includes(absPath)) {
    config.attachedDirectories.push(absPath);
    saveProjectConfig(config, projectName);
  }

  return config;
}

/**
 * 移除附加目录
 */
export function detachDirectory(dirPath: string, projectName?: string): ProjectConfig {
  const absPath = path.resolve(dirPath);
  const config = getProjectConfig(projectName);
  config.attachedDirectories = config.attachedDirectories.filter(
    (d) => path.resolve(d) !== absPath,
  );
  saveProjectConfig(config, projectName);
  return config;
}

/**
 * 清理已不存在的附加目录路径
 */
export function cleanupStaleAttachedPaths(projectName?: string): void {
  const config = getProjectConfig(projectName);
  const before = config.attachedDirectories.length;
  config.attachedDirectories = config.attachedDirectories.filter((d) =>
    existsSync(d),
  );
  if (config.attachedDirectories.length !== before) {
    saveProjectConfig(config, projectName);
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
