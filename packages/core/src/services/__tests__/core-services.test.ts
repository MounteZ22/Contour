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

  it('Given two vaults with different project data, When A loads before B and each invalidates independently, Then cached results never cross container boundaries', async () => {
    const left = createCoreServices(runtime('vault-left'));
    const right = createCoreServices(runtime('vault-right'));
    const leftProject = path.join(left.config.vaultsDir, 'left-project');
    const rightProject = path.join(right.config.vaultsDir, 'right-project');

    await fs.mkdir(path.join(leftProject, 'background'), { recursive: true });
    await fs.mkdir(path.join(rightProject, 'background'), { recursive: true });
    await fs.writeFile(path.join(leftProject, 'background', 'brief.md'), '---\ntitle: Left brief\n---\nLeft-only source data');
    await fs.writeFile(path.join(rightProject, 'background', 'brief.md'), '---\ntitle: Right brief\n---\nRight-only source data');

    const leftFirst = await left.vault.loadProjects();
    const rightFirst = await right.vault.loadProjects();
    expect(leftFirst[0]?.docs[0]?.content).toContain('Left-only source data');
    expect(rightFirst[0]?.docs[0]?.content).toContain('Right-only source data');

    await fs.writeFile(path.join(rightProject, 'background', 'brief.md'), '---\ntitle: Right brief\n---\nRight data after invalidation');
    left.vault.invalidateCache();

    expect((await left.vault.loadProjects())[0]?.docs[0]?.content).toContain('Left-only source data');
    expect((await right.vault.loadProjects())[0]?.docs[0]?.content).toContain('Right-only source data');

    right.vault.invalidateCache();
    expect((await right.vault.loadProjects())[0]?.docs[0]?.content).toContain('Right data after invalidation');
  });

  it('Given no host config was installed, When two containers are created directly, Then their supplied paths remain the only runtime paths', () => {
    const left = createCoreServices(runtime('isolated-left'));
    const right = createCoreServices(runtime('isolated-right'));
    expect(left.config.dataDir).toContain('isolated-left');
    expect(right.config.dataDir).toContain('isolated-right');
    expect(left.config).not.toEqual(right.config);
  });
});
