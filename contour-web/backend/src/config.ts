import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development' || true; // 当前阶段默认开发模式
const userHome = os.homedir(); // e.g. C:\Users\Z

// 固定配置目录
const configDir = path.join(userHome, '.contour');
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

export const CONFIG = {
  PORT: Number(process.env.PORT || 3001),
  VAULTS_DIR: vaultsDir,
  LEGACY_VAULT: path.join(contourRoot, 'example_vault'),
  CONFIG_DIR: configDir,
  CONFIG_FILE: configFile,
  IS_DEV: isDev,
};

console.log(`[Contour] Vault path: ${CONFIG.VAULTS_DIR}`);
console.log(`[Contour] Config file: ${CONFIG.CONFIG_FILE}`);
console.log(`[Contour] Mode: ${CONFIG.IS_DEV ? 'development' : 'production'}`);
