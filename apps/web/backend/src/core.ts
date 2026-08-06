import { createCoreServices } from '@contour/core/services';
import type { CoreRuntimeConfig } from '@contour/core/runtime';
import * as hostConfig from './config.js';

type ConfigMockShape = {
  CORE_RUNTIME_CONFIG?: CoreRuntimeConfig;
  DATA_DIR?: string;
  PROJECTS_DIR?: string;
  CONFIG: {
    DATA_DIR?: string;
    CONFIG_DIR?: string;
    PROJECTS_DIR?: string;
    VAULTS_DIR?: string;
    LEGACY_VAULT?: string;
    IS_DEV?: boolean;
  };
};

function runtimeConfigFromHost(): CoreRuntimeConfig {
  const configHost = hostConfig as unknown as ConfigMockShape;
  if (Object.prototype.hasOwnProperty.call(configHost, 'CORE_RUNTIME_CONFIG')) {
    return configHost.CORE_RUNTIME_CONFIG!;
  }
  // Compatibility for transport tests that mock the host's legacy CONFIG shape.
  const config = configHost.CONFIG;
  const hostDataDir = Object.prototype.hasOwnProperty.call(configHost, 'DATA_DIR')
    ? configHost.DATA_DIR
    : undefined;
  const hostProjectsDir = Object.prototype.hasOwnProperty.call(configHost, 'PROJECTS_DIR')
    ? configHost.PROJECTS_DIR
    : undefined;
  const dataDir = hostDataDir ?? config.DATA_DIR ?? config.CONFIG_DIR ?? config.VAULTS_DIR ?? config.LEGACY_VAULT;
  if (!dataDir) throw new Error('Web host must provide a Core runtime dataDir');
  const projectsDir = hostProjectsDir ?? config.PROJECTS_DIR ?? `${dataDir}/projects`;
  return {
    dataDir,
    projectsDir,
    vaultsDir: config.VAULTS_DIR ?? dataDir,
    legacyVault: config.LEGACY_VAULT ?? dataDir,
    isDevelopment: config.IS_DEV ?? true,
  };
}

/** Host-owned Core composition root. Routes consume this explicit container. */
export const coreServices = createCoreServices(runtimeConfigFromHost());

export type WebCoreServices = typeof coreServices;
