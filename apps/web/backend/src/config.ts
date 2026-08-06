import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CoreRuntimeConfig } from '@contour/core/runtime';

const isDev = process.env.NODE_ENV !== 'production'; // 默认开发模式，设置 NODE_ENV=production 切换
const userHome = os.homedir(); // e.g. C:\Users\Z

// 固定配置目录（dev 模式使用 ~/.contour-dev 以隔离）
const configDir = path.join(userHome, isDev ? '.contour-dev' : '.contour');
const configFile = path.join(configDir, 'settings.json');

// 读取用户配置
function loadUserConfig(): { vaultsPath?: string } {
  try {
    const raw = fs.readFileSync(configFile, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const userConfig = loadUserConfig();

// 默认 vault 路径
const defaultVaultPath = isDev ? 'D:\\Contour-dev' : 'D:\\Contour';
const vaultsDir = userConfig.vaultsPath || defaultVaultPath;

// 自动创建 vault 目录（如果不存在）
if (!fs.existsSync(vaultsDir)) {
  fs.mkdirSync(vaultsDir, { recursive: true });
}

// 自动创建配置目录（如果不存在）
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 如果配置文件不存在，写入默认配置
if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify({ vaultsPath: vaultsDir }, null, 2), 'utf-8');
}

const contourRoot = path.resolve(import.meta.dirname, '..', '..', '..');

export const DATA_DIR = configDir;
export const PROJECTS_DIR = path.join(configDir, 'projects');

export const CONFIG = {
  PORT: Number(process.env.PORT || 3001),
  VAULTS_DIR: vaultsDir,
  LEGACY_VAULT: path.join(contourRoot, 'example_vault'),
  CONFIG_DIR: configDir,
  CONFIG_FILE: configFile,
  IS_DEV: isDev,
  /** 应用数据目录（同 configDir） */
  DATA_DIR,
  /** 项目配置存放目录 */
  PROJECTS_DIR,
};

export const CORE_RUNTIME_CONFIG: CoreRuntimeConfig = {
  dataDir: DATA_DIR,
  projectsDir: PROJECTS_DIR,
  vaultsDir,
  legacyVault: path.join(contourRoot, 'example_vault'),
  isDevelopment: isDev,
};

console.log(`[Contour] Vault path: ${CONFIG.VAULTS_DIR}`);
console.log(`[Contour] Config file: ${CONFIG.CONFIG_FILE}`);
console.log(`[Contour] Mode: ${CONFIG.IS_DEV ? 'development' : 'production'}`);
