import path from "node:path";

/**
 * 跨平台路径比较键：将路径标准化后生成用于比较的唯一键。
 * Windows 下忽略大小写，并统一斜杠方向。
 */
export function comparisonKey(value: string): string {
  const normalized = path.normalize(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

/**
 * 判断 target 是否在 root 目录内（含自身）。
 * 基于路径相对化判断，不依赖 realpath，适合在授权检查前快速过滤。
 */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
