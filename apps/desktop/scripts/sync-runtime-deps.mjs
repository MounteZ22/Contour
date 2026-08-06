import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const desktopDir = process.cwd();
const repositoryRoot = path.resolve(desktopDir, '..', '..');
const destinationModules = path.join(desktopDir, 'node_modules');
const copied = new Set();

function packageDirectory(name, fromDirectory = repositoryRoot) {
  let currentDirectory = fromDirectory;
  while (currentDirectory.startsWith(repositoryRoot)) {
    const directory = path.join(currentDirectory, 'node_modules', name);
    if (existsSync(path.join(directory, 'package.json'))) return directory;
    const parent = path.dirname(currentDirectory);
    if (parent === currentDirectory) break;
    currentDirectory = parent;
  }
  const rootDirectory = path.join(repositoryRoot, 'node_modules', name);
  if (existsSync(path.join(rootDirectory, 'package.json'))) return rootDirectory;
  throw new Error(`Unable to locate package root for ${name}`);
}

function copyPackage(name, optional = false, fromDirectory = repositoryRoot) {
  if (copied.has(name)) return;
  let source;
  try {
    source = packageDirectory(name, fromDirectory);
  } catch (error) {
    if (optional) return;
    throw error;
  }
  copied.add(name);
  const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
  const destination = path.join(destinationModules, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: (entry) => !path.relative(source, entry).split(/[\\/]/).includes('node_modules'),
  });
  for (const dependency of Object.keys(manifest.dependencies ?? {})) copyPackage(dependency, false, source);
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) copyPackage(dependency, true, source);
}

rmSync(destinationModules, { recursive: true, force: true });
mkdirSync(destinationModules, { recursive: true });
for (const dependency of [
  '@earendil-works/pi-coding-agent',
  '@modelcontextprotocol/sdk',
  '@sinclair/typebox',
]) copyPackage(dependency);
console.log(`[desktop runtime] staged ${copied.size} packages`);
