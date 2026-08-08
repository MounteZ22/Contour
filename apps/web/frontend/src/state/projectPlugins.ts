import { atom } from "jotai";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
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

export interface ProjectPluginState {
  config: ProjectPluginConfig | null;
  isLoading: boolean;
  error: string | null;
}

export const initialProjectPluginState: ProjectPluginState = {
  config: null,
  isLoading: false,
  error: null,
};

/** 项目插件设置页的临时界面状态；唯一持久化来源仍是后端 plugins.json。 */
export const projectPluginStatesAtom = atom<Record<string, ProjectPluginState>>({});

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function readResponse<T>(response: Response | Promise<Response>, fallback: string): Promise<T> {
  const resolved = await response;
  const payload = await resolved.json().catch(() => null) as ApiResponse<T> | null;
  if (!resolved.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.error || fallback);
  }
  return payload.data;
}

function endpoint(projectId: string, suffix = ""): string {
  return `/api/projects/${encodeURIComponent(projectId)}/plugins${suffix}`;
}

export function fetchProjectPlugins(projectId: string): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId)), "读取插件配置失败");
}

export function addProjectMcpServer(
  projectId: string,
  input: { name: string; command: string; args: string[]; env: Record<string, string>; toolLimit: number },
): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId, "/mcp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }), "添加 MCP 服务失败");
}

export function setProjectMcpEnabled(projectId: string, serverId: string, enabled: boolean): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId, `/mcp/${encodeURIComponent(serverId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  }), "更新 MCP 服务失败");
}

export function removeProjectMcpServer(projectId: string, serverId: string): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId, `/mcp/${encodeURIComponent(serverId)}`), {
    method: "DELETE",
  }), "移除 MCP 服务失败");
}

export function addProjectSkillDirectory(projectId: string, path: string): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId, "/skills"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }), "添加技能目录失败");
}

export function setProjectSkillEnabled(projectId: string, skillId: string, enabled: boolean): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId, `/skills/${encodeURIComponent(skillId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  }), "更新技能目录失败");
}

export function removeProjectSkillDirectory(projectId: string, skillId: string): Promise<ProjectPluginConfig> {
  return readResponse<ProjectPluginConfig>(fetch(endpoint(projectId, `/skills/${encodeURIComponent(skillId)}`), {
    method: "DELETE",
  }), "移除技能目录失败");
}
