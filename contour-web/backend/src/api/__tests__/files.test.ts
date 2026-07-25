import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

let testRoot!: string;
let projectsDir!: string;
let vaultsDir!: string;
let legacyDir!: string;

vi.mock('../../config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  testRoot = join(tmpdir(), `contour-files-api-${Date.now()}`);
  projectsDir = join(testRoot, 'data', 'projects');
  vaultsDir = join(testRoot, 'vaults');
  legacyDir = join(testRoot, 'legacy');
  return {
    PROJECTS_DIR: projectsDir,
    CONFIG: {
      VAULTS_DIR: vaultsDir,
      LEGACY_VAULT: legacyDir,
    },
  };
});

const openWithSystem = vi.fn();
const revealInFileManager = vi.fn();
vi.mock('../../services/hostFileActions.js', () => ({ openWithSystem, revealInFileManager }));

const filesRouter = (await import('../files.js')).default;
const app = express();
app.use(express.json());
app.use('/api/files', filesRouter);

const projectId = 'test-project';
let projectDir: string;
let attachedDir: string;
let attachedFile: string;
let siblingFile: string;
let linkedFile: string;

function writeConfig(config: { attachedDirectories?: string[]; attachedFiles?: string[] } = {}): void {
  const configDir = path.join(projectsDir, projectId);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
    projectDir,
    attachedDirectories: config.attachedDirectories ?? [attachedDir],
    attachedFiles: config.attachedFiles ?? [attachedFile],
  }));
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  vi.clearAllMocks();

  projectDir = path.join(vaultsDir, projectId);
  attachedDir = path.join(testRoot, 'attached-directory');
  attachedFile = path.join(testRoot, 'single-file.pdf');
  siblingFile = path.join(testRoot, 'private', 'secret.txt');
  linkedFile = path.join(testRoot, 'flow-links', 'data.xlsx');
  fs.mkdirSync(path.join(projectDir, 'flows', 'F001_test', 'sections'), { recursive: true });
  fs.mkdirSync(attachedDir, { recursive: true });
  fs.mkdirSync(path.dirname(siblingFile), { recursive: true });
  fs.mkdirSync(path.dirname(linkedFile), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'project.md'), '# Project');
  fs.writeFileSync(path.join(attachedDir, 'notes.txt'), 'hello');
  fs.writeFileSync(attachedFile, '%PDF');
  fs.writeFileSync(siblingFile, 'secret');
  fs.writeFileSync(linkedFile, 'xlsx');
  fs.writeFileSync(path.join(projectDir, 'flows', 'F001_test', 'flow.md'), `---\nflow_id: F001\ntitle: Test\nlinks:\n  - path: ${JSON.stringify(linkedFile)}\n    label: data\n---\n# Test\n`);
  writeConfig();
});

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('本机文件 API 授权与预览', () => {
  it('Given 项目目录和附加目录, When 列目录与预览文本, Then 返回内部查看数据', async () => {
    const list = await request(app).get('/api/files/list').query({ projectId, path: attachedDir });
    const preview = await request(app).get('/api/files/preview').query({
      projectId,
      path: path.join(attachedDir, 'notes.txt'),
    });

    expect(list.status).toBe(200);
    expect(list.body.data).toContainEqual(expect.objectContaining({ name: 'notes.txt', kind: 'file' }));
    expect(preview.body.data).toMatchObject({ kind: 'text', content: 'hello' });
  });

  it('Given 旧项目还没有 config.json, When 浏览 Vault, Then 仍按真实项目目录授权', async () => {
    fs.rmSync(path.join(projectsDir, projectId, 'config.json'));

    const response = await request(app).get('/api/files/list').query({ projectId, path: projectDir });

    expect(response.status).toBe(200);
    expect(response.body.data).toContainEqual(expect.objectContaining({ name: 'project.md' }));
  });

  it('Given 图片和外部格式, When 预览, Then 图片使用 data URL 而 PDF 交给系统', async () => {
    const imagePath = path.join(projectDir, 'figure.png');
    fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]));

    const image = await request(app).get('/api/files/preview').query({ projectId, path: imagePath });
    const external = await request(app).get('/api/files/preview').query({ projectId, path: attachedFile });

    expect(image.body.data.kind).toBe('image');
    expect(image.body.data.dataUrl).toBe('data:image/png;base64,iVBORw==');
    expect(external.body.data).toMatchObject({ kind: 'external', path: fs.realpathSync.native(attachedFile) });
  });

  it('Given 超大文本或图片, When 预览, Then 按实际读取字节拒绝返回', async () => {
    const textPath = path.join(projectDir, 'large.txt');
    const imagePath = path.join(projectDir, 'large.png');
    fs.writeFileSync(textPath, Buffer.alloc(2 * 1024 * 1024 + 1));
    fs.writeFileSync(imagePath, Buffer.alloc(10 * 1024 * 1024 + 1));

    const textResponse = await request(app).get('/api/files/preview').query({ projectId, path: textPath });
    const imageResponse = await request(app).get('/api/files/preview').query({ projectId, path: imagePath });

    expect(textResponse.status).toBe(400);
    expect(textResponse.body.error).toContain('文本文件超过 2 MB');
    expect(imageResponse.status).toBe(400);
    expect(imageResponse.body.error).toContain('图片超过 10 MB');
  });

  it('Given 未授权的相邻路径, When 预览, Then 返回 403', async () => {
    const response = await request(app).get('/api/files/preview').query({ projectId, path: siblingFile });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('不在当前项目');
  });

  it('Given 授权目录内的链接跳到外部, When 访问链接, Then realpath 后拒绝越界', async () => {
    const junction = path.join(attachedDir, 'escape-link');
    fs.symlinkSync(path.dirname(siblingFile), junction, process.platform === 'win32' ? 'junction' : 'dir');

    const response = await request(app).get('/api/files/preview').query({
      projectId,
      path: path.join(junction, path.basename(siblingFile)),
    });

    expect(response.status).toBe(403);
  });

  it('Given Flow 保存了外部链接, When 携带匹配 flowId, Then 仅该 Flow 可访问', async () => {
    const allowed = await request(app).get('/api/files/preview').query({ projectId, flowId: 'F001', path: linkedFile });
    const denied = await request(app).get('/api/files/preview').query({ projectId, flowId: 'F999', path: linkedFile });

    expect(allowed.status).toBe(200);
    expect(allowed.body.data.kind).toBe('external');
    expect(denied.status).toBe(403);
  });

  it('Given 离线附加路径仍在配置中, When 访问, Then 报不可用且不删除配置', async () => {
    const offline = path.join(testRoot, 'offline-drive');
    writeConfig({ attachedDirectories: [offline], attachedFiles: [] });

    const response = await request(app).get('/api/files/list').query({ projectId, path: offline });
    const saved = JSON.parse(fs.readFileSync(path.join(projectsDir, projectId, 'config.json'), 'utf-8'));

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('不存在或当前无法访问');
    expect(saved.attachedDirectories).toEqual([offline]);
  });

  it('Given 已授权文件, When 请求系统打开与定位, Then 只调用对应宿主动作', async () => {
    const open = await request(app).post('/api/files/open').send({ projectId, path: attachedFile });
    const reveal = await request(app).post('/api/files/reveal').send({ projectId, path: attachedFile });

    expect(open.status).toBe(200);
    expect(reveal.status).toBe(200);
    expect(openWithSystem).toHaveBeenCalledWith(fs.realpathSync.native(attachedFile));
    expect(revealInFileManager).toHaveBeenCalledWith(fs.realpathSync.native(attachedFile));
  });
});
