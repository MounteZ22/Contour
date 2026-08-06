export interface CoreRuntimeConfig {
  dataDir: string;
  projectsDir: string;
  vaultsDir: string;
  legacyVault: string;
  isDevelopment: boolean;
}

let runtimeConfig: Readonly<CoreRuntimeConfig> | null = null;

export function assertRuntimeConfig(config: CoreRuntimeConfig): Readonly<CoreRuntimeConfig> {
  for (const key of ["dataDir", "projectsDir", "vaultsDir", "legacyVault"] as const) {
    if (!config[key] || typeof config[key] !== "string") throw new Error(`Core runtime config requires ${key}`);
  }
  return Object.freeze({ ...config });
}

/** Temporary host bridge used by legacy function exports during the migration. */
export function configureCoreRuntime(config: CoreRuntimeConfig): void {
  runtimeConfig = assertRuntimeConfig(config);
}

function getRuntimeConfig(): Readonly<CoreRuntimeConfig> {
  if (!runtimeConfig) throw new Error("Core runtime has not been configured by its host");
  return runtimeConfig;
}

export const CONFIG = {
  get VAULTS_DIR(): string { return getRuntimeConfig().vaultsDir; },
  get LEGACY_VAULT(): string { return getRuntimeConfig().legacyVault; },
  get CONFIG_DIR(): string { return getRuntimeConfig().dataDir; },
  get DATA_DIR(): string { return getRuntimeConfig().dataDir; },
  get PROJECTS_DIR(): string { return getRuntimeConfig().projectsDir; },
  get IS_DEV(): boolean { return getRuntimeConfig().isDevelopment; },
};
