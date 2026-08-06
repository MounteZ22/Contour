/**
 * Agent 受控只读文件工具。
 *
 * 这些工具覆盖 Pi 同名内置工具，把“可读路径”限制为当前会话工作目录、
 * 项目 Vault、项目附加目录、精确附加文件，以及当前上下文明示的 Flow 链接。
 */

import fs from 'node:fs/promises';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { Type, type Static } from 'typebox';
import type { AuthorizedPaths, AuthorizedPathKind } from '../services/authorizedPaths.js';
import { ValidationError } from '../vault/validate.js';
import { invalidateCache } from '../vault/loader.js';
import { isInside, comparisonKey } from '../vault/path-utils.js';
import { generateDiffString, generateUnifiedPatch, withFileMutationQueue } from '@earendil-works/pi-coding-agent';

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SCAN_ENTRIES = 5_000;
const DEFAULT_RESULT_LIMIT = 200;

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export interface AuthorizedFileToolOptions {
  projectId: string;
  workspaceDir: string;
  /** 仅限当前上下文明确引用的 Flow 外部链接。 */
  additionalFiles?: string[];
  /** 是否提供受路径白名单保护的 write/edit 工具。 */
  allowWrite?: boolean;
  authorizedPaths: AuthorizedPaths;
}

const readParams = Type.Object({
  path: Type.String({ description: '文件路径；相对路径以当前会话工作目录为基准' }),
  offset: Type.Optional(Type.Number({ minimum: 1, description: '从第几行开始（从 1 开始）' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 2_000, description: '最多返回多少行' })),
});

const lsParams = Type.Object({
  path: Type.Optional(Type.String({ description: '目录路径；默认当前会话工作目录' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1_000 })),
});

const findParams = Type.Object({
  pattern: Type.String({ description: '文件名 glob，如 **/*.md 或 data*.csv' }),
  path: Type.Optional(Type.String({ description: '搜索根目录' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1_000 })),
});

const grepParams = Type.Object({
  pattern: Type.String({ description: '正则表达式或字面文本' }),
  path: Type.Optional(Type.String({ description: '搜索文件或目录' })),
  glob: Type.Optional(Type.String({ description: '文件过滤 glob，如 **/*.md' })),
  ignoreCase: Type.Optional(Type.Boolean()),
  literal: Type.Optional(Type.Boolean()),
  context: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1_000 })),
});

const writeParams = Type.Object({
  path: Type.String({ description: '要写入的文件路径；相对路径以当前会话工作目录为基准' }),
  content: Type.String({ description: '完整文件内容' }),
});

const editParams = Type.Object({
  path: Type.String({ description: '要编辑的文件路径；相对路径以当前会话工作目录为基准' }),
  edits: Type.Array(Type.Object({
    oldText: Type.String({ description: '文件中唯一存在的原文本' }),
    newText: Type.String({ description: '替换后的新文本' }),
  }), { minItems: 1, maxItems: 50 }),
});

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} };
}

function normalizeLimit(value: number | undefined, fallback = DEFAULT_RESULT_LIMIT): number {
  return Math.max(1, Math.min(value ?? fallback, 1_000));
}

function globRegex(pattern: string): RegExp {
  if (!pattern.trim() || pattern.length > 500) throw new ValidationError('glob 模式无效');
  const normalized = pattern.replace(/\\/g, '/');
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, process.platform === 'win32' ? 'i' : '');
}

/**
 * 简单 ReDoS 风险检测：检查正则是否包含嵌套量词，
 * 形如 (a+)+, (a*)*, ([a-z]+)* 等可能导致指数级回溯的模式。
 */
function hasReDoSrisk(regex: RegExp): boolean {
  // source 包含嵌套量词的模式
  return /\([^)]*[+*][^)]*\)[+*]/.test(regex.source) ||
    /\([^)]*\{[\d,]+\}[^)]*\)[+*{]/.test(regex.source);
}

function requireReadableText(buffer: Buffer, filePath: string): string {
  if (buffer.length > MAX_TEXT_BYTES) throw new ValidationError('文本文件超过 2 MB，无法在 Agent 中读取');
  if (buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)) {
    throw new ValidationError('二进制文件无法以文本格式读取');
  }
  return buffer.toString('utf-8');
}

