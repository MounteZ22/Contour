import type { ProjectData } from '../types.js';
import { scanAllProjects } from './scanner.js';

let cache: ProjectData[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 2000; // 2秒内不重复扫描

export async function loadProjects(vaultsDir: string, legacyVault: string): Promise<ProjectData[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) {
    return cache;
  }
  cache = await scanAllProjects(vaultsDir, legacyVault);
  cacheTime = now;
  return cache;
}

export function invalidateCache() {
  cache = null;
  cacheTime = 0;
}
