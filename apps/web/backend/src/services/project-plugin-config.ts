/**
 * 项目插件配置。
 *
 * 这里只保存用户明确授权的配置，绝不自动发现技能、启动 MCP 进程或加载插件代码。
 * MCP 的实际桥接层必须另行读取并执行自己的权限校验。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PROJECTS_DIR } from "../config.js";
import { ValidationError } from "../vault/validate.js";
import { comparisonKey } from "../vault/path-utils.js";
import { validateProjectId } from "./projectManager.js";

const MAX_MCP_SERVERS = 3;
const MAX_MCP_TOOLS = 20;
const MAX_SKILLS = 10;
const MAX_ENV_ENTRIES = 8;
const MAX_ARGS = 20;
const MAX_ARG_LENGTH = 1024;
const MAX_ENV_VALUE_LENGTH = 4096;
const BLOCKED_COMMANDS = new Set([
  "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe",
  "npm", "npm.cmd", "npx", "npx.cmd", "yarn", "yarn.cmd",
  "sh", "bash", "zsh", "shell", "shell.exe", "wscript", "cscript",
]);
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ITEM_ID_RE = /^[a-f0-9-]{36}$/i;

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  /** 未来运行时对该服务可见工具数的硬上限。 */
  toolLimit: number;
}

export interface SkillDirectoryConfig {
  id: string;
  path: string;
  enabled: boolean;
}

export interface ProjectPluginConfig {
  version: 1;
  mcpServers: McpServerConfig[];
  skillDirectories: SkillDirectoryConfig[];
}

export interface AddMcpServerInput {
  name: unknown;
  command: unknown;
  args?: unknown;
  env?: unknown;
  toolLimit?: unknown;
}

const EMPTY_CONFIG: ProjectPluginConfig = {
  version: 1,
  mcpServers: [],
  skillDirectories: [],
};

function projectDataDir(storageId: string): string {
  validateProjectId(storageId);
  const root = path.resolve(PROJECTS_DIR);
  const target = path.resolve(root, storageId);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ValidationError("项目 ID 无效");
  }
  return target;
}

function pluginsFilePath(storageId: string): string {
  return path.join(projectDataDir(storageId), "plugins.json");
}

function cloneEmptyConfig(): ProjectPluginConfig {
  return { version: 1, mcpServers: [], skillDirectories: [] };
}

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && ITEM_ID_RE.test(value) ? value : null;
}

function asSafeName(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
    throw new ValidationError(`${field} 必须是 1-80 个字符`);
  }
  return value.trim();
}

function canonicalExecutable(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value.trim())) {
    throw new ValidationError("MCP 命令必须是存在的绝对可执行文件路径");
  }

  let resolved: string;
  try {
    resolved = realpathSync.native(path.normalize(value.trim()));
    if (!statSync(resolved).isFile()) throw new Error("not a file");
  } catch {
    throw new ValidationError("MCP 命令不存在、不可访问或不是文件");
  }

  if (BLOCKED_COMMANDS.has(path.basename(resolved).toLowerCase())) {
    throw new ValidationError("不允许使用命令解释器或包管理器作为 MCP 命令");
  }
  return path.normalize(resolved);
}

function validateArgs(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ARGS) {
    throw new ValidationError(`MCP 参数必须是最多 ${MAX_ARGS} 项的字符串列表`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.length > MAX_ARG_LENGTH || item.includes("\u0000")) {
      throw new ValidationError(`每个 MCP 参数必须是不超过 ${MAX_ARG_LENGTH} 字符的文本`);
    }
    return item;
  });
}

function validateEnv(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("MCP 环境变量必须是键值对象");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_ENV_ENTRIES) {
    throw new ValidationError(`MCP 环境变量最多 ${MAX_ENV_ENTRIES} 项`);
  }
  const env: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (!ENV_KEY_RE.test(key) || typeof item !== "string" || item.length > MAX_ENV_VALUE_LENGTH || item.includes("\u0000")) {
      throw new ValidationError("MCP 环境变量名或值无效");
    }
    env[key] = item;
  }
  return env;
}

