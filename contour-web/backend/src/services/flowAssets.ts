import fs from 'node:fs/promises';
import path from 'node:path';
import type { FlowLink } from '../types.js';
import { atomicCreateFile, atomicWriteFile } from '../vault/atomic.js';
import { invalidateCache } from '../vault/loader.js';
import { findFlowDir, findProjectDir } from '../vault/locate.js';
import { getFlowLinks } from '../vault/parser.js';
import { ValidationError, validateId } from '../vault/validate.js';
import { parseFrontmatter, stringifyWithFrontmatter } from '../vault/yaml-utils.js';

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const flowMutationQueues = new Map<string, Promise<void>>();

async function withFlowMutationLock<T>(flowDir: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? flowDir.toLocaleLowerCase('en-US') : flowDir;
  const previous = flowMutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  flowMutationQueues.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (flowMutationQueues.get(key) === tail) flowMutationQueues.delete(key);
  }
}

export class FlowAssetError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) {
    super(message);
    this.name = 'FlowAssetError';
  }
}

export function validateVaultProjectId(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    value === '.' ||
    value === '..' ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(value) ||
    /[. ]$/.test(value) ||
    path.basename(value) !== value
  ) {
    throw new ValidationError('Invalid projectId');
  }
}

function validateAttachmentFilename(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    value === '.' ||
    value === '..' ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(value) ||
    /[. ]$/.test(value) ||
    path.basename(value) !== value
  ) {
    throw new ValidationError('附件文件名无效');
  }
  const stem = value.split('.')[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    throw new ValidationError('附件文件名无效');
  }
}

function decodeAttachment(contentBase64: unknown): Buffer {
  if (typeof contentBase64 !== 'string') {
    throw new ValidationError('contentBase64 is required');
  }
  const maxEncodedLength = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;
  if (contentBase64.length > maxEncodedLength) {
    throw new ValidationError('附件不能超过 3 MiB');
  }
  if (
    contentBase64.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)
  ) {
    throw new ValidationError('附件内容不是有效的 base64');
  }
  const content = Buffer.from(contentBase64, 'base64');
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw new ValidationError('附件不能超过 3 MiB');
  }
  return content;
}

function normalizeLinkPath(value: unknown): string {
  // link 只是 Flow 元数据，不等同于 Agent 文件读取授权。
  if (typeof value !== 'string') throw new ValidationError('path is required');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || /[\u0000-\u001f]/.test(trimmed) || !path.isAbsolute(trimmed)) {
    throw new ValidationError('链接路径必须是有效的绝对路径');
  }
  return path.normalize(trimmed);
}

function validateLinkLabel(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('label is required');
  const label = value.trim();
  if (!label || label.length > 200 || /[\u0000-\u001f]/.test(label)) {
    throw new ValidationError('链接名称无效');
  }
  return label;
}

function pathComparisonKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

async function requireFlowDir(flowId: string, projectId: unknown): Promise<string> {
  validateId(flowId, 'flowId');
  validateVaultProjectId(projectId);
  const projectDir = await findProjectDir(projectId);
  const flowDir = projectDir ? await findFlowDir(projectDir, flowId) : null;
  if (!flowDir) throw new FlowAssetError('Flow not found', 404);
  return flowDir;
}

async function ensureAttachmentsDir(flowDir: string): Promise<string> {
  const attachmentsDir = path.join(flowDir, 'attachments');
  try {
    const stats = await fs.lstat(attachmentsDir);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new ValidationError('attachments 目录无效');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await fs.mkdir(attachmentsDir);
  }
  return attachmentsDir;
}

