import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let testRoot!: string;
let projectsDir!: string;

vi.mock('../../runtime/config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  testRoot = join(tmpdir(), `contour-agent-files-${Date.now()}`);
  projectsDir = join(testRoot, 'data', 'projects');
  return { CONFIG: { DATA_DIR: testRoot, PROJECTS_DIR: projectsDir, CONFIG_DIR: testRoot, VAULTS_DIR: testRoot, LEGACY_VAULT: testRoot } };
});

const { createAuthorizedFileTools } = await import('../authorized-file-tools.js');

const projectId = 'test-project';
let projectDir: string;
let workspaceDir: string;
let attachedDir: string;
let exactFile: string;
let outsideFile: string;

function tool(name: string, additionalFiles: string[] = [], allowWrite = false) {
  return createAuthorizedFileTools({ projectId, workspaceDir, additionalFiles, allowWrite })
    .find((item) => item.name === name)! as { execute: (...args: any[]) => Promise<any> };
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  projectDir = path.join(testRoot, 'vault');
  workspaceDir = path.join(testRoot, 'workspace');
  attachedDir = path.join(testRoot, 'attached');
  exactFile = path.join(testRoot, 'single', 'one.txt');
  outsideFile = path.join(testRoot, 'private', 'secret.txt');

  for (const directory of [projectDir, workspaceDir, attachedDir, path.dirname(exactFile), path.dirname(outsideFile)]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.mkdirSync(path.join(projectDir, 'nested'));
  fs.writeFileSync(path.join(projectDir, 'nested', 'flow.md'), 'Alpha\nBeta target\nGamma');
  fs.writeFileSync(path.join(attachedDir, 'data.csv'), 'name,value\nalpha,1');
  fs.writeFileSync(path.join(workspaceDir, 'notes.txt'), 'session notes');
  fs.writeFileSync(exactFile, 'exact file');
  fs.writeFileSync(outsideFile, 'secret');

  const configDir = path.join(projectsDir, projectId);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
    projectDir,
    attachedDirectories: [attachedDir],
    attachedFiles: [exactFile],
  }));
});

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('Agent 受控文件工具', () => {
  it('Given Vault、附加文件和会话文件, When read, Then 三种授权范围都可读', async () => {
    const read = tool('read');
    const vault = await read.execute('1', { path: path.join(projectDir, 'nested', 'flow.md') });
    const attached = await read.execute('2', { path: exactFile });
    const workspace = await read.execute('3', { path: 'notes.txt' });

    expect(vault.content[0].text).toContain('Beta target');
    expect(attached.content[0].text).toBe('exact file');
    expect(workspace.content[0].text).toBe('session notes');
  });

  it('Given 项目外文件, When read, Then 拒绝；仅当前上下文链接可以精确放行', async () => {
    await expect(tool('read').execute('1', { path: outsideFile })).rejects.toThrow('不在当前项目');
    const result = await tool('read', [outsideFile]).execute('2', { path: outsideFile });
    expect(result.content[0].text).toBe('secret');
  });

  it('Given 精确附加文件, When ls 其父目录, Then 不会把整个父目录一并授权', async () => {
    await expect(tool('ls').execute('1', { path: path.dirname(exactFile) })).rejects.toThrow('不在当前项目');
  });

  it('Given 授权目录含越界链接, When read 或 ls, Then 不跟随该链接', async () => {
    const link = path.join(attachedDir, 'escape');
    fs.symlinkSync(path.dirname(outsideFile), link, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(tool('read').execute('1', { path: path.join(link, 'secret.txt') })).rejects.toThrow('不在当前项目');
    const listed = await tool('ls').execute('2', { path: attachedDir });
    expect(listed.content[0].text).not.toContain('escape');
  });

  it('Given 授权目录, When find 和 grep, Then 只返回匹配文件与行号', async () => {
    const found = await tool('find').execute('1', { path: projectDir, pattern: '**/*.md' });
    const matched = await tool('grep').execute('2', {
      path: projectDir,
      pattern: 'target',
      glob: '**/*.md',
    });

    expect(found.content[0].text).toBe('nested/flow.md');
    expect(matched.content[0].text).toContain('nested/flow.md:2');
    expect(matched.content[0].text).toContain('Beta target');
  });

  it('Given 图片文件, When read, Then 返回模型可识别的图片内容', async () => {
    const imagePath = path.join(projectDir, 'figure.png');
    fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]));

    const result = await tool('read').execute('1', { path: imagePath });
    expect(result.content[0]).toEqual({ type: 'image', data: 'iVBORw==', mimeType: 'image/png' });
  });

  it('Given 只读模式, When 组装工具, Then write 和 edit 不存在', () => {
    expect(createAuthorizedFileTools({ projectId, workspaceDir }).map((item) => item.name))
      .not.toEqual(expect.arrayContaining(['write', 'edit']));
  });

  it('Given 项目和会话目录, When write/edit, Then 可创建文件并精确编辑', async () => {
    const write = tool('write', [], true);
    const edit = tool('edit', [], true);
    const vaultFile = path.join(projectDir, 'generated', 'result.md');

    await write.execute('1', { path: vaultFile, content: 'Alpha\nBeta' });
    await write.execute('2', { path: 'draft.md', content: 'Session draft' });
    await edit.execute('3', { path: vaultFile, edits: [{ oldText: 'Beta', newText: 'Gamma' }] });

    expect(fs.readFileSync(vaultFile, 'utf-8')).toBe('Alpha\nGamma');
    expect(fs.readFileSync(path.join(workspaceDir, 'draft.md'), 'utf-8')).toBe('Session draft');
  });

  it('Given 项目外路径, When write 或 edit, Then 都拒绝且原文件不变', async () => {
    const write = tool('write', [], true);
    const edit = tool('edit', [], true);

    await expect(write.execute('1', { path: path.join(testRoot, 'private', 'new.txt'), content: 'no' }))
      .rejects.toThrow('不在当前项目');
    await expect(edit.execute('2', { path: outsideFile, edits: [{ oldText: 'secret', newText: 'changed' }] }))
      .rejects.toThrow('不在当前项目');
    expect(fs.readFileSync(outsideFile, 'utf-8')).toBe('secret');
  });

  it('Given 授权目录中的越界链接, When write/edit, Then 拒绝链接逃逸', async () => {
    const link = path.join(attachedDir, 'write-escape');
    fs.symlinkSync(path.dirname(outsideFile), link, process.platform === 'win32' ? 'junction' : 'dir');
    const write = tool('write', [], true);
    const edit = tool('edit', [], true);

    await expect(write.execute('1', { path: path.join(link, 'new.txt'), content: 'no' }))
      .rejects.toThrow('不在当前项目');
    await expect(edit.execute('2', { path: path.join(link, 'secret.txt'), edits: [{ oldText: 'secret', newText: 'no' }] }))
      .rejects.toThrow('不在当前项目');
    expect(fs.existsSync(path.join(path.dirname(outsideFile), 'new.txt'))).toBe(false);
    expect(fs.readFileSync(outsideFile, 'utf-8')).toBe('secret');
  });
});
