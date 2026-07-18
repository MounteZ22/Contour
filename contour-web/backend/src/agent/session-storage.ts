import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

export interface ProductSessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sdkSessionId?: string;
}

export interface PiSessionHandle {
  manager: SessionManager;
  productSession: ProductSessionMeta;
  workspaceDir: string;
  filePath?: string;
  created: boolean;
}

function assertProjectId(projectId: string): void {
  if (!projectId || !/^[\w\-\u4e00-\u9fff]+$/u.test(projectId)) {
    throw new Error(`无效的 projectId: ${projectId}`);
  }
}

function assertProductSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(sessionId)) {
    throw new Error(`无效的 sessionId: ${sessionId}`);
  }
}

function resolveInside(baseDir: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(baseDir);
  const target = path.resolve(resolvedBase, ...segments);
  if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) {
    throw new Error(`路径越界: ${target}`);
  }
  return target;
}

export function getProjectSessionsDir(dataDir: string, projectId: string): string {
  assertProjectId(projectId);
  return resolveInside(path.join(dataDir, 'projects'), projectId, 'sessions');
}

function getRegistryPath(dataDir: string, projectId: string): string {
  return path.join(getProjectSessionsDir(dataDir, projectId), 'index.json');
}

export function getSessionWorkspaceDir(
  dataDir: string,
  projectId: string,
  sessionId: string,
): string {
  assertProductSessionId(sessionId);
  return resolveInside(getProjectSessionsDir(dataDir, projectId), sessionId);
}

function readRegistry(dataDir: string, projectId: string): ProductSessionMeta[] {
  const registryPath = getRegistryPath(dataDir, projectId);
  if (!existsSync(registryPath)) return [];

  const parsed = JSON.parse(readFileSync(registryPath, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Agent session registry 格式无效: ${registryPath}`);
  }
  return parsed as ProductSessionMeta[];
}

function writeRegistry(dataDir: string, projectId: string, sessions: ProductSessionMeta[]): void {
  const registryPath = getRegistryPath(dataDir, projectId);
  mkdirSync(path.dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(sessions, null, 2), 'utf-8');
  renameSync(tempPath, registryPath);
}

export function listProductSessions(dataDir: string, projectId: string): ProductSessionMeta[] {
  return readRegistry(dataDir, projectId);
}

export function ensureProductSession(
  dataDir: string,
  projectId: string,
  sessionId: string,
  title?: string,
): { meta: ProductSessionMeta; created: boolean } {
  const workspaceDir = getSessionWorkspaceDir(dataDir, projectId, sessionId);
  mkdirSync(workspaceDir, { recursive: true });

  const sessions = readRegistry(dataDir, projectId);
  const existing = sessions.find((session) => session.id === sessionId);
  if (existing) return { meta: existing, created: false };

  const now = Date.now();
  const meta: ProductSessionMeta = {
    id: sessionId,
    title: title?.trim() || `会话 ${sessionId.slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  writeRegistry(dataDir, projectId, [...sessions, meta]);
  return { meta, created: true };
}

function updateProductSession(
  dataDir: string,
  projectId: string,
  sessionId: string,
  patch: Partial<Omit<ProductSessionMeta, 'id' | 'createdAt'>>,
): ProductSessionMeta {
  const sessions = readRegistry(dataDir, projectId);
  const index = sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) throw new Error(`产品会话不存在: ${sessionId}`);
  const next = { ...sessions[index], ...patch, updatedAt: Date.now() };
  sessions[index] = next;
  writeRegistry(dataDir, projectId, sessions);
  return next;
}

function readSdkSessionId(filePath: string): string | null {
  try {
    const firstLine = readFileSync(filePath, 'utf-8').split(/\r?\n/, 1)[0];
    const header = JSON.parse(firstLine) as Record<string, unknown>;
    return header.type === 'session' && typeof header.id === 'string' ? header.id : null;
  } catch {
    return null;
  }
}

function listJsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
  });
}

export function findPiSessionFile(
  dataDir: string,
  projectId: string,
  productSessionId: string,
): string | null {
  const meta = readRegistry(dataDir, projectId).find((session) => session.id === productSessionId);
  if (!meta?.sdkSessionId) return null;
  const workspaceDir = getSessionWorkspaceDir(dataDir, projectId, productSessionId);
  return listJsonlFiles(workspaceDir).find(
    (filePath) => readSdkSessionId(filePath) === meta.sdkSessionId,
  ) ?? null;
}

export function createOrResumePiSession(
  dataDir: string,
  projectId: string,
  productSessionId: string,
  title?: string,
): PiSessionHandle {
  const { meta } = ensureProductSession(dataDir, projectId, productSessionId, title);
  const workspaceDir = getSessionWorkspaceDir(dataDir, projectId, productSessionId);
  const existingFile = findPiSessionFile(dataDir, projectId, productSessionId);
  if (existingFile) {
    return {
      manager: SessionManager.open(existingFile, workspaceDir, workspaceDir),
      productSession: meta,
      workspaceDir,
      filePath: existingFile,
      created: false,
    };
  }

  const manager = SessionManager.create(workspaceDir, workspaceDir);
  manager.appendSessionInfo(meta.title);
  const updated = updateProductSession(dataDir, projectId, productSessionId, {
    sdkSessionId: manager.getSessionId(),
  });
  return {
    manager,
    productSession: updated,
    workspaceDir,
    filePath: manager.getSessionFile(),
    created: true,
  };
}

export function deleteProductSession(
  dataDir: string,
  projectId: string,
  productSessionId: string,
): boolean {
  const sessions = readRegistry(dataDir, projectId);
  if (!sessions.some((session) => session.id === productSessionId)) return false;
  writeRegistry(
    dataDir,
    projectId,
    sessions.filter((session) => session.id !== productSessionId),
  );
  rmSync(getSessionWorkspaceDir(dataDir, projectId, productSessionId), {
    recursive: true,
    force: true,
  });
  return true;
}
