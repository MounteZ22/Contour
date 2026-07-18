/**
 * projectManager — 项目隔离配置管理
 *
 * config.json 只保存机器相关路径。路径暂时不可用时仍保留配置，调用方通过
 * available 状态向用户说明当前可用性。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PROJECTS_DIR } from "../config.js";
import { ValidationError } from "../vault/validate.js";

export interface ProjectConfig {
  /** D 盘项目目录绝对路径（如 D:/Contour-dev/示例研究项目） */
  projectDir: string;
  /** 附加目录绝对路径列表 */
  attachedDirectories: string[];
  /** 附加文件绝对路径列表 */
  attachedFiles: string[];
}

export interface AttachedPathStatus {
  path: string;
  available: boolean;
}

export interface ProjectConfigStatus {
  projectDir: string;
  attachedDirectories: AttachedPathStatus[];
  attachedFiles: AttachedPathStatus[];
}

type AttachmentKind = "directory" | "file";

const DEFAULT_CONFIG: ProjectConfig = {
  projectDir: "",
  attachedDirectories: [],
  attachedFiles: [],
};

function emptyConfig(): ProjectConfig {
  return { projectDir: "", attachedDirectories: [], attachedFiles: [] };
}

/**
 * 项目 ID 是本地目录 basename。允许中文、空格、字母、数字、连字符和下划线，
 * 但拒绝路径分隔符、Windows 保留字符和点目录。
 */
export function validateProjectId(projectId: unknown): asserts projectId is string {
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    projectId.length > 255 ||
    projectId === "." ||
    projectId === ".." ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(projectId) ||
    /[. ]$/.test(projectId) ||
    path.basename(projectId) !== projectId
  ) {
    throw new ValidationError("项目 ID 无效");
  }
}

function projectDataDir(projectId: string): string {
  validateProjectId(projectId);
  const root = path.resolve(PROJECTS_DIR);
  const target = path.resolve(root, projectId);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ValidationError("项目 ID 无效");
  }
  return target;
}

function configFilePath(projectId: string): string {
  return path.join(projectDataDir(projectId), "config.json");
}

function normalizedAbsolutePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new ValidationError("路径必须是绝对路径");
  }
  return path.normalize(path.resolve(trimmed));
}

function comparisonKey(value: string): string {
  const normalized = path.normalize(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function normalizeStoredPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !path.isAbsolute(item)) continue;
    const normalized = path.normalize(path.resolve(item));
    const key = comparisonKey(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      paths.push(normalized);
    }
  }
  return paths;
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateAttachmentTarget(inputPath: string, kind: AttachmentKind): string {
  const normalized = normalizedAbsolutePath(inputPath);
  let canonicalPath: string;
  let stats;
  try {
    canonicalPath = realpathSync.native(normalized);
    stats = statSync(canonicalPath);
  } catch {
    throw new ValidationError(`${kind === "directory" ? "目录" : "文件"}不存在或无法访问: ${normalized}`);
  }

  if (kind === "directory" && !stats.isDirectory()) {
    throw new ValidationError(`路径不是目录: ${canonicalPath}`);
  }
  if (kind === "file" && !stats.isFile()) {
    throw new ValidationError(`路径不是文件: ${canonicalPath}`);
  }

  const root = path.parse(canonicalPath).root;
  if (kind === "directory" && comparisonKey(canonicalPath) === comparisonKey(root)) {
    throw new ValidationError("不允许附加磁盘根目录");
  }

  const contourDataRoot = path.dirname(path.resolve(PROJECTS_DIR));
  if (isInside(contourDataRoot, canonicalPath)) {
    throw new ValidationError("不允许附加 Contour 自身的数据目录或文件");
  }

  return path.normalize(canonicalPath);
}

function isAvailable(filePath: string, kind: AttachmentKind): boolean {
  try {
    const stats = statSync(filePath);
    return kind === "directory" ? stats.isDirectory() : stats.isFile();
  } catch {
    return false;
  }
}

