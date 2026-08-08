import type { ProjectData } from '@contour/shared';
import { scanAllProjects } from './scanner.js';

const CACHE_TTL_MS = 60_000;

/**
 * Creates a project scanner and cache bound to one vault runtime.
 * No cache state is shared across Core containers.
 */
export function createProjectLoader(vaultsDir: string, legacyVault: string) {
  let cache: ProjectData[] | null = null;
  let cacheTime = 0;

  async function loadProjects(): Promise<ProjectData[]> {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL_MS) return cache;
    cache = await scanAllProjects(vaultsDir, legacyVault);
    cacheTime = now;
    return cache;
  }

  function invalidateCache(): void {
    cache = null;
    cacheTime = 0;
  }

  return { loadProjects, invalidateCache };
}

export type ProjectLoader = ReturnType<typeof createProjectLoader>;
