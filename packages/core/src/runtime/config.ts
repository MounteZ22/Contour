export interface CoreRuntimeConfig {
  dataDir: string;
  projectsDir: string;
  vaultsDir: string;
  legacyVault: string;
  isDevelopment: boolean;
}

/**
 * Validate and freeze host-owned runtime paths before constructing a Core
 * service container. Core keeps no process-wide runtime state.
 */
export function assertRuntimeConfig(config: CoreRuntimeConfig): Readonly<CoreRuntimeConfig> {
  for (const key of ["dataDir", "projectsDir", "vaultsDir", "legacyVault"] as const) {
    if (!config[key] || typeof config[key] !== "string") {
      throw new Error(`Core runtime config requires ${key}`);
    }
  }
  return Object.freeze({ ...config });
}
