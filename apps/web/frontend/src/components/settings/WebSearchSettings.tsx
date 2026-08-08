import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Globe2, KeyRound, Loader2, Save, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { showToast } from '../Toast';
import { SettingsCard, SettingsRow, SettingsSection } from './primitives';

interface WebSearchSettingsStatus {
  enabled: boolean;
  hasApiKey: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success || !result.data) throw new Error(result.error || fallback);
  return result.data;
}

async function getWebSearchSettings(): Promise<WebSearchSettingsStatus> {
  return readApiResponse<WebSearchSettingsStatus>(await fetch('/api/settings/web-search'), '读取网络检索设置失败');
}

async function saveWebSearchSettings(input: { enabled: boolean; tavilyApiKey?: string }): Promise<WebSearchSettingsStatus> {
  return readApiResponse<WebSearchSettingsStatus>(await fetch('/api/settings/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }), '保存网络检索设置失败');
}

/**
 * Tavily 是应用级凭据：它保存在当前电脑的后端配置文件，所有项目共用。
 * 前端只读取“是否已配置”状态，避免把已保存密钥重新送入浏览器。
 */
export function WebSearchSettings() {
  const [status, setStatus] = useState<WebSearchSettingsStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [clearSavedKey, setClearSavedKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getWebSearchSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取网络检索设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!status || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveWebSearchSettings({
        enabled: status.enabled,
        ...(apiKey.trim() ? { tavilyApiKey: apiKey.trim() } : {}),
        ...(clearSavedKey ? { tavilyApiKey: '' } : {}),
      });
      setStatus(next);
      setApiKey('');
      setClearSavedKey(false);
      showToast('网络检索设置已保存', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存网络检索设置失败';
      setError(message);
      showToast(`保存失败：${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary"><Loader2 className="animate-spin" size={18} />正在读取网络检索设置...</div>;
  }

  if (!status) {
    return (
      <SettingsSection description="控制 Agent 是否能检索公开网络资料。" title="网络检索">
        <SettingsCard divided={false}>
          <div className="px-4 py-6 text-sm text-danger">{error ?? '网络检索设置不可用'}</div>
        </SettingsCard>
        <Button onClick={load} size="sm" type="button" variant="outline">重试</Button>
      </SettingsSection>
    );
  }

  const canEnable = status.hasApiKey || Boolean(apiKey.trim());

  return (
    <div className="space-y-8">
      <SettingsSection description="使用 Tavily 检索公开网络资料。关闭后，Agent 不会获得网络检索工具。" title="网络检索">
        <SettingsCard divided={false}>
          <div className="flex items-start gap-3 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle-bg text-accent-subtle-text"><Globe2 size={18} /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">公开资料检索</p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">检索和网页内容会明确标记为不可信外部数据；本机、内网和云元数据地址会被拦截。</p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection description="Tavily 密钥仅保存在本机后端配置中，不会在网页中回显。" title="Tavily 配置">
        <SettingsCard>
          <SettingsRow description={status.hasApiKey ? '已在本机安全保存。输入新密钥可替换现有值。' : '尚未配置。需要先填写密钥，才能启用网络检索。'} label="Tavily API Key">
            <span className={`rounded-full px-2 py-1 text-xs ${status.hasApiKey ? 'bg-success/10 text-success' : 'bg-muted text-text-secondary'}`}>
              {status.hasApiKey ? '已配置' : '未配置'}
            </span>
          </SettingsRow>
          <div className="space-y-2 px-4 py-3">
            <label className="text-sm font-medium text-text-primary" htmlFor="tavily-api-key">新的 API Key</label>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 pr-10 font-mono text-sm text-text-primary outline-none focus:border-accent-strong/40"
                disabled={clearSavedKey}
                id="tavily-api-key"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={status.hasApiKey ? '留空则保留当前密钥' : 'tvly-...'}
                spellCheck={false}
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
              />
              <button aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary" onClick={() => setShowApiKey((value) => !value)} title={showApiKey ? '隐藏 API Key' : '显示 API Key'} type="button">
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {status.hasApiKey && (
            <label className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm text-text-secondary">
              <input
                checked={clearSavedKey}
                className="h-4 w-4 accent-primary"
                onChange={(event) => {
                  const clear = event.target.checked;
                  setClearSavedKey(clear);
                  if (clear) setStatus((current) => current ? { ...current, enabled: false } : current);
                }}
                type="checkbox"
              />
              清除已保存的密钥
            </label>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection description="只有开关开启且已配置有效密钥时，Agent 才会获得 web_search 和 fetch_content 工具。" title="工具状态">
        <SettingsCard divided={false}>
          <SettingsRow description={canEnable ? '开启后，在新发起的对话中生效。' : '请先填写 Tavily API Key 并保存。'} label="允许 Agent 网络检索">
            <button
              aria-checked={status.enabled}
              aria-label="允许 Agent 网络检索"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${status.enabled ? 'bg-accent-strong' : 'bg-border'} ${!canEnable && !status.enabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              disabled={!canEnable && !status.enabled}
              onClick={() => setStatus((current) => current ? { ...current, enabled: !current.enabled } : current)}
              role="switch"
              type="button"
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-accent-on transition-transform ${status.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <div className="flex items-center justify-between gap-4 rounded-md bg-surface-sunken px-4 py-3 text-sm text-text-secondary">
        <div className="flex min-w-0 items-center gap-2"><ShieldCheck className="shrink-0 text-success" size={17} /><span>不保存 Cookie，不下载文件，不执行网页中的命令。</span></div>
        <Button disabled={saving} onClick={handleSave} type="button">
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          保存
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