export function createAuthorizedFileTools(options: AuthorizedFileToolOptions) {
  const workspaceRoot = realpathSync.native(path.resolve(options.workspaceDir));
  if (!statSync(workspaceRoot).isDirectory()) throw new ValidationError('Agent 会话工作目录无效');
  const additionalFiles = options.additionalFiles ?? [];

  const resolveInput = (inputPath: string | undefined): string => {
    const value = inputPath?.trim() || workspaceRoot;
    return path.isAbsolute(value) ? path.resolve(value) : path.resolve(workspaceRoot, value);
  };

  const authorize = (inputPath: string | undefined, kind: AuthorizedPathKind): string => {
    const candidate = resolveInput(inputPath);
    let canonical: string;
    try {
      canonical = realpathSync.native(candidate);
    } catch {
      throw new ValidationError('路径不存在或当前无法访问');
    }

    const stats = statSync(canonical);
    if (kind === 'file' && !stats.isFile()) throw new ValidationError('目标不是文件');
    if (kind === 'directory' && !stats.isDirectory()) throw new ValidationError('目标不是文件夹');

    if (isInside(workspaceRoot, canonical)) return canonical;
    return options.authorizedPaths.authorizeProjectPath(options.projectId, canonical, kind, additionalFiles);
  };

  const authorizeWrite = (inputPath: string): string => {
    const candidate = resolveInput(inputPath);
    return options.authorizedPaths.authorizeProjectWritePath(
      options.projectId,
      candidate,
      additionalFiles,
      [workspaceRoot],
    );
  };

  const walkFiles = async (root: string, signal?: AbortSignal): Promise<string[]> => {
    const rootStats = await fs.stat(root);
    if (rootStats.isFile()) return [root];
    const files: string[] = [];
    const pending = [root];
    let visited = 0;
    while (pending.length > 0 && visited < MAX_SCAN_ENTRIES) {
      if (signal?.aborted) throw new Error('操作已中止');
      const directory = pending.pop()!;
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        visited += 1;
        if (visited > MAX_SCAN_ENTRIES) break;
        if (entry.isSymbolicLink()) continue;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) pending.push(entryPath);
        else if (entry.isFile()) files.push(entryPath);
      }
    }
    return files;
  };

  const tools = [
    {
      name: 'read',
      label: 'Read File',
      description: '读取当前项目授权范围内的文本或图片文件。',
      parameters: readParams,
      execute: async (_id: string, params: Static<typeof readParams>) => {
        const filePath = authorize(params.path, 'file');
        const buffer = await fs.readFile(filePath);
        const mimeType = IMAGE_MIME[path.extname(filePath).toLowerCase()];
        if (mimeType) {
          if (buffer.length > MAX_IMAGE_BYTES) throw new ValidationError('图片超过 10 MB，无法在 Agent 中读取');
          return { content: [{ type: 'image' as const, data: buffer.toString('base64'), mimeType }], details: {} };
        }

        const content = requireReadableText(buffer, filePath);
        const lines = content.split(/\r?\n/);
        const offset = Math.max(1, Math.floor(params.offset ?? 1));
        const limit = Math.max(1, Math.min(Math.floor(params.limit ?? 500), 2_000));
        const selected = lines.slice(offset - 1, offset - 1 + limit);
        const prefix = offset > 1 || selected.length < lines.length
          ? `[${offset}-${offset + selected.length - 1} / ${lines.length} 行]\n`
          : '';
        return textResult(prefix + selected.join('\n'));
      },
    },
    {
      name: 'ls',
      label: 'List Directory',
      description: '列出当前项目授权范围内的目录内容。',
      parameters: lsParams,
      execute: async (_id: string, params: Static<typeof lsParams>) => {
        const directory = authorize(params.path, 'directory');
        const entries = await fs.readdir(directory, { withFileTypes: true });
        const limit = normalizeLimit(params.limit);
        const output = entries
          .filter((entry) => !entry.isSymbolicLink())
          .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
          .slice(0, limit)
          .map((entry) => `${entry.isDirectory() ? '[目录]' : '[文件]'} ${entry.name}`);
        return textResult(output.join('\n') || '(空目录)');
      },
    },
    {
      name: 'find',
      label: 'Find Files',
      description: '在当前项目授权目录中按 glob 查找文件。',
      parameters: findParams,
      execute: async (_id: string, params: Static<typeof findParams>, signal?: AbortSignal) => {
        const root = authorize(params.path, 'directory');
        const matcher = globRegex(params.pattern);
        const limit = normalizeLimit(params.limit);
        const matches = (await walkFiles(root, signal))
          .map((filePath) => path.relative(root, filePath).replace(/\\/g, '/'))
          .filter((relative) => matcher.test(relative))
          .sort((left, right) => left.localeCompare(right))
          .slice(0, limit);
        return textResult(matches.join('\n') || 'No files found');
      },
    },
    {
      name: 'grep',
      label: 'Search File Contents',
      description: '在当前项目授权文件中搜索文本。',
      parameters: grepParams,
      execute: async (_id: string, params: Static<typeof grepParams>, signal?: AbortSignal) => {
        if (!params.pattern || params.pattern.length > 1_000) throw new ValidationError('搜索模式无效');
        const target = authorize(params.path, 'any');
        const targetStats = await fs.stat(target);
        const root = targetStats.isDirectory() ? target : path.dirname(target);
        const fileMatcher = params.glob ? globRegex(params.glob) : null;
        const flags = params.ignoreCase ? 'i' : '';
        let matcher: RegExp;
        try {
          matcher = new RegExp(params.literal
            ? params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            : params.pattern, flags);
        } catch {
          throw new ValidationError('搜索正则表达式无效');
        }

        // ReDoS 防护：检测嵌套量词，拒绝存在指数级回溯风险的表达式
        if (!params.literal && hasReDoSrisk(matcher)) {
          throw new ValidationError('正则表达式存在 ReDoS 风险（嵌套量词），请简化模式后重试');
        }

        const files = targetStats.isFile() ? [target] : await walkFiles(target, signal);
        const limit = normalizeLimit(params.limit);
        const context = Math.max(0, Math.min(Math.floor(params.context ?? 0), 10));
        const results: string[] = [];
        for (const filePath of files) {
          if (signal?.aborted) throw new Error('操作已中止');
          const relative = path.relative(root, filePath).replace(/\\/g, '/');
          if (fileMatcher && !fileMatcher.test(relative)) continue;
          const stats = await fs.stat(filePath);
          if (stats.size > MAX_TEXT_BYTES) continue;
          const buffer = await fs.readFile(filePath);
          if (buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)) continue;
          const lines = buffer.toString('utf-8').split(/\r?\n/);
          for (let index = 0; index < lines.length; index += 1) {
            matcher.lastIndex = 0;
            if (!matcher.test(lines[index])) continue;
            const start = Math.max(0, index - context);
            const end = Math.min(lines.length, index + context + 1);
            results.push(`${relative}:${index + 1}\n${lines.slice(start, end).join('\n')}`);
            if (results.length >= limit) break;
          }
          if (results.length >= limit) break;
        }
        return textResult(results.join('\n\n') || 'No matches found');
      },
    },
  ];

  if (!options.allowWrite) return tools;

  return [
    ...tools,
    {
      name: 'write',
      label: 'Write File',
      description: '在当前项目授权范围内创建或完整覆写文本文件。',
      promptSnippet: 'Create or overwrite authorized project files',
      promptGuidelines: ['仅在新建文件或需要完整重写时使用 write。'],
      parameters: writeParams,
      execute: async (_id: string, params: Static<typeof writeParams>, signal?: AbortSignal) => {
        if (Buffer.byteLength(params.content, 'utf-8') > MAX_TEXT_BYTES) {
          throw new ValidationError('写入内容超过 2 MB');
        }
        // 第一次授权：提前校验路径合法性，失败则不入队
        const target = authorizeWrite(params.path);
        // 以授权后的实际路径作为队列 key，确保锁与写入路径一致
        return withFileMutationQueue(target, async () => {
          if (signal?.aborted) throw new Error('操作已中止');
          // 队列内二次授权：防止在排队等待期间路径状态发生变化（如文件被外部删除或替换）
          const confirmedTarget = authorizeWrite(params.path);
          if (comparisonKey(confirmedTarget) !== comparisonKey(target)) {
            throw new ValidationError('写入目标在排队期间发生变化');
          }
          await fs.mkdir(path.dirname(confirmedTarget), { recursive: true });
          const existing = await fs.stat(confirmedTarget).catch(() => null);
          if (existing?.isDirectory()) throw new ValidationError('目标是文件夹，无法写入');
          await fs.writeFile(confirmedTarget, params.content, 'utf-8');
          invalidateCache();
          if (signal?.aborted) throw new Error('操作已中止');
          return textResult(`已写入 ${Buffer.byteLength(params.content, 'utf-8')} 字节到 ${params.path}`);
        });
      },
    },
    {
      name: 'edit',
      label: 'Edit File',
      description: '在当前项目授权范围内，用精确文本匹配编辑一个文本文件。',
      promptSnippet: 'Make precise edits to authorized project files',
      promptGuidelines: ['每个 oldText 必须在原文件中唯一出现；同一处修改不要重叠。'],
      parameters: editParams,
      execute: async (_id: string, params: Static<typeof editParams>, signal?: AbortSignal) => {
        const filePath = authorize(params.path, 'file');
        authorizeWrite(params.path);
        return withFileMutationQueue(filePath, async () => {
          if (signal?.aborted) throw new Error('操作已中止');
          // 在 readFile 前重新校验，防止 TOCTOU（检查时间 vs 使用时间）攻击
          const currentRealPath = realpathSync.native(filePath);
          if (comparisonKey(currentRealPath) !== comparisonKey(filePath)) {
            throw new ValidationError('文件在授权后被替换');
          }
          const buffer = await fs.readFile(filePath);
          const rawContent = requireReadableText(buffer, filePath);
          const bom = rawContent.startsWith('\uFEFF') ? '\uFEFF' : '';
          const content = (bom ? rawContent.slice(1) : rawContent).replace(/\r\n/g, '\n');
          const lineEnding = /\r\n/.test(rawContent) ? '\r\n' : '\n';
          const replacements = params.edits.map((entry) => {
            const oldText = entry.oldText.replace(/\r\n/g, '\n');
            const newText = entry.newText.replace(/\r\n/g, '\n');
            if (!oldText) throw new ValidationError('oldText 不能为空');
            const start = content.indexOf(oldText);
            if (start < 0) throw new ValidationError('oldText 在文件中不存在');
            if (content.indexOf(oldText, start + 1) >= 0) {
              throw new ValidationError('oldText 在文件中出现多次，请提供更精确的上下文');
            }
            return { start, end: start + oldText.length, newText };
          }).sort((left, right) => left.start - right.start);

          for (let index = 1; index < replacements.length; index += 1) {
            if (replacements[index].start < replacements[index - 1].end) {
              throw new ValidationError('多个编辑范围发生重叠');
            }
          }

          let nextContent = content;
          for (const replacement of [...replacements].reverse()) {
            nextContent = nextContent.slice(0, replacement.start) + replacement.newText + nextContent.slice(replacement.end);
          }
          const finalContent = bom + (lineEnding === '\r\n' ? nextContent.replace(/\n/g, '\r\n') : nextContent);
          if (Buffer.byteLength(finalContent, 'utf-8') > MAX_TEXT_BYTES) {
            throw new ValidationError('编辑后的文件超过 2 MB');
          }
          authorizeWrite(params.path);
          await fs.writeFile(filePath, finalContent, 'utf-8');
          invalidateCache();
          if (signal?.aborted) throw new Error('操作已中止');
          const diff = generateDiffString(content, nextContent);
          return {
            content: [{ type: 'text' as const, text: `已在 ${params.path} 完成 ${params.edits.length} 处替换` }],
            details: {
              diff: diff.diff,
              patch: generateUnifiedPatch(params.path, content, nextContent),
              firstChangedLine: diff.firstChangedLine,
            },
          };
        });
      },
    },
  ];
}
