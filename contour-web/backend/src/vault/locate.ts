import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';

export function extractFrontmatterText(raw: string): string | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : null;
}

export async function findProjectDir(projectId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === projectId) {
        return path.join(CONFIG.VAULTS_DIR, entry.name);
      }
    }
  } catch {
    // vaults/ 不存在
  }
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}

export async function findProjectDirForFlow(flowId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const flowsDir = path.join(CONFIG.VAULTS_DIR, entry.name, 'flows');
      try {
        const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
        if (flowEntries.some((e) => e.isDirectory() && e.name.startsWith(flowId))) {
          return path.join(CONFIG.VAULTS_DIR, entry.name);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // vaults/ 不存在
  }
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}

export async function findProjectDirForDoc(docId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const docsDir = path.join(CONFIG.VAULTS_DIR, entry.name, 'background');
      try {
        const files = await fs.readdir(docsDir);
        if (files.includes(`${docId}.md`)) {
          return path.join(CONFIG.VAULTS_DIR, entry.name);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // vaults/ 不存在
  }
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}

export async function findProjectDirForClaim(claimId: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(CONFIG.VAULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const claimsDir = path.join(CONFIG.VAULTS_DIR, entry.name, 'claims');
      try {
        const files = await fs.readdir(claimsDir);
        if (files.includes(`${claimId}.md`)) {
          return path.join(CONFIG.VAULTS_DIR, entry.name);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // vaults/ 不存在
  }
  try {
    const legacyStat = await fs.stat(CONFIG.LEGACY_VAULT);
    if (legacyStat.isDirectory()) return CONFIG.LEGACY_VAULT;
  } catch {
    // ignore
  }
  return null;
}
