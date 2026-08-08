import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const desktopDir = process.cwd();
const mainBundle = path.join(desktopDir, 'dist', 'main.cjs');
const builderConfig = path.join(desktopDir, 'electron-builder.yml');
if (!existsSync(mainBundle)) throw new Error('Build main.cjs before checking runtime dependencies');

const bundle = readFileSync(mainBundle, 'utf8');
const externalPackages = [...bundle.matchAll(/require\(["']([^"']+)["']\)/g)]
  .map((match) => match[1])
  .filter((name) => name.startsWith('@earendil-works/'));
const missing = [...new Set(externalPackages)].filter(
  (name) => !existsSync(path.join(desktopDir, 'node_modules', name)),
);
if (missing.length > 0) throw new Error(`Missing staged external runtime packages: ${missing.join(', ')}`);

for (const packageName of ['@earendil-works/pi-coding-agent', '@modelcontextprotocol/sdk', 'typebox']) {
  if (!existsSync(path.join(desktopDir, 'node_modules', packageName))) {
    throw new Error(`Required runtime package was not staged: ${packageName}`);
  }
}

const config = readFileSync(builderConfig, 'utf8');
for (const rule of ['node_modules/**', '!node_modules/electron/**', '!node_modules/electron-builder/**']) {
  if (!config.includes(rule)) throw new Error(`electron-builder files rule missing: ${rule}`);
}
console.log(`[desktop runtime] ${externalPackages.length} external Pi require entries resolved`);
