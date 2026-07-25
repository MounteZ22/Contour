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

// 模块级互斥锁，防止 registry.json 的读-改-写竞态
let registryLock: Promise<void> = Promise.resolve();
function withRegistryLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = registryLock;
  let release: () => void;
  registryLock = new Promise<void>((resolve) => { release = resolve; });
  return prev.then(async () => {
    try { return await fn(); }
    finally { release!(); }
  });
}

export interface ProductSessionMeta {
  id: string;
  title: string;
  lastMessage?: string;
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
): Promise<{ meta: ProductSessionMeta; created: boolean }> {
  return withRegistryLock(() => {
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
  });
}

export function updateProductSession(
  dataDir: string,
  projectId: string,
  sessionId: string,
  patch: Partial<Omit<ProductSessionMeta, 'id' | 'createdAt'>>,
): Promise<ProductSessionMeta> {
  return withRegistryLock(() => {
    const sessions = readRegistry(dataDir, projectId);
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) throw new Error(`产品会话不存在: ${sessionId}`);
    const next = { ...sessions[index], ...patch, updatedAt: Date.now() };
    sessions[index] = next;
    writeRegistry(dataDir, projectId, sessions);
    return next;
  });
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
    // 跳过符号链接，防止循环
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return listJsonlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
  });
}

/** 在会话目录中查找已有的 JSONL 文件 */
export function findExistingPiFile(sessionDir: string): string | null {
  return listJsonlFiles(sessionDir)[0] ?? null;
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

export async function createOrResumePiSession(
  dataDir: string,
  projectId: string,
  productSessionId: string,
  title?: string,
): Promise<PiSessionHandle> {
  const { meta } = await ensureProductSession(dataDir, projectId, productSessionId, title);
  const workspaceDir = getSessionWorkspaceDir(dataDir, projectId, productSessionId);
  const existingFile = findPiSessionFile(dataDir, projectId, productSessionId);
  if (existingFile) {
    try {
      return {
        manager: SessionManager.open(existingFile, workspaceDir, workspaceDir),
        productSession: meta,
        workspaceDir,
        filePath: existingFile,
        created: false,
      };
    } catch (err) {
      console.warn("[SessionStorage] 会话文件损坏，将创建新会话:", existingFile, err);
      // fall through to create new session
    }
  }

  // 直接查找工作区中已有的 JSONL 文件（回退逻辑）
  const legacyFile = findExistingPiFile(workspaceDir);
  if (legacyFile) {
    try {
      return {
        manager: SessionManager.open(legacyFile, workspaceDir, workspaceDir),
        productSession: meta,
        workspaceDir,
        filePath: legacyFile,
        created: false,
      };
    } catch (err) {
      console.warn("[SessionStorage] 遗留会话文件损坏，将创建新会话:", legacyFile, err);
      // fall through to create new session
    }
  }

  const manager = SessionManager.create(workspaceDir, workspaceDir);
  manager.appendSessionInfo(meta.title);
  const updated = await updateProductSession(dataDir, projectId, productSessionId, {
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

/**
 * 获取会话摘要（title 和 messageCount），用于列表页快速展示。
 * 封装 Pi SDK 的 SessionManager.open() 调用，避免调用方直接依赖 Pi SDK。
 */
export function getSessionSummary(
  dataDir: string,
  projectId: string,
  sessionId: string,
): { title: string; messageCount: number } | null {
  const filePath = findPiSessionFile(dataDir, projectId, sessionId);
  if (!filePath) return null;
  try {
    const manager = SessionManager.open(filePath, path.dirname(filePath));
    return {
      title: manager.getSessionName()?.trim() || `会话 ${sessionId.slice(0, 8)}`,
      messageCount: manager.getEntries().filter((entry) => entry.type === 'message').length,
    };
  } catch (error) {
    console.warn(`[SessionStorage] 无法读取会话摘要: ${filePath}`, error);
    return null;
  }
}
