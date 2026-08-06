import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCoreServices } from '../core-services.js';

const root = path.join(os.tmpdir(), `contour-core-isolation-${Date.now()}`);
const runtime = (name: string) => ({
  dataDir: path.join(root, name, 'data'),
  projectsDir: path.join(root, name, 'data', 'projects'),
  vaultsDir: path.join(root, name, 'vaults'),
  legacyVault: path.join(root, name, 'legacy'),
  isDevelopment: true,
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('createCoreServices runtime isolation', () => {
  it('Given two explicit runtime configs, When each service writes state, Then neither runtime reads or writes the other directory', async () => {
    const left = createCoreServices(runtime('left'));
    const right = createCoreServices(runtime('right'));

    await left.settings.updateSettings({ agentChannelId: 'left-channel' });
    await right.settings.updateSettings({ agentChannelId: 'right-channel' });

    expect(await left.settings.getSettings()).toEqual({ agentChannelId: 'left-channel' });
    expect(await right.settings.getSettings()).toEqual({ agentChannelId: 'right-channel' });
    expect(await fs.readFile(left.settings.getSettingsPath(), 'utf-8')).toContain('left-channel');
    expect(await fs.readFile(right.settings.getSettingsPath(), 'utf-8')).toContain('right-channel');
    expect(left.settings.getSettingsPath()).not.toBe(right.settings.getSettingsPath());
  });

  it('Given no host config was installed, When two containers are created directly, Then their supplied paths remain the only runtime paths', () => {
    const left = createCoreServices(runtime('isolated-left'));
    const right = createCoreServices(runtime('isolated-right'));
    expect(left.config.dataDir).toContain('isolated-left');
    expect(right.config.dataDir).toContain('isolated-right');
    expect(left.config).not.toEqual(right.config);
  });
});
