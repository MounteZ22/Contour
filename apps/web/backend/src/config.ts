import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRuntimeConfig } from './runtime.js';

const isDev = process.env.NODE_ENV !== 'production';
const contourRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const resolved = resolveRuntimeConfig({
  isDevelopment: isDev,
  homeDir: os.homedir(),
  legacyVault: path.join(contourRoot, 'example_vault'),
  readSettingsFile: (filePath) => fs.readFileSync(filePath, 'utf-8'),
});

// Web CLI owns legacy directory initialization. Embedded hosts must use the
// resolver directly so importing the transport cannot change their data paths.
fs.mkdirSync(resolved.configDir, { recursive: true });
fs.mkdirSync(resolved.vaultsDir, { recursive: true });
if (!fs.existsSync(resolved.configFile)) {
  fs.writeFileSync(resolved.configFile, JSON.stringify({ vaultsPath: resolved.vaultsDir }, null, 2), 'utf-8');
}

export const DATA_DIR = resolved.coreConfig.dataDir;
export const PROJECTS_DIR = resolved.coreConfig.projectsDir;

export const CONFIG = {
  PORT: Number(process.env.PORT || 3001),
  VAULTS_DIR: resolved.vaultsDir,
  LEGACY_VAULT: resolved.coreConfig.legacyVault,
  CONFIG_DIR: resolved.configDir,
  CONFIG_FILE: resolved.configFile,
  IS_DEV: isDev,
  DATA_DIR,
  PROJECTS_DIR,
};

export const CORE_RUNTIME_CONFIG = resolved.coreConfig;

console.log(`[Contour] Vault path: ${CONFIG.VAULTS_DIR}`);
console.log(`[Contour] Config file: ${CONFIG.CONFIG_FILE}`);
console.log(`[Contour] Mode: ${CONFIG.IS_DEV ? 'development' : 'production'}`);
