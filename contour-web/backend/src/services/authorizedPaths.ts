import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { getProjectConfig } from './projectManager.js';
import { ValidationError } from '../vault/validate.js';
import { isInside, comparisonKey } from '../vault/path-utils.js';
import { auditLog } from './audit-log.js';

export type AuthorizedPathKind = 'file' | 'directory' | 'any';

export class PathNotAuthorizedError extends Error {
  constructor() {
    super('该路径不在当前项目允许访问的范围内');
    this.name = 'PathNotAuthorizedError';
  }
}

function canonicalExistingPath(inputPath: string): string {
  if (!inputPath.trim() || !path.isAbsolute(inputPath)) {
    throw new ValidationError('路径必须是绝对路径');
  }
  try {
    return realpathSync.native(path.resolve(inputPath));
  } catch {
    throw new ValidationError('路径不存在或当前无法访问');
  }
}

/**
 * 解析允许尚不存在的写入目标。
 *
 * 从目标向上找到最近的已存在父目录并 realpath，再拼回尚不存在的部分。
 * 这样即使路径经过软链接或 Windows 目录联接，最终授权判断看到的也是实际位置。
 */
function canonicalWritablePath(inputPath: string): string {
  if (!inputPath.trim() || !path.isAbsolute(inputPath)) {
    throw new ValidationError('路径必须是绝对路径');
  }

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
  if (!statSync(canonicalAncestor).isDirectory() && missingParts.length > 0) {
    throw new ValidationError('目标文件的父路径不是文件夹');
  }
  return path.join(canonicalAncestor, ...missingParts);
}

/**
 * 校验一个已存在路径是否属于项目 Vault、附加目录或精确附加文件。
 * 所有路径都先 realpath，避免软链接/目录联接绕过授权范围。
 */
export function authorizeProjectPath(
  projectId: string,
  inputPath: string,
  kind: AuthorizedPathKind = 'any',
  additionalFiles: string[] = [],
  additionalDirectories: string[] = [],
): string {
  const config = getProjectConfig(projectId);
  const target = canonicalExistingPath(inputPath);
  const targetStat = statSync(target);

  if (kind === 'file' && !targetStat.isFile()) throw new ValidationError('目标不是文件');
  if (kind === 'directory' && !targetStat.isDirectory()) throw new ValidationError('目标不是文件夹');

  const directoryRoots = [config.projectDir, ...config.attachedDirectories, ...additionalDirectories]
    .filter(Boolean)
    .flatMap((root) => {
      try {
        const canonical = canonicalExistingPath(root);
        return statSync(canonical).isDirectory() ? [canonical] : [];
      } catch {
        return [];
      }
    });
  const exactFiles = [...config.attachedFiles, ...additionalFiles]
    .flatMap((filePath) => {
      try {
        const canonical = canonicalExistingPath(filePath);
        return statSync(canonical).isFile() ? [canonical] : [];
      } catch {
        return [];
      }
    });

  const targetKey = comparisonKey(target);
  const allowed = directoryRoots.some((root) => isInside(root, target)) ||
    exactFiles.some((file) => comparisonKey(file) === targetKey);
  if (!allowed) {
    auditLog('PathNotAuthorizedError', { projectId, target, kind, source: 'authorizeProjectPath' });
    throw new PathNotAuthorizedError();
  }
  return target;
}

/**
 * 校验一个文件写入目标是否属于项目授权范围。
 * 与只读授权不同，目标文件和中间目录可以尚不存在；已有路径仍会 realpath，
 * 防止通过软链接或目录联接写到白名单之外。
 */
export function authorizeProjectWritePath(
  projectId: string,
  inputPath: string,
  additionalFiles: string[] = [],
  additionalDirectories: string[] = [],
): string {
  const config = getProjectConfig(projectId);
  const target = canonicalWritablePath(inputPath);
  const directoryRoots = [config.projectDir, ...config.attachedDirectories, ...additionalDirectories]
    .filter(Boolean)
    .flatMap((root) => {
      try {
        const canonical = canonicalExistingPath(root);
        return statSync(canonical).isDirectory() ? [canonical] : [];
      } catch {
        return [];
      }
    });
  const exactFiles = [...config.attachedFiles, ...additionalFiles]
    .flatMap((filePath) => {
      try {
        const canonical = canonicalExistingPath(filePath);
        return statSync(canonical).isFile() ? [canonical] : [];
      } catch {
        return [];
      }
    });

  const targetKey = comparisonKey(target);
  const allowed = directoryRoots.some((root) => isInside(root, target)) ||
    exactFiles.some((file) => comparisonKey(file) === targetKey);
  if (!allowed) {
    auditLog('PathNotAuthorizedError', { projectId, target, source: 'authorizeProjectWritePath' });
    throw new PathNotAuthorizedError();
  }
  return target;
}
