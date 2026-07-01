import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import type { AppSettings } from '../types.js';

const SETTINGS_FILE = path.join(CONFIG.CONFIG_DIR, 'settings.json');

function getSettingsPath(): string {
  return SETTINGS_FILE;
}

export function getSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as AppSettings;
  } catch (error) {
    console.error('[settings] 读取设置失败:', error);
    return {};
  }
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated: AppSettings = { ...current, ...updates };
  // 确保配置目录存在
  if (!fs.existsSync(CONFIG.CONFIG_DIR)) {
    fs.mkdirSync(CONFIG.CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
