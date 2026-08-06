import path from 'node:path';
import type { CoreRuntimeConfig } from '@contour/core/runtime';
import { createWebHostContext, type WebHostContext } from '../../host.js';

export interface TestHostPaths {
  dataDir: string;
  projectsDir?: string;
  vaultsDir?: string;
  legacyVault?: string;
  port?: number;
}

/** Builds a test host without importing the web process default configuration. */
export function createTestHostContext(paths: TestHostPaths): WebHostContext {
  const coreConfig: CoreRuntimeConfig = {
    dataDir: paths.dataDir,
    projectsDir: paths.projectsDir ?? path.join(paths.dataDir, 'projects'),
    vaultsDir: paths.vaultsDir ?? paths.dataDir,
    legacyVault: paths.legacyVault ?? paths.dataDir,
    isDevelopment: true,
  };
  return createWebHostContext(coreConfig, { port: paths.port ?? 0, mode: 'development' });
}
