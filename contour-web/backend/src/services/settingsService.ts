import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { AppSettings } from '../types.js';

const SETTINGS_FILE = path.join(CONFIG.CONFIG_DIR, 'settings.json');

function getSettingsPath(): string {
  return SETTINGS_FILE;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    if (!existsSync(SETTINGS_FILE)) {
      return {};
    }
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as AppSettings;
  } catch (error) {
    console.error('[settings] 读取设置失败:', error);
    return {};
  }
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...updates };
  // 确保配置目录存在
  if (!existsSync(CONFIG.CONFIG_DIR)) {
    mkdirSync(CONFIG.CONFIG_DIR, { recursive: true });
  }
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
