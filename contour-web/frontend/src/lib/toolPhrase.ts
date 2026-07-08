/**
 * 工具名 → 中文语义短语映射
 *
 * 覆盖常见 agent 工具的语义短语，未知工具 fallback 到 toolName。
 * input 字段名做容错（path/file_path/command/pattern 都尝试）。
 */
export function toolPhrase(toolName: string, input?: Record<string, unknown>): string {
  const path = getString(input, 'path', 'file_path');
  const command = getString(input, 'command');
  const pattern = getString(input, 'pattern');

  switch (toolName) {
    case 'Read':
      return path ? `读取 ${basename(path)}` : '读取文件';
    case 'Write':
      return path ? `写入 ${basename(path)}` : '写入文件';
    case 'Edit':
      return path ? `编辑 ${basename(path)}` : '编辑文件';
    case 'Glob':
      return pattern ? `搜索文件 ${pattern}` : '搜索文件';
    case 'Grep':
      return pattern ? `搜索内容 ${pattern}` : '搜索内容';
    case 'Bash':
      return command ? `执行 ${truncate(command, 40)}` : '执行命令';
    case 'List':
      return path ? `列出 ${basename(path)}` : '列出目录';
    default:
      return toolName;
  }
}

// ── helpers ──

function getString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return undefined;
}

function basename(p: string): string {
  const segments = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return segments[segments.length - 1] || p;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}
