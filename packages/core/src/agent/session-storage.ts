import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

// Pi SDK 以 JSON.stringify 写入 JSONL，type 为每行首字段（无空格格式）。
// 流式扫描时用行首锚定匹配，避免对整行做完整 JSON.parse。
const MESSAGE_TYPE_RE = /^\s*\{?\s*"type"\s*:\s*"message"/;

// 会话摘要缓存：以文件 mtime+size 作为失效键，避免列表/详情重复全量解析 JSONL
const summaryCache = new Map<string, { mtimeMs: number; size: number; summary: { title: string; messageCount: number } }>();
const SUMMARY_CACHE_MAX = 256;

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

/**
 * 一次性查找项目下所有产品会话对应的 Pi JSONL 文件，供列表接口复用。
 * 相比逐个 findPiSessionFile，只读一次 registry 并复用目录扫描结果。
 */
export function listPiSessionFiles(dataDir: string, projectId: string): Map<string, string> {
  const result = new Map<string, string>();
  const sessions = readRegistry(dataDir, projectId);
  for (const meta of sessions) {
    if (!meta.sdkSessionId) continue;
    try {
      const workspaceDir = getSessionWorkspaceDir(dataDir, projectId, meta.id);
      const filePath = listJsonlFiles(workspaceDir).find(
        (candidate) => readSdkSessionId(candidate) === meta.sdkSessionId,
      ) ?? null;
      if (filePath) result.set(meta.id, filePath);
    } catch {
      // 单个会话异常不影响其余会话
    }
  }
  return result;
}

/** 从 JSONL 消息行提取文本内容（兼容 string 与 content block 数组） */
function textFromMessageLine(line: string): string {
  try {
    const record = JSON.parse(line) as Record<string, unknown>;
    const message = record.message;
    const content = message && typeof message === 'object'
      ? (message as Record<string, unknown>).content
      : record.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === 'object')
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * 轻量扫描会话 JSONL：单次流式读取同时统计消息数并提取最后一条消息文本。
 * 相比 SessionManager.open() 全量解析（列表接口 N+1 优化），只做逐行正则匹配，
 * 仅在必要时 JSON.parse 最后一条消息行。IO 错误会向上抛出由调用方决定语义。
 */
export async function scanSessionMessages(
  filePath: string,
): Promise<{ messageCount: number; lastMessage: string }> {
  let messageCount = 0;
  let lastLine: string | null = null;
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (MESSAGE_TYPE_RE.test(line)) {
      messageCount++;
      lastLine = line;
    }
  }
  if (!lastLine) return { messageCount, lastMessage: '' };
  return { messageCount, lastMessage: textFromMessageLine(lastLine).slice(0, 100) };
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
): Promise<boolean> {
  // 与 ensureProductSession/updateProductSession 共用互斥锁，避免并发读-改-写丢记录
  return withRegistryLock(() => {
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
  });
}

/**
 * 获取会话摘要（title 和 messageCount），用于列表页快速展示。
 * 封装 Pi SDK 的 SessionManager.open() 调用，避免调用方直接依赖 Pi SDK。
 * 结果以文件 mtime+size 缓存，文件未变化时直接命中，避免重复全量解析。
 */
export function getSessionSummary(
  dataDir: string,
  projectId: string,
  sessionId: string,
  filePath?: string,
): { title: string; messageCount: number } | null {
  const resolvedFilePath = filePath ?? findPiSessionFile(dataDir, projectId, sessionId);
  if (!resolvedFilePath) return null;
  try {
    const fileStat = statSync(resolvedFilePath);
    const cached = summaryCache.get(resolvedFilePath);
    if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      return cached.summary;
    }
    const manager = SessionManager.open(resolvedFilePath, path.dirname(resolvedFilePath));
    const summary = {
      title: manager.getSessionName()?.trim() || `会话 ${sessionId.slice(0, 8)}`,
      messageCount: manager.getEntries().filter((entry) => entry.type === 'message').length,
    };
    if (summaryCache.size >= SUMMARY_CACHE_MAX) {
      // 防止无限增长：容量满时淘汰最早插入的条目（近似 FIFO）
      const oldestKey = summaryCache.keys().next().value as string | undefined;
      if (oldestKey) summaryCache.delete(oldestKey);
    }
    summaryCache.set(resolvedFilePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, summary });
    return summary;
  } catch (error) {
    console.warn(`[SessionStorage] 无法读取会话摘要: ${resolvedFilePath}`, error);
    return null;
  }
}
