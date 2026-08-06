import path from 'node:path';
import { createCoreServices, type CoreServices } from '@contour/core/services';
import type { CoreRuntimeConfig } from '@contour/core/runtime';

export type WebHostMode = 'development' | 'production';

export interface WebHostConfig {
  port: number;
  dataDir: string;
  projectsDir: string;
  vaultsDir: string;
  legacyVault: string;
  isDevelopment: boolean;
  /** Legacy transport names, scoped to this host rather than module globals. */
  PORT: number;
  DATA_DIR: string;
  PROJECTS_DIR: string;
  VAULTS_DIR: string;
  LEGACY_VAULT: string;
  IS_DEV: boolean;
}

export interface WebHostOptions {
  port?: number;
  mode?: WebHostMode;
  staticDir?: string;
  corsOrigins?: string[];
}

/**
 * Host-owned composition root for the HTTP transport. It deliberately owns
 * both runtime paths and Core services, allowing multiple hosts in one
 * process without process-global mutable state.
 */
export interface WebHostContext {
  readonly coreConfig: CoreRuntimeConfig;
  readonly coreServices: CoreServices;
  readonly config: WebHostConfig;
  readonly mode: WebHostMode;
  readonly staticDir?: string;
  readonly corsOrigins: readonly string[];
}

export function createWebHostContext(
  coreConfig: CoreRuntimeConfig,
  options: WebHostOptions = {},
): WebHostContext {
  const mode = options.mode ?? (coreConfig.isDevelopment ? 'development' : 'production');
  const config: WebHostConfig = Object.freeze({
    port: options.port ?? 3001,
    dataDir: coreConfig.dataDir,
    projectsDir: coreConfig.projectsDir,
    vaultsDir: coreConfig.vaultsDir,
    legacyVault: coreConfig.legacyVault,
    isDevelopment: mode === 'development',
    PORT: options.port ?? 3001,
    DATA_DIR: coreConfig.dataDir,
    PROJECTS_DIR: coreConfig.projectsDir,
    VAULTS_DIR: coreConfig.vaultsDir,
    LEGACY_VAULT: coreConfig.legacyVault,
    IS_DEV: mode === 'development',
  });

  return Object.freeze({
    coreConfig: Object.freeze({ ...coreConfig }),
    coreServices: createCoreServices(coreConfig),
    config,
    mode,
    staticDir: options.staticDir ? path.resolve(options.staticDir) : undefined,
    corsOrigins: Object.freeze(options.corsOrigins ?? ['http://127.0.0.1:3000', 'http://localhost:3000']),
  });
}
