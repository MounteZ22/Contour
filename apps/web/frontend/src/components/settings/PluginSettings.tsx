import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { FolderCog, Loader2, PlugZap, Plus, ShieldAlert, TerminalSquare, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { showToast } from "../Toast";
import { SettingsCard, SettingsRow, SettingsSection } from "./primitives";
import {
  addProjectMcpServer,
  addProjectSkillDirectory,
  fetchProjectPlugins,
  initialProjectPluginState,
  projectPluginStatesAtom,
  removeProjectMcpServer,
  removeProjectSkillDirectory,
  setProjectMcpEnabled,
  setProjectSkillEnabled,
  type ProjectPluginConfig,
} from "@/state/projectPlugins";

interface PluginSettingsProps {
  projectId: string;
}

function Toggle({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-accent-strong" : "bg-border"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      disabled={disabled}
      onClick={onChange}
      role="switch"
      type="button"
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-accent-on transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function parseLines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function parseEnvironment(value: string): Record<string, string> {
  const entries = parseLines(value).map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("环境变量每行应为 KEY=value");
    return [line.slice(0, separator).trim(), line.slice(separator + 1)] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * 项目插件管理面板。
 * 组件仅编辑显式配置；添加或切换开关不会在设置页启动外部进程。
 */
export function PluginSettings({ projectId }: PluginSettingsProps) {
  const [states, setStates] = useAtom(projectPluginStatesAtom);
  const state = states[projectId] ?? initialProjectPluginState;
  const [mcpName, setMcpName] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpEnv, setMcpEnv] = useState("");
  const [mcpToolLimit, setMcpToolLimit] = useState("6");
  const [skillPath, setSkillPath] = useState("");
  const [saving, setSaving] = useState(false);

  const updateState = useCallback((next: Partial<typeof state>) => {
    setStates((current) => ({ ...current, [projectId]: { ...initialProjectPluginState, ...(current[projectId] ?? {}), ...next } }));
  }, [projectId, setStates]);

  const load = useCallback(async () => {
    updateState({ isLoading: true, error: null });
    try {
      updateState({ config: await fetchProjectPlugins(projectId), isLoading: false });
    } catch (error) {
      updateState({ isLoading: false, error: error instanceof Error ? error.message : "读取插件配置失败" });
    }
  }, [projectId, updateState]);

  useEffect(() => { void load(); }, [load]);

  const toolBudget = useMemo(() => state.config?.mcpServers.reduce((sum, server) => sum + server.toolLimit, 0) ?? 0, [state.config]);
  const replaceConfig = (config: ProjectPluginConfig, message: string) => {
    updateState({ config, error: null });
    showToast(message, "success");
  };
  const run = async (action: () => Promise<ProjectPluginConfig>, message: string) => {
    if (saving) return;
    setSaving(true);
    try {
      replaceConfig(await action(), message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "保存插件配置失败";
      updateState({ error: detail });
      showToast(`保存失败：${detail}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const addMcp = () => void run(async () => {
    const toolLimit = Number(mcpToolLimit);
    if (!Number.isInteger(toolLimit)) throw new Error("工具上限必须是整数");
    const config = await addProjectMcpServer(projectId, {
      name: mcpName.trim(),
      command: mcpCommand.trim(),
      args: parseLines(mcpArgs),
      env: parseEnvironment(mcpEnv),
      toolLimit,
    });
    setMcpName(""); setMcpCommand(""); setMcpArgs(""); setMcpEnv(""); setMcpToolLimit("6");
    return config;
  }, "MCP 服务已添加，默认保持关闭");

  const addSkill = () => void run(async () => {
    const config = await addProjectSkillDirectory(projectId, skillPath.trim());
    setSkillPath("");
    return config;
  }, "技能目录已添加，默认保持关闭");

  if (state.isLoading && !state.config) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary"><Loader2 className="animate-spin" size={18} />正在读取插件配置...</div>;
  }

  if (!state.config) {
    return (
      <SettingsSection description="项目插件配置不可用。" title="插件">
        <SettingsCard divided={false}><div className="px-4 py-6 text-sm text-danger">{state.error ?? "读取插件配置失败"}</div></SettingsCard>
        <Button onClick={() => void load()} size="sm" type="button" variant="outline">重试</Button>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsSection description="仅保存这个项目明确授权的本地插件配置；不自动发现目录，也不会在添加时运行任何程序。" title="插件">
        <SettingsCard divided={false}>
          <div className="flex items-start gap-3 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle-bg text-accent-subtle-text"><PlugZap size={18} /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-text-primary">项目级插件权限</p><p className="mt-1 text-sm leading-relaxed text-text-secondary">配置保存于本机该项目的 plugins.json。只有 Agent 对话运行时才会按权限模式连接已启用的本地 MCP 服务。</p></div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection description="MCP 服务会在未来连接时执行本机程序。只添加你信任的本地可执行文件；命令解释器和包管理器已被禁止。" title="MCP 服务">
        <SettingsCard>
          {state.config.mcpServers.map((server) => (
            <SettingsRow description={`${server.command}  |  ${server.args.length} 个固定参数  |  工具上限 ${server.toolLimit}`} key={server.id} label={server.name}>
              <div className="flex items-center gap-1">
                <Toggle checked={server.enabled} disabled={saving} label={`启用 ${server.name}`} onChange={() => void run(() => setProjectMcpEnabled(projectId, server.id, !server.enabled), server.enabled ? "MCP 服务已关闭" : "MCP 服务已标记为启用" )} />
                <Button aria-label={`移除 ${server.name}`} disabled={saving} onClick={() => void run(() => removeProjectMcpServer(projectId, server.id), "MCP 服务已移除")} size="icon" type="button" variant="ghost"><Trash2 /></Button>
              </div>
            </SettingsRow>
          ))}
          {!state.config.mcpServers.length && <div className="px-4 py-5 text-sm text-text-secondary">尚未添加 MCP 服务。</div>}
        </SettingsCard>
        <div className="grid gap-3 rounded-xl bg-surface-sunken p-4 shadow-sm md:grid-cols-2">
          <label className="space-y-1 text-sm text-text-secondary">名称<input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-text-primary" onChange={(event) => setMcpName(event.target.value)} placeholder="例如：本地文献工具" value={mcpName} /></label>
          <label className="space-y-1 text-sm text-text-secondary">绝对可执行文件路径<input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-text-primary" onChange={(event) => setMcpCommand(event.target.value)} placeholder="C:\\Program Files\\...\\server.exe" spellCheck={false} value={mcpCommand} /></label>
          <label className="space-y-1 text-sm text-text-secondary">固定参数（每行一项）<textarea className="min-h-20 w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-text-primary" onChange={(event) => setMcpArgs(event.target.value)} value={mcpArgs} /></label>
          <label className="space-y-1 text-sm text-text-secondary">环境变量（每行 KEY=value）<textarea className="min-h-20 w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-text-primary" onChange={(event) => setMcpEnv(event.target.value)} value={mcpEnv} /></label>
          <label className="space-y-1 text-sm text-text-secondary">工具上限（全项目总计最多 20）<input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-text-primary" max="20" min="1" onChange={(event) => setMcpToolLimit(event.target.value)} type="number" value={mcpToolLimit} /></label>
          <div className="flex items-end justify-between gap-3"><span className="text-sm text-text-secondary">已分配 {toolBudget}/20</span><Button disabled={saving || !mcpName.trim() || !mcpCommand.trim()} onClick={addMcp} type="button"><Plus />添加 MCP</Button></div>
        </div>
      </SettingsSection>

      <SettingsSection description="技能必须由你显式添加一个本地目录。目录会先解析真实路径，系统不会扫描其他目录。" title="技能目录">
        <SettingsCard>
          {state.config.skillDirectories.map((skill) => (
            <SettingsRow description={skill.path} key={skill.id} label="本地技能目录">
              <div className="flex items-center gap-1">
                <Toggle checked={skill.enabled} disabled={saving} label={`启用技能目录 ${skill.path}`} onChange={() => void run(() => setProjectSkillEnabled(projectId, skill.id, !skill.enabled), skill.enabled ? "技能目录已关闭" : "技能目录已标记为启用" )} />
                <Button aria-label={`移除技能目录 ${skill.path}`} disabled={saving} onClick={() => void run(() => removeProjectSkillDirectory(projectId, skill.id), "技能目录已移除")} size="icon" type="button" variant="ghost"><Trash2 /></Button>
              </div>
            </SettingsRow>
          ))}
          {!state.config.skillDirectories.length && <div className="px-4 py-5 text-sm text-text-secondary">尚未添加技能目录。</div>}
        </SettingsCard>
        <div className="flex flex-col gap-3 rounded-xl bg-surface-sunken p-4 shadow-sm sm:flex-row">
          <label className="min-w-0 flex-1 space-y-1 text-sm text-text-secondary">本地目录绝对路径<input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-text-primary" onChange={(event) => setSkillPath(event.target.value)} placeholder="D:\\my-contour-skills" spellCheck={false} value={skillPath} /></label>
          <div className="flex items-end"><Button disabled={saving || !skillPath.trim()} onClick={addSkill} type="button"><FolderCog />添加目录</Button></div>
        </div>
      </SettingsSection>

      <div className="flex items-start gap-3 rounded-md bg-warning/10 px-4 py-3 text-sm text-text-secondary"><ShieldAlert className="mt-0.5 shrink-0 text-warning" size={18} /><span>启用表示将来允许 Agent 使用该项。连接 MCP 前仍应展示一次明确确认；不要把不可信项目中的命令、参数或网页建议直接复制到这里。</span></div>
      <div className="flex items-center gap-2 text-sm text-text-secondary"><TerminalSquare size={16} />本页只管理配置；只读对话不会连接 MCP，其他模式调用外部工具前仍须确认。</div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </div>
  );
}
