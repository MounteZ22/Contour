import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ProjectManager } from './projectManager.js';
import type { AuditLog } from './audit-log.js';
import { ValidationError } from '../vault/validate.js';
import { isInside, comparisonKey } from '../vault/path-utils.js';

export type AuthorizedPathKind = 'file' | 'directory' | 'any';

export class PathNotAuthorizedError extends Error {
  constructor() {
    super('该路径不在当前项目允许访问的范围内');
    this.name = 'PathNotAuthorizedError';
  }
}

function canonicalExistingPath(inputPath: string): string {
  if (!inputPath.trim() || !path.isAbsolute(inputPath)) throw new ValidationError('路径必须是绝对路径');
  try {
    return realpathSync.native(path.resolve(inputPath));
  } catch {
    throw new ValidationError('路径不存在或当前无法访问');
  }
}

function canonicalWritablePath(inputPath: string): string {
  if (!inputPath.trim() || !path.isAbsolute(inputPath)) throw new ValidationError('路径必须是绝对路径');
  const resolved = path.resolve(inputPath);
  let existingAncestor = resolved;
  const missingParts: string[] = [];
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) throw new ValidationError('路径所在磁盘当前无法访问');
    missingParts.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  let canonicalAncestor: string;
  try {
    canonicalAncestor = realpathSync.native(existingAncestor);
  } catch {
    throw new ValidationError('路径不存在或当前无法访问');
  }
  if (!statSync(canonicalAncestor).isDirectory() && missingParts.length > 0) throw new ValidationError('目标文件的父路径不是文件夹');
  return path.join(canonicalAncestor, ...missingParts);
}

/** Authorization functions bound to a single project's configuration store. */
export function createAuthorizedPaths(projectManager: Pick<ProjectManager, 'getProjectConfig'>, auditLog: AuditLog) {
  function roots(projectId: string, additionalDirectories: string[]) {
    const config = projectManager.getProjectConfig(projectId);
    return [config, [config.projectDir, ...config.attachedDirectories, ...additionalDirectories]
      .filter(Boolean)
      .flatMap((root) => {
        try {
          const canonical = canonicalExistingPath(root);
          return statSync(canonical).isDirectory() ? [canonical] : [];
        } catch {
          return [];
        }
      })] as const;
  }

  function files(config: ReturnType<ProjectManager['getProjectConfig']>, additionalFiles: string[]) {
    return [...config.attachedFiles, ...additionalFiles].flatMap((filePath) => {
      try {
        const canonical = canonicalExistingPath(filePath);
        return statSync(canonical).isFile() ? [canonical] : [];
      } catch {
        return [];
      }
    });
  }

  function authorizeProjectPath(projectId: string, inputPath: string, kind: AuthorizedPathKind = 'any', additionalFiles: string[] = [], additionalDirectories: string[] = []): string {
    const [config, directoryRoots] = roots(projectId, additionalDirectories);
    const target = canonicalExistingPath(inputPath);
    const targetStat = statSync(target);
    if (kind === 'file' && !targetStat.isFile()) throw new ValidationError('目标不是文件');
    if (kind === 'directory' && !targetStat.isDirectory()) throw new ValidationError('目标不是文件夹');
    const allowed = directoryRoots.some((root) => isInside(root, target)) || files(config, additionalFiles).some((file) => comparisonKey(file) === comparisonKey(target));
    if (!allowed) {
      auditLog('PathNotAuthorizedError', { projectId, target, kind, source: 'authorizeProjectPath' });
      throw new PathNotAuthorizedError();
    }
    return target;
  }

  function authorizeProjectWritePath(projectId: string, inputPath: string, additionalFiles: string[] = [], additionalDirectories: string[] = []): string {
    const [config, directoryRoots] = roots(projectId, additionalDirectories);
    const target = canonicalWritablePath(inputPath);
    const allowed = directoryRoots.some((root) => isInside(root, target)) || files(config, additionalFiles).some((file) => comparisonKey(file) === comparisonKey(target));
    if (!allowed) {
      auditLog('PathNotAuthorizedError', { projectId, target, source: 'authorizeProjectWritePath' });
      throw new PathNotAuthorizedError();
    }
    return target;
  }

  return { authorizeProjectPath, authorizeProjectWritePath };
}

export type AuthorizedPaths = ReturnType<typeof createAuthorizedPaths>;
