import fs from 'node:fs/promises';
import matter from 'gray-matter';
import type { FlowLink } from '../types.js';

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  content: string;
  title: string;
}

export async function parseMarkdownFile(filePath: string): Promise<ParsedMarkdown | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(raw);
    const title = extractTitle(content) || (data.title as string) || '';
    return { frontmatter: data, content, title };
  } catch (err) {
    console.warn(`[parser] failed to read ${filePath}:`, (err as Error).message);
    return null;
  }
}

function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : null;
}

export function getString(data: Record<string, unknown>, key: string, fallback = ''): string {
  const val = data[key];
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) {
    // YYYY-MM-DD format
    return val.toISOString().split('T')[0];
  }
  return fallback;
}

export function getStringArray(data: Record<string, unknown>, key: string): string[] {
  const val = data[key];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  return [];
}

/** 只接受完整的 { path, label } 项，避免把异常 YAML 结构带入 API。 */
export function getFlowLinks(data: Record<string, unknown>, key = 'links'): FlowLink[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.path !== 'string' || typeof candidate.label !== 'string') return [];
    const itemPath = candidate.path.trim();
    const label = candidate.label.trim();
    return itemPath && label ? [{ path: itemPath, label }] : [];
  });
}
