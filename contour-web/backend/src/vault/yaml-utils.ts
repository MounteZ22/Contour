import yaml from 'js-yaml';

export function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  try {
    const loaded = yaml.load(match[1]);
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return null;
    const body = raw.slice(match[0].length);
    return { fm: loaded as Record<string, unknown>, body };
  } catch {
    return null;
  }
}

export function stringifyWithFrontmatter(fm: Record<string, unknown>, body: string): string {
  const fmYaml = yaml.dump(fm, { lineWidth: -1, quotingType: '"', forceQuotes: false });
  return `---\n${fmYaml}---\n${body}`;
}

export function yamlSafeValue(value: string): string {
  if (/[\n\r:#\{\}\[\],&*?|<>'"!%@`]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}
