import path from 'node:path';
import type { CoreRuntimeConfig } from '@contour/core/runtime';

export interface RuntimeConfigResolverOptions {
  isDevelopment: boolean;
  homeDir: string;
  legacyVault: string;
  readSettingsFile?: (filePath: string) => string | undefined;
  defaultVaultPath?: string;
}

export interface ResolvedRuntimeConfig {
  configDir: string;
  configFile: string;
  vaultsDir: string;
  coreConfig: CoreRuntimeConfig;
}

/**
 * Resolves the established Contour business-data locations without creating
 * directories or writing settings. Hosts own initialization separately.
 */
export function resolveRuntimeConfig(options: RuntimeConfigResolverOptions): ResolvedRuntimeConfig {
  const configDir = path.join(options.homeDir, options.isDevelopment ? '.contour-dev' : '.contour');
  const configFile = path.join(configDir, 'settings.json');
  let savedVaultsPath: string | undefined;

  try {
    const raw = options.readSettingsFile?.(configFile);
    if (raw) {
      const parsed = JSON.parse(raw) as { vaultsPath?: unknown };
      if (typeof parsed.vaultsPath === 'string' && parsed.vaultsPath.trim()) {
        savedVaultsPath = parsed.vaultsPath;
      }
    }
  } catch {
    // A malformed legacy settings file falls back to the documented default.
  }

  // 跨平台默认：vaults 目录跟随用户主目录，避免 Windows 硬编码 D 盘路径。
  // 仍保留 settings.json 中 vaultsPath 的显式覆盖机制。
  const defaultVaultPath = options.defaultVaultPath
    ?? path.join(options.homeDir, options.isDevelopment ? 'Contour-dev' : 'Contour');
  const vaultsDir = savedVaultsPath ?? defaultVaultPath;
  const coreConfig: CoreRuntimeConfig = Object.freeze({
    dataDir: configDir,
    projectsDir: path.join(configDir, 'projects'),
    vaultsDir,
    legacyVault: options.legacyVault,
    isDevelopment: options.isDevelopment,
  });

  return Object.freeze({ configDir, configFile, vaultsDir, coreConfig });
}
