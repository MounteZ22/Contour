import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';

export function extractFrontmatterText(raw: string): string | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
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
    if (legacyStat.isDirectory() && path.basename(CONFIG.LEGACY_VAULT) === projectId) {
      return CONFIG.LEGACY_VAULT;
    }
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
        if (flowEntries.some((e) =>
          (e.isDirectory() && (e.name === flowId || e.name.startsWith(`${flowId}_`))) ||
          (e.isFile() && e.name.endsWith('.md') && (e.name === `${flowId}.md` || e.name.startsWith(`${flowId}_`)))
        )) {
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
    if (legacyStat.isDirectory()) {
      const entries = await fs.readdir(path.join(CONFIG.LEGACY_VAULT, 'flows'), { withFileTypes: true });
      const found = entries.some((entry) =>
        (entry.isDirectory() && (entry.name === flowId || entry.name.startsWith(`${flowId}_`))) ||
        (entry.isFile() && entry.name.endsWith('.md') &&
          (entry.name === `${flowId}.md` || entry.name.startsWith(`${flowId}_`)))
      );
      if (found) return CONFIG.LEGACY_VAULT;
    }
  } catch {
    // ignore
  }
  return null;
}

/** 在指定项目中精确定位目录式 Flow，避免 F001 误匹配 F0010。 */
export async function findFlowDir(projectDir: string, flowId: string): Promise<string | null> {
  const flowsDir = path.join(projectDir, 'flows');
  try {
    const entries = await fs.readdir(flowsDir, { withFileTypes: true });
    const entry = entries.find((candidate) =>
      candidate.isDirectory() &&
      (candidate.name === flowId || candidate.name.startsWith(`${flowId}_`))
    );
    return entry ? path.join(flowsDir, entry.name) : null;
  } catch {
    return null;
  }
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
