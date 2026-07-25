import path from "node:path";
import { CONFIG } from "../config.js";
import type { AIContextItem, ProjectData } from "../types.js";
import { getSessionWorkspaceDir } from "../agent/session-storage.js";
import {
  getProjectConfigStatus,
  type ProjectConfigStatus,
} from "./projectManager.js";
import { loadProjects } from "../vault/loader.js";
import { ROLE_PROMPT } from "./prompts/role.js";
import { TOOL_GUIDELINES_PROMPT } from "./prompts/tool-guidelines.js";
import { buildWorkspaceInfo } from "./prompts/workspace-info.js";
import { KNOWLEDGE_RULES_PROMPT } from "./prompts/knowledge-rules.js";
import { TASK_STANDARDS_PROMPT } from "./prompts/task-standards.js";
import { INTERACTION_NORMS_PROMPT } from "./prompts/interaction-norms.js";
import { UNCERTAINTY_HANDLING_PROMPT } from "./prompts/uncertainty-handling.js";
import { renderDynamicContext } from "./prompts/dynamic-context.js";

export interface DynamicContextOptions {
  contextItems?: AIContextItem[];
  /** Vault 内的业务 projectId，例如 PRJ_001。 */
  projectId?: string;
  /** 本地配置目录名，通常是 Vault 目录 basename。 */
  projectStorageId: string;
  projectDir: string;
  sessionId?: string;
  dataDir?: string;
  now?: Date;
}

export interface PromptBuilderDependencies {
  loadProjects: typeof loadProjects;
  getProjectConfigStatus: typeof getProjectConfigStatus;
}

const DEFAULT_DEPENDENCIES: PromptBuilderDependencies = {
  loadProjects,
  getProjectConfigStatus,
};

const STATIC_SYSTEM_PROMPT = [
  ROLE_PROMPT,
  TOOL_GUIDELINES_PROMPT,
  KNOWLEDGE_RULES_PROMPT,
  TASK_STANDARDS_PROMPT,
  INTERACTION_NORMS_PROMPT,
  UNCERTAINTY_HANDLING_PROMPT,
].join("\n\n");

/** 固定产品规则。不读取项目数据，因此不同轮次的结果保持一致。 */
export function buildSystemPrompt(): string {
  return STATIC_SYSTEM_PROMPT;
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved;
  };
  return normalize(left) === normalize(right);
}

function findCurrentProject(projects: ProjectData[], options: DynamicContextOptions) {
  return projects.find((project) =>
    (options.projectId && project.projectId === options.projectId) ||
    samePath(project.projectDir, options.projectDir) ||
    path.basename(project.projectDir) === options.projectStorageId);
}

function unavailableConfig(projectDir: string): ProjectConfigStatus {
  return { projectDir, attachedDirectories: [], attachedFiles: [] };
}

/** 每条用户消息前重新读取项目、路径状态和已选资料。 */
export async function buildDynamicContext(
  options: DynamicContextOptions,
  dependencies: PromptBuilderDependencies = DEFAULT_DEPENDENCIES,
): Promise<string> {
  const projects = await dependencies.loadProjects(CONFIG.VAULTS_DIR, CONFIG.LEGACY_VAULT);
  const project = findCurrentProject(projects, options);
  let config = unavailableConfig(options.projectDir);
  let configWarning: string | undefined;
  try {
    config = dependencies.getProjectConfigStatus(options.projectStorageId);
  } catch (error) {
    configWarning = error instanceof Error ? error.message : "项目配置暂时无法读取";
  }

  const dataDir = options.dataDir ?? CONFIG.DATA_DIR;
  const sessionWorkspacePath = options.sessionId
    ? getSessionWorkspaceDir(dataDir, options.projectStorageId, options.sessionId)
    : path.join(dataDir, "projects", options.projectStorageId, "sessions", "（未提供 sessionId）");

  const workspaceInfo = buildWorkspaceInfo({
    projectTitle: project?.title,
    researchGoal: project?.researchGoal,
    currentStage: project?.currentStage,
    vaultPath: options.projectDir,
    sessionWorkspacePath,
    attachedDirectories: config.attachedDirectories,
    attachedFiles: config.attachedFiles,
    configWarning,
  });

  return renderDynamicContext({
    now: options.now ?? new Date(),
    project,
    contextItems: options.contextItems ?? [],
    candidateProjects: projects,
    workspaceInfo,
  });
}

/** Pi 默认 Prompt 之外的 Contour Prompt 总入口。 */
export async function buildAgentPrompt(
  options: DynamicContextOptions,
  dependencies: PromptBuilderDependencies = DEFAULT_DEPENDENCIES,
): Promise<string> {
  return `${buildSystemPrompt()}\n\n${await buildDynamicContext(options, dependencies)}`;
}

export { ROLE_PROMPT } from "./prompts/role.js";
export { TOOL_GUIDELINES_PROMPT } from "./prompts/tool-guidelines.js";
export { buildWorkspaceInfo } from "./prompts/workspace-info.js";
export { KNOWLEDGE_RULES_PROMPT } from "./prompts/knowledge-rules.js";
export { TASK_STANDARDS_PROMPT } from "./prompts/task-standards.js";
export { INTERACTION_NORMS_PROMPT } from "./prompts/interaction-norms.js";
export { UNCERTAINTY_HANDLING_PROMPT } from "./prompts/uncertainty-handling.js";
export { renderDynamicContext } from "./prompts/dynamic-context.js";