function validateToolLimit(value: unknown): number {
  if (value === undefined) return 6;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_MCP_TOOLS) {
    throw new ValidationError(`单个 MCP 服务的工具上限必须在 1-${MAX_MCP_TOOLS} 之间`);
  }
  return value as number;
}

function canonicalSkillDirectory(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value.trim())) {
    throw new ValidationError("技能目录必须是存在的绝对路径");
  }
  let resolved: string;
  try {
    resolved = realpathSync.native(path.normalize(value.trim()));
    if (!statSync(resolved).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new ValidationError("技能目录不存在、不可访问或不是目录");
  }
  if (comparisonKey(resolved) === comparisonKey(path.parse(resolved).root)) {
    throw new ValidationError("不允许将磁盘根目录添加为技能目录");
  }
  return path.normalize(resolved);
}

function normalizeStoredConfig(value: unknown): ProjectPluginConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cloneEmptyConfig();
  const raw = value as Partial<ProjectPluginConfig>;
  const mcpServers = Array.isArray(raw.mcpServers) ? raw.mcpServers.slice(0, MAX_MCP_SERVERS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const server = item as Partial<McpServerConfig>;
    const id = normalizeId(server.id);
    if (!id || typeof server.name !== "string" || typeof server.command !== "string" || !path.isAbsolute(server.command)) return [];
    if (!Array.isArray(server.args) || !server.args.every((arg) => typeof arg === "string")) return [];
    if (!server.env || typeof server.env !== "object" || Array.isArray(server.env)) return [];
    const toolLimit = server.toolLimit;
    if (!Number.isInteger(toolLimit) || toolLimit === undefined || toolLimit < 1 || toolLimit > MAX_MCP_TOOLS) return [];
    return [{
      id,
      name: server.name.slice(0, 80),
      command: path.normalize(server.command),
      args: server.args.slice(0, MAX_ARGS),
      env: Object.fromEntries(Object.entries(server.env).slice(0, MAX_ENV_ENTRIES).filter(([key, envValue]) => ENV_KEY_RE.test(key) && typeof envValue === "string").map(([key, envValue]) => [key, envValue.slice(0, MAX_ENV_VALUE_LENGTH)])),
      enabled: server.enabled === true,
      toolLimit,
    }];
  }) : [];
  const skillDirectories = Array.isArray(raw.skillDirectories) ? raw.skillDirectories.slice(0, MAX_SKILLS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const skill = item as Partial<SkillDirectoryConfig>;
    const id = normalizeId(skill.id);
    if (!id || typeof skill.path !== "string" || !path.isAbsolute(skill.path)) return [];
    return [{ id, path: path.normalize(skill.path), enabled: skill.enabled === true }];
  }) : [];
  return { version: 1, mcpServers, skillDirectories };
}

function assertToolBudget(servers: McpServerConfig[]): void {
  const total = servers.reduce((sum, server) => sum + server.toolLimit, 0);
  if (total > MAX_MCP_TOOLS) {
    throw new ValidationError(`所有 MCP 服务的工具上限合计不能超过 ${MAX_MCP_TOOLS}`);
  }
}

