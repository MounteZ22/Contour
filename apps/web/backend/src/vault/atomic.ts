import { link, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function atomicWriteFile(filePath: string, content: string | Uint8Array): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.contour-tmp-${randomUUID()}`);
  try {
    if (typeof content === 'string') {
      await writeFile(tmpFile, content, 'utf-8');
    } else {
      await writeFile(tmpFile, content);
    }
    await rename(tmpFile, filePath);
  } catch (error) {
    await rm(tmpFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 原子创建新文件；目标已存在时抛出 EEXIST，绝不覆盖原文件。 */
export async function atomicCreateFile(filePath: string, content: string | Uint8Array): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.contour-tmp-${randomUUID()}`);
  try {
    if (typeof content === 'string') await writeFile(tmpFile, content, 'utf-8');
    else await writeFile(tmpFile, content);
    await link(tmpFile, filePath);
  } finally {
    await rm(tmpFile, { force: true }).catch(() => undefined);
  }
}