async function listAttachmentNames(flowDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(flowDir, 'attachments'), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

async function updateFlowTimestamp(flowDir: string): Promise<void> {
  const document = await readFlowDocument(flowDir);
  if (!document) return;
  document.fm.updated = new Date().toISOString().split('T')[0];
  await atomicWriteFile(document.flowMdPath, stringifyWithFrontmatter(document.fm, document.body));
}

async function readFlowDocument(flowDir: string): Promise<{
  flowMdPath: string;
  fm: Record<string, unknown>;
  body: string;
} | null> {
  const flowMdPath = path.join(flowDir, 'flow.md');
  try {
    const raw = await fs.readFile(flowMdPath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    return parsed ? { flowMdPath, ...parsed } : null;
  } catch {
    return null;
  }
}

export async function uploadFlowAttachment(input: {
  flowId: string;
  projectId: unknown;
  filename: unknown;
  contentBase64: unknown;
}): Promise<{ filename: string; attachments: string[] }> {
  const filename = input.filename;
  validateAttachmentFilename(filename);
  const content = decodeAttachment(input.contentBase64);
  const flowDir = await requireFlowDir(input.flowId, input.projectId);
  return withFlowMutationLock(flowDir, async () => {
    const attachmentsDir = await ensureAttachmentsDir(flowDir);
    const targetFile = path.join(attachmentsDir, filename);
    try {
      await atomicCreateFile(targetFile, content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new FlowAssetError('同名附件已存在', 409);
      }
      throw error;
    }
    await updateFlowTimestamp(flowDir);
    invalidateCache();
    return { filename, attachments: await listAttachmentNames(flowDir) };
  });
}

export async function deleteFlowAttachment(input: {
  flowId: string;
  projectId: unknown;
  filename: unknown;
}): Promise<{ attachments: string[] }> {
  const filename = input.filename;
  validateAttachmentFilename(filename);
  const flowDir = await requireFlowDir(input.flowId, input.projectId);
  return withFlowMutationLock(flowDir, async () => {
    const attachmentsDir = path.join(flowDir, 'attachments');
    try {
      const directoryStats = await fs.lstat(attachmentsDir);
      if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
        throw new ValidationError('attachments 目录无效');
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { attachments: [] };
      throw error;
    }

    const targetFile = path.join(attachmentsDir, filename);
    try {
      const targetStats = await fs.lstat(targetFile);
      if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
        throw new ValidationError('只能删除普通附件文件');
      }
      await fs.unlink(targetFile);
      await updateFlowTimestamp(flowDir);
      invalidateCache();
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return { attachments: await listAttachmentNames(flowDir) };
  });
}

export async function addFlowLink(input: {
  flowId: string;
  projectId: unknown;
  path: unknown;
  label: unknown;
}): Promise<{ links: FlowLink[]; created: boolean }> {
  const linkPath = normalizeLinkPath(input.path);
  const label = validateLinkLabel(input.label);
  const flowDir = await requireFlowDir(input.flowId, input.projectId);
  return withFlowMutationLock(flowDir, async () => {
    const document = await readFlowDocument(flowDir);
    if (!document) throw new FlowAssetError('flow.md frontmatter 无效', 422);
    const links = getFlowLinks(document.fm);
    const existing = links.find((link) => pathComparisonKey(link.path) === pathComparisonKey(linkPath));
    if (existing) {
      existing.path = linkPath;
      existing.label = label;
    } else {
      links.push({ path: linkPath, label });
    }
    document.fm.links = links;
    document.fm.updated = new Date().toISOString().split('T')[0];
    await atomicWriteFile(document.flowMdPath, stringifyWithFrontmatter(document.fm, document.body));
    invalidateCache();
    return { links, created: !existing };
  });
}

export async function removeFlowLink(input: {
  flowId: string;
  projectId: unknown;
  path: unknown;
}): Promise<{ links: FlowLink[] }> {
  const linkPath = normalizeLinkPath(input.path);
  const flowDir = await requireFlowDir(input.flowId, input.projectId);
  return withFlowMutationLock(flowDir, async () => {
    const document = await readFlowDocument(flowDir);
    if (!document) throw new FlowAssetError('flow.md frontmatter 无效', 422);
    const links = getFlowLinks(document.fm);
    const nextLinks = links.filter((link) => pathComparisonKey(link.path) !== pathComparisonKey(linkPath));
    if (nextLinks.length !== links.length) {
      document.fm.links = nextLinks;
      document.fm.updated = new Date().toISOString().split('T')[0];
      await atomicWriteFile(document.flowMdPath, stringifyWithFrontmatter(document.fm, document.body));
      invalidateCache();
    }
    return { links: nextLinks };
  });
}
