import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../runtime.js';

describe('resolveRuntimeConfig', () => {
  it('reuses the legacy production settings directory and configured vault path', () => {
    const result = resolveRuntimeConfig({
      isDevelopment: false,
      homeDir: 'C:\\Users\\ContourUser',
      legacyVault: 'D:\\Contour\\example_vault',
      readSettingsFile: () => JSON.stringify({ vaultsPath: 'E:\\ExistingContourVaults' }),
    });

    expect(result.configDir).toBe('C:\\Users\\ContourUser\\.contour');
    expect(result.configFile).toBe('C:\\Users\\ContourUser\\.contour\\settings.json');
    expect(result.coreConfig).toMatchObject({
      dataDir: 'C:\\Users\\ContourUser\\.contour',
      projectsDir: 'C:\\Users\\ContourUser\\.contour\\projects',
      vaultsDir: 'E:\\ExistingContourVaults',
      isDevelopment: false,
    });
  });

  it('keeps development paths isolated and applies the documented defaults', () => {
    const result = resolveRuntimeConfig({
      isDevelopment: true,
      homeDir: 'C:\\Users\\ContourUser',
      legacyVault: 'D:\\Contour-dev\\example_vault',
    });

    expect(result.coreConfig).toMatchObject({
      dataDir: 'C:\\Users\\ContourUser\\.contour-dev',
      vaultsDir: 'C:\\Users\\ContourUser\\Contour-dev',
      isDevelopment: true,
    });
  });

  it('tolerates malformed legacy settings without writing replacement files', () => {
    const result = resolveRuntimeConfig({
      isDevelopment: false,
      homeDir: 'C:\\Users\\ContourUser',
      legacyVault: 'D:\\Contour\\example_vault',
      readSettingsFile: () => '{not-json',
    });
    expect(result.coreConfig.vaultsDir).toBe('C:\\Users\\ContourUser\\Contour');
  });
});
