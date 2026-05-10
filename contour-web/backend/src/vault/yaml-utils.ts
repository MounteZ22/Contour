import yaml from 'js-yaml';

export function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fm = yaml.load(match[1]) as Record<string, unknown>;
  const body = raw.slice(match[0].length);
  return { fm, body };
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