function atomicWriteConfig(filePath: string, config: ProjectConfig): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.config-${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

/** 确保项目数据目录与 config.json 存在。 */
export function ensureProjectDir(projectId: string, projectDir?: string): string {
  const dir = projectDataDir(projectId);
  const configPath = configFilePath(projectId);
  mkdirSync(dir, { recursive: true });

  if (!existsSync(configPath)) {
    saveProjectConfig({ ...DEFAULT_CONFIG, projectDir: projectDir ?? "" }, projectId);
  } else if (projectDir) {
    const existing = getProjectConfig(projectId);
    if (existing.projectDir !== projectDir) {
      saveProjectConfig({ ...existing, projectDir }, projectId);
    }
  }
  return dir;
}

/** 读取项目配置；旧配置缺少 attachedFiles 时自动按空数组处理。 */
export function getProjectConfig(projectId: string): ProjectConfig {
  const filePath = configFilePath(projectId);
  if (!existsSync(filePath)) return emptyConfig();

  let parsed: Partial<ProjectConfig>;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<ProjectConfig>;
  } catch (error) {
    throw new Error(`项目配置文件损坏，已停止写入以保护原数据: ${filePath}`, { cause: error });
  }
  return {
    projectDir: typeof parsed.projectDir === "string" ? parsed.projectDir : "",
    attachedDirectories: normalizeStoredPaths(parsed.attachedDirectories),
    attachedFiles: normalizeStoredPaths(parsed.attachedFiles),
  };
}

/** 以临时文件 + 重命名方式原子保存，避免进程中断留下半个 JSON。 */
export function saveProjectConfig(config: ProjectConfig, projectId: string): void {
  const normalized: ProjectConfig = {
    projectDir: typeof config.projectDir === "string" ? config.projectDir : "",
    attachedDirectories: normalizeStoredPaths(config.attachedDirectories),
    attachedFiles: normalizeStoredPaths(config.attachedFiles),
  };
  atomicWriteConfig(configFilePath(projectId), normalized);
}

/** 返回全部已配置路径及其当前可用状态，不删除或隐藏离线路径。 */
export function getProjectConfigStatus(projectId: string): ProjectConfigStatus {
  const config = getProjectConfig(projectId);
  return {
    projectDir: config.projectDir,
    attachedDirectories: config.attachedDirectories.map((itemPath) => ({
      path: itemPath,
      available: isAvailable(itemPath, "directory"),
    })),
    attachedFiles: config.attachedFiles.map((itemPath) => ({
      path: itemPath,
      available: isAvailable(itemPath, "file"),
    })),
  };
}

/** 兼容旧调用：返回全部已配置目录，包括暂时离线的目录。 */
export function getAttachedDirectories(projectId: string): string[] {
  return getProjectConfig(projectId).attachedDirectories;
}

export function attachDirectory(dirPath: string, projectId: string): ProjectConfig {
  return attachPath(dirPath, projectId, "directory");
}

export function attachFile(filePath: string, projectId: string): ProjectConfig {
  return attachPath(filePath, projectId, "file");
}

function attachPath(inputPath: string, projectId: string, kind: AttachmentKind): ProjectConfig {
  const canonicalPath = validateAttachmentTarget(inputPath, kind);
  const config = getProjectConfig(projectId);
  const target = kind === "directory" ? config.attachedDirectories : config.attachedFiles;
  const key = comparisonKey(canonicalPath);
  if (!target.some((existing) => comparisonKey(existing) === key)) {
    target.push(canonicalPath);
    saveProjectConfig(config, projectId);
  }
  return config;
}

export function detachDirectory(dirPath: string, projectId: string): ProjectConfig {
  return detachPath(dirPath, projectId, "directory");
}

export function detachFile(filePath: string, projectId: string): ProjectConfig {
  return detachPath(filePath, projectId, "file");
}

function detachPath(inputPath: string, projectId: string, kind: AttachmentKind): ProjectConfig {
  const normalized = normalizedAbsolutePath(inputPath);
  const key = comparisonKey(normalized);
  const config = getProjectConfig(projectId);
  if (kind === "directory") {
    config.attachedDirectories = config.attachedDirectories.filter(
      (existing) => comparisonKey(existing) !== key,
    );
  } else {
    config.attachedFiles = config.attachedFiles.filter(
      (existing) => comparisonKey(existing) !== key,
    );
  }
  saveProjectConfig(config, projectId);
  return config;
}

/** 列出所有已存在的项目数据目录。 */
export function listProjects(): string[] {
  try {
    if (!existsSync(PROJECTS_DIR)) return [];
    return readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}