function atomicWrite(filePath: string, config: ProjectPluginConfig): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const temporary = path.join(dir, `.plugins-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    renameSync(temporary, filePath);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function getProjectPluginConfig(storageId: string): ProjectPluginConfig {
  const filePath = pluginsFilePath(storageId);
  if (!existsSync(filePath)) return cloneEmptyConfig();
  try {
    return normalizeStoredConfig(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch (error) {
    throw new Error(`插件配置文件损坏，已停止写入以保护原数据: ${filePath}`, { cause: error });
  }
}

function saveProjectPluginConfig(storageId: string, config: ProjectPluginConfig): ProjectPluginConfig {
  assertToolBudget(config.mcpServers);
  atomicWrite(pluginsFilePath(storageId), config);
  return config;
}

export function addMcpServer(storageId: string, input: AddMcpServerInput): ProjectPluginConfig {
  const config = getProjectPluginConfig(storageId);
  if (config.mcpServers.length >= MAX_MCP_SERVERS) {
    throw new ValidationError(`每个项目最多添加 ${MAX_MCP_SERVERS} 个 MCP 服务`);
  }
  const server: McpServerConfig = {
    id: randomUUID(),
    name: asSafeName(input.name, "MCP 名称"),
    command: canonicalExecutable(input.command),
    args: validateArgs(input.args),
    env: validateEnv(input.env),
    enabled: false,
    toolLimit: validateToolLimit(input.toolLimit),
  };
  assertToolBudget([...config.mcpServers, server]);
  return saveProjectPluginConfig(storageId, { ...config, mcpServers: [...config.mcpServers, server] });
}

export function removeMcpServer(storageId: string, serverId: string): ProjectPluginConfig {
  const config = getProjectPluginConfig(storageId);
  return saveProjectPluginConfig(storageId, {
    ...config,
    mcpServers: config.mcpServers.filter((server) => server.id !== serverId),
  });
}

export function setMcpServerEnabled(storageId: string, serverId: string, enabled: unknown): ProjectPluginConfig {
  if (typeof enabled !== "boolean") throw new ValidationError("enabled 必须是布尔值");
  const config = getProjectPluginConfig(storageId);
  if (!config.mcpServers.some((server) => server.id === serverId)) throw new ValidationError("MCP 服务不存在");
  return saveProjectPluginConfig(storageId, {
    ...config,
    mcpServers: config.mcpServers.map((server) => server.id === serverId ? { ...server, enabled } : server),
  });
}

export function addSkillDirectory(storageId: string, directory: unknown): ProjectPluginConfig {
  const config = getProjectPluginConfig(storageId);
  if (config.skillDirectories.length >= MAX_SKILLS) {
    throw new ValidationError(`每个项目最多添加 ${MAX_SKILLS} 个技能目录`);
  }
  const canonicalPath = canonicalSkillDirectory(directory);
  if (config.skillDirectories.some((skill) => comparisonKey(skill.path) === comparisonKey(canonicalPath))) {
    throw new ValidationError("该技能目录已经添加");
  }
  return saveProjectPluginConfig(storageId, {
    ...config,
    skillDirectories: [...config.skillDirectories, { id: randomUUID(), path: canonicalPath, enabled: false }],
  });
}

export function removeSkillDirectory(storageId: string, skillId: string): ProjectPluginConfig {
  const config = getProjectPluginConfig(storageId);
  return saveProjectPluginConfig(storageId, {
    ...config,
    skillDirectories: config.skillDirectories.filter((skill) => skill.id !== skillId),
  });
}

export function setSkillDirectoryEnabled(storageId: string, skillId: string, enabled: unknown): ProjectPluginConfig {
  if (typeof enabled !== "boolean") throw new ValidationError("enabled 必须是布尔值");
  const config = getProjectPluginConfig(storageId);
  if (!config.skillDirectories.some((skill) => skill.id === skillId)) throw new ValidationError("技能目录不存在");
  return saveProjectPluginConfig(storageId, {
    ...config,
    skillDirectories: config.skillDirectories.map((skill) => skill.id === skillId ? { ...skill, enabled } : skill),
  });
}

/**
 * 在 Agent 启动时重新校验启用项。配置文件可被用户手动编辑，因此不能只信任
 * 添加时的校验结果；任何失效或被符号链接替换的项目都不会进入运行时。
 */
export function getEnabledProjectMcpServers(storageId: string): McpServerConfig[] {
  return getProjectPluginConfig(storageId).mcpServers.flatMap((server) => {
    if (!server.enabled) return [];
    try {
      const command = canonicalExecutable(server.command);
      if (comparisonKey(command) !== comparisonKey(server.command)) return [];
      return [{
        ...server,
        command,
        args: validateArgs(server.args),
        env: validateEnv(server.env),
        toolLimit: validateToolLimit(server.toolLimit),
      }];
    } catch {
      return [];
    }
  });
}

/** 返回经过 realpath 二次确认的、用户显式启用的技能目录。 */
export function getEnabledProjectSkillDirectories(storageId: string): string[] {
  return getProjectPluginConfig(storageId).skillDirectories.flatMap((skill) => {
    if (!skill.enabled) return [];
    try {
      const resolved = canonicalSkillDirectory(skill.path);
      return comparisonKey(resolved) === comparisonKey(skill.path) ? [resolved] : [];
    } catch {
      return [];
    }
  });
}
