import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CoreRuntimeConfig } from '../runtime/config.js';
import type { AppSettings } from '@contour/shared';
import type { WebSearchSettingsStatus } from '../types.js';

interface StoredSettings extends AppSettings {
  webSearch?: { enabled?: boolean; tavilyApiKey?: string };
}

/** Settings persistence isolated to one runtime's data directory. */
export function createSettingsService(config: Readonly<CoreRuntimeConfig>) {
  const settingsFile = path.join(config.dataDir, 'settings.json');
  const getSettingsPath = () => settingsFile;

  async function getStoredSettings(): Promise<StoredSettings> {
    try {
      if (!existsSync(settingsFile)) return {};
      return JSON.parse(await fs.readFile(settingsFile, 'utf-8')) as StoredSettings;
    } catch (error) {
      console.error('[settings] 读取设置失败:', error);
      return {};
    }
  }

  async function writeStoredSettings(settings: StoredSettings): Promise<void> {
    if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
  }

  async function getSettings(): Promise<AppSettings> {
    const settings = await getStoredSettings();
    return settings.agentChannelId ? { agentChannelId: settings.agentChannelId } : {};
  }

  async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const current = await getStoredSettings();
    const updated: StoredSettings = { ...current };
    if (typeof updates.agentChannelId === 'string') updated.agentChannelId = updates.agentChannelId;
    if (updates.agentChannelId === undefined && Object.hasOwn(updates, 'agentChannelId')) delete updated.agentChannelId;
    await writeStoredSettings(updated);
    return getSettings();
  }

  async function getWebSearchSettingsStatus(): Promise<WebSearchSettingsStatus> {
    const settings = await getStoredSettings();
    const apiKey = settings.webSearch?.tavilyApiKey?.trim() ?? '';
    return { enabled: settings.webSearch?.enabled === true && apiKey.length > 0, hasApiKey: apiKey.length > 0 };
  }

  async function getWebSearchRuntimeConfig(): Promise<{ enabled: boolean; tavilyApiKey?: string }> {
    const settings = await getStoredSettings();
    const tavilyApiKey = settings.webSearch?.tavilyApiKey?.trim();
    return { enabled: settings.webSearch?.enabled === true && Boolean(tavilyApiKey), ...(tavilyApiKey ? { tavilyApiKey } : {}) };
  }

  async function updateWebSearchSettings(input: unknown): Promise<WebSearchSettingsStatus> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('网络检索设置必须是对象');
    const values = input as Record<string, unknown>;
    const unknownField = Object.keys(values).find((key) => key !== 'enabled' && key !== 'tavilyApiKey');
    if (unknownField) throw new Error(`不支持网络检索设置字段“${unknownField}”`);
    const { enabled, tavilyApiKey } = values;
    if (enabled !== undefined && typeof enabled !== 'boolean') throw new Error('enabled 必须是布尔值');
    if (tavilyApiKey !== undefined && typeof tavilyApiKey !== 'string') throw new Error('Tavily API Key 必须是文本');
    const current = await getStoredSettings();
    const webSearch = { ...(current.webSearch ?? {}) };
    if (typeof enabled === 'boolean') webSearch.enabled = enabled;
    if (typeof tavilyApiKey === 'string') {
      const key = tavilyApiKey.trim();
      if (key.length > 512 || /[\r\n\0]/.test(key)) throw new Error('Tavily API Key 格式无效');
      if (key) webSearch.tavilyApiKey = key;
      else { delete webSearch.tavilyApiKey; webSearch.enabled = false; }
    }
    if (webSearch.enabled === true && !webSearch.tavilyApiKey?.trim()) throw new Error('请先配置 Tavily API Key，再启用网络检索');
    current.webSearch = webSearch;
    await writeStoredSettings(current);
    return getWebSearchSettingsStatus();
  }

  return { getSettingsPath, getSettings, updateSettings, getWebSearchSettingsStatus, getWebSearchRuntimeConfig, updateWebSearchSettings };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
