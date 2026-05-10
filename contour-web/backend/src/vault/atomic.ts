import { writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.contour-tmp-${randomUUID()}`);
  await writeFile(tmpFile, content, 'utf-8');
  await rename(tmpFile, filePath);
}
