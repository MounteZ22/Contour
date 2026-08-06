import fs from 'node:fs/promises';
import path from 'node:path';
import type { CoreRuntimeConfig } from '../runtime/config.js';

export function extractFrontmatterText(raw: string): string | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[1] : null;
}

/** File-backed Vault lookup functions bound to one host runtime. */
export function createVaultLocator(config: Readonly<CoreRuntimeConfig>) {
  const { vaultsDir, legacyVault } = config;

  async function findProjectDir(projectId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(vaultsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && entry.name === projectId) return path.join(vaultsDir, entry.name);
      }
    } catch {
      // vaults/ does not exist
    }
    try {
      const legacyStat = await fs.stat(legacyVault);
      if (legacyStat.isDirectory() && path.basename(legacyVault) === projectId) return legacyVault;
    } catch {
      // ignore unavailable legacy vault
    }
    return null;
  }

  async function findProjectDirForFlow(flowId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(vaultsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
        const flowsDir = path.join(vaultsDir, entry.name, 'flows');
        try {
          const flowEntries = await fs.readdir(flowsDir, { withFileTypes: true });
          if (flowEntries.some((item) =>
            (item.isDirectory() && (item.name === flowId || item.name.startsWith(`${flowId}_`))) ||
            (item.isFile() && item.name.endsWith('.md') && (item.name === `${flowId}.md` || item.name.startsWith(`${flowId}_`)))
          )) return path.join(vaultsDir, entry.name);
        } catch {
          // continue searching
        }
      }
    } catch {
      // vaults/ does not exist
    }
    try {
      const legacyStat = await fs.stat(legacyVault);
      if (legacyStat.isDirectory()) {
        const entries = await fs.readdir(path.join(legacyVault, 'flows'), { withFileTypes: true });
        if (entries.some((entry) =>
          (entry.isDirectory() && (entry.name === flowId || entry.name.startsWith(`${flowId}_`))) ||
          (entry.isFile() && entry.name.endsWith('.md') && (entry.name === `${flowId}.md` || entry.name.startsWith(`${flowId}_`)))
        )) return legacyVault;
      }
    } catch {
      // ignore unavailable legacy vault
    }
    return null;
  }

  async function findFlowDir(projectDir: string, flowId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(path.join(projectDir, 'flows'), { withFileTypes: true });
      const entry = entries.find((candidate) => candidate.isDirectory() && (candidate.name === flowId || candidate.name.startsWith(`${flowId}_`)));
      return entry ? path.join(projectDir, 'flows', entry.name) : null;
    } catch {
      return null;
    }
  }

  async function findProjectDirForDoc(docId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(vaultsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
        try {
          if ((await fs.readdir(path.join(vaultsDir, entry.name, 'background'))).includes(`${docId}.md`)) return path.join(vaultsDir, entry.name);
        } catch {
          // continue searching
        }
      }
    } catch {
      // vaults/ does not exist
    }
    try {
      if ((await fs.stat(legacyVault)).isDirectory()) return legacyVault;
    } catch {
      // ignore unavailable legacy vault
    }
    return null;
  }

  async function findProjectDirForClaim(claimId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(vaultsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
        try {
          if ((await fs.readdir(path.join(vaultsDir, entry.name, 'claims'))).includes(`${claimId}.md`)) return path.join(vaultsDir, entry.name);
        } catch {
          // continue searching
        }
      }
    } catch {
      // vaults/ does not exist
    }
    try {
      if ((await fs.stat(legacyVault)).isDirectory()) return legacyVault;
    } catch {
      // ignore unavailable legacy vault
    }
    return null;
  }

  return { findProjectDir, findProjectDirForFlow, findFlowDir, findProjectDirForDoc, findProjectDirForClaim };
}

export type VaultLocator = ReturnType<typeof createVaultLocator>;
