/**
 * 项目根目录 AGENTS.md / CLAUDE.md 的受控读取。
 *
 * 这些文件是用户维护的项目指导，不是运行时配置或权限边界。读取时必须固定在
 * projectDir 根目录，避免 Pi SDK 的自动祖先扫描把会话或磁盘其他位置的文件带入提示词。
 */
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

export const PROJECT_AGENTS_FILE_NAME = "AGENTS.md";
export const PROJECT_CLAUDE_FILE_NAME = "CLAUDE.md";
export const PROJECT_GUIDANCE_FILE_NAMES = [
  PROJECT_AGENTS_FILE_NAME,
  PROJECT_CLAUDE_FILE_NAME,
] as const;
export const MAX_PROJECT_GUIDANCE_BYTES = 32 * 1024;
export const MAX_PROJECT_GUIDANCE_LINES = 199;

// 保留旧常量名，避免已有调用方在本次扩展中被破坏。
export const MAX_PROJECT_CLAUDE_BYTES = MAX_PROJECT_GUIDANCE_BYTES;
export const MAX_PROJECT_CLAUDE_LINES = MAX_PROJECT_GUIDANCE_LINES;

export interface ProjectGuidanceInstructions {
  fileName: (typeof PROJECT_GUIDANCE_FILE_NAMES)[number];
  path: string;
  content: string;
}

export type ProjectClaudeInstructions = Omit<ProjectGuidanceInstructions, "fileName">;

export interface ProjectGuidanceFileSystem {
  realpath(inputPath: string): Promise<string>;
  lstat(inputPath: string): Promise<{ isFile(): boolean; isSymbolicLink(): boolean }>;
  readFile(inputPath: string): Promise<Buffer>;
}

/** @deprecated 新代码请使用 ProjectGuidanceFileSystem。 */
export type ProjectClaudeFileSystem = ProjectGuidanceFileSystem;

const DEFAULT_FILE_SYSTEM: ProjectGuidanceFileSystem = { lstat, readFile, realpath };

function isInsideDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function loadProjectGuidanceFile(
  projectDir: string,
  fileName: (typeof PROJECT_GUIDANCE_FILE_NAMES)[number],
  fileSystem: ProjectGuidanceFileSystem = DEFAULT_FILE_SYSTEM,
): Promise<ProjectGuidanceInstructions | null> {
  const candidate = path.join(projectDir, fileName);

  let projectRoot: string;
  let filePath: string;
  try {
    projectRoot = await fileSystem.realpath(projectDir);
    const metadata = await fileSystem.lstat(candidate);
    if (!metadata.isFile() && !metadata.isSymbolicLink()) return null;
    filePath = await fileSystem.realpath(candidate);
  } catch {
    return null;
  }

  if (!isInsideDirectory(projectRoot, filePath)) return null;

  let bytes: Buffer;
  try {
    bytes = await fileSystem.readFile(filePath);
  } catch {
    return null;
  }

  if (bytes.byteLength > MAX_PROJECT_GUIDANCE_BYTES || bytes.includes(0)) return null;

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }

  if (content.split(/\r\n|\r|\n/).length > MAX_PROJECT_GUIDANCE_LINES) return null;
  return { fileName, path: filePath, content };
}

/**
 * 读取项目根目录的 AGENTS.md 与 CLAUDE.md；不满足安全和大小限制时静默跳过。
 *
 * 两个文件始终按 AGENTS.md、CLAUDE.md 的固定顺序返回。每次构建动态上下文都会
 * 调用此函数，因此用户对文件的更新会在下一轮对话生效。
 */
export async function loadProjectGuidanceInstructions(
  projectDir: string,
  fileSystem: ProjectGuidanceFileSystem = DEFAULT_FILE_SYSTEM,
): Promise<ProjectGuidanceInstructions[]> {
  const instructions: ProjectGuidanceInstructions[] = [];
  for (const fileName of PROJECT_GUIDANCE_FILE_NAMES) {
    const instruction = await loadProjectGuidanceFile(projectDir, fileName, fileSystem);
    if (instruction) instructions.push(instruction);
  }
  return instructions;
}

/**
 * 兼容旧调用方：仅返回 CLAUDE.md。新代码应使用 loadProjectGuidanceInstructions。
 */
export async function loadProjectClaudeInstructions(
  projectDir: string,
  fileSystem: ProjectGuidanceFileSystem = DEFAULT_FILE_SYSTEM,
): Promise<ProjectClaudeInstructions | null> {
  const instruction = await loadProjectGuidanceFile(projectDir, PROJECT_CLAUDE_FILE_NAME, fileSystem);
  if (!instruction) return null;
  return { path: instruction.path, content: instruction.content };
}
