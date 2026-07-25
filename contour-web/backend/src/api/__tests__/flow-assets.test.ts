import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { parseFrontmatter } from '../../vault/yaml-utils.js';

let testDir: string;
let vaultsDir: string;
let legacyDir: string;
let projectDir: string;
let externalFile: string;

vi.mock('../../config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  testDir = join(tmpdir(), `contour-flow-assets-test-${Date.now()}`);
  vaultsDir = join(testDir, 'vaults');
  legacyDir = join(testDir, 'legacy-vault');
  return {
    CONFIG: {
      PORT: 3001,
      VAULTS_DIR: vaultsDir,
      LEGACY_VAULT: legacyDir,
      CONFIG_DIR: testDir,
      CONFIG_FILE: join(testDir, 'settings.json'),
      IS_DEV: true,
      DATA_DIR: testDir,
      PROJECTS_DIR: join(testDir, 'projects'),
    },
  };
});

const flowsRouter = (await import('../flows.js')).default;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/flows', flowsRouter);

async function writeDirectoryFlow(flowId: string, frontmatter = ''): Promise<string> {
  const flowDir = path.join(projectDir, 'flows', `${flowId}_test-flow`);
  await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });
  await fs.writeFile(path.join(flowDir, 'flow.md'), `---
flow_id: ${flowId}
title: ${flowId} 测试 Flow
status: in_progress
stage: general
created: "2026-01-01"
updated: "2026-01-01"
parent_flows: []
related_claims: []
tags: []
${frontmatter}---
# ${flowId} 测试 Flow

正文必须保留。
`);
  await fs.writeFile(path.join(flowDir, 'sections', 'flow.md'), `# ${flowId} 测试 Flow\n`);
    await fs.writeFile(path.join(flowDir, 'flow_summary.md'), '');
  return flowDir;
}

beforeAll(async () => {
  projectDir = path.join(vaultsDir, 'test-project');
  externalFile = path.join(testDir, '外部资料', 'data #1.xlsx');
  await fs.mkdir(path.join(projectDir, 'flows'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'background'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'claims'), { recursive: true });

  const flowDir = await writeDirectoryFlow('F001', `links:
  - path: ${JSON.stringify(externalFile)}
    label: "原始数据: #1"
  - path: "缺少名称"
  - invalid
`);
  await fs.mkdir(path.join(flowDir, 'attachments', 'nested'), { recursive: true });
  await fs.writeFile(path.join(flowDir, 'attachments', '.contour-tmp-leftover'), 'temp');

  await writeDirectoryFlow('F003');
  await fs.writeFile(path.join(projectDir, 'flows', 'F000_legacy.md'), `---
flow_id: F000
title: 裸文件旧 Flow
status: completed
links: []
---
# 裸文件旧 Flow

旧正文。
`);
  await fs.writeFile(path.join(projectDir, 'flows', 'F001_duplicate.md'), `---
flow_id: F001
title: 不应覆盖目录版
status: completed
---
# 不应覆盖目录版
`);

  const crlfDir = await writeDirectoryFlow('F005');
  const crlfRaw = await fs.readFile(path.join(crlfDir, 'flow.md'), 'utf-8');
  await fs.writeFile(path.join(crlfDir, 'flow.md'), crlfRaw.replace(/\n/g, '\r\n'));

  const linkedFlowDir = await writeDirectoryFlow('F004');
  const outsideAttachments = path.join(testDir, 'outside-attachments');
  await fs.mkdir(outsideAttachments, { recursive: true });
  await fs.symlink(
    outsideAttachments,
    path.join(linkedFlowDir, 'attachments'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  const collisionProject = path.join(vaultsDir, 'collision-project');
  await fs.mkdir(path.join(collisionProject, 'flows', 'F0010_only'), { recursive: true });
  await fs.mkdir(path.join(collisionProject, 'background'), { recursive: true });
  await fs.mkdir(path.join(collisionProject, 'claims'), { recursive: true });
  await fs.writeFile(path.join(collisionProject, 'flows', 'F0010_only', 'flow.md'), `---
flow_id: F0010
title: F0010
status: in_progress
---
# F0010
`);
    await fs.writeFile(path.join(collisionProject, 'flows', 'F0010_only', 'flow_summary.md'), '');
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Flow 附件与链接', () => {
  it('Given 旧 Flow 没有新字段或附件目录, When 读取, Then 返回空数组且不改磁盘', async () => {
    const response = await request(app).get('/api/flows/F003?projectId=test-project');

    expect(response.status).toBe(200);
    expect(response.body.data.attachments).toEqual([]);
    expect(response.body.data.links).toEqual([]);
    await expect(fs.stat(path.join(projectDir, 'flows', 'F003_test-flow', 'attachments'))).rejects.toThrow();
  });

  it('Given 裸 Markdown 旧 Flow, When 读取, Then 仍能作为只读 Flow 返回', async () => {
    const response = await request(app).get('/api/flows/F000?projectId=test-project');

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('裸文件旧 Flow');
    expect(response.body.data.attachments).toEqual([]);
    expect(response.body.data.sections[0].content).toContain('旧正文');
  });

  it('Given 附件目录混有隐藏文件和子目录, When 读取, Then 只列普通可见文件', async () => {
    const response = await request(app).get('/api/flows/F001?projectId=test-project');

    expect(response.body.data.attachments).toEqual([]);
    expect(response.body.data.title).toBe('F001 测试 Flow');
    expect(response.body.data.links).toEqual([{ path: externalFile, label: '原始数据: #1' }]);
  });

  it('Given attachments 被替换为目录链接, When 扫描或上传, Then 不跟随链接访问外部目录', async () => {
    const detail = await request(app).get('/api/flows/F004?projectId=test-project');
    const upload = await request(app)
      .post('/api/flows/F004/attachments')
      .send({ projectId: 'test-project', filename: 'escaped.txt', contentBase64: 'eA==' });

    expect(detail.status).toBe(200);
    expect(detail.body.data.attachments).toEqual([]);
    expect(upload.status).toBe(400);
    await expect(fs.stat(path.join(testDir, 'outside-attachments', 'escaped.txt'))).rejects.toThrow();
  });

  it('Given 带越界字符的标题, When 创建 Flow, Then 只在项目 flows 目录内创建并含 attachments', async () => {
    const response = await request(app)
      .post('/api/flows')
      .send({ projectId: 'test-project', flowId: 'F002', title: '../../escaped' });

    expect(response.status).toBe(201);
    const entries = await fs.readdir(path.join(projectDir, 'flows'));
    const createdDir = entries.find((entry) => entry.startsWith('F002_'));
    expect(createdDir).toBeDefined();
    expect(path.relative(path.join(projectDir, 'flows'), path.join(projectDir, 'flows', createdDir!))).not.toMatch(/^\.\./);
    await expect(fs.stat(path.join(projectDir, 'flows', createdDir!, 'attachments')))
      .resolves.toMatchObject({ isDirectory: expect.any(Function) });

    const detail = await request(app).get('/api/flows/F002?projectId=test-project');
    expect(detail.body.data.attachments).toEqual([]);
    expect(detail.body.data.links).toEqual([]);
  });

  it('Given 一个小型二进制文件, When 上传, Then 原始字节写入附件并立即出现在详情中', async () => {
    const bytes = Buffer.from([0, 1, 2, 127, 128, 255]);
    const upload = await request(app)
      .post('/api/flows/F001/attachments')
      .send({ projectId: 'test-project', filename: '实验数据.bin', contentBase64: bytes.toString('base64') });

    expect(upload.status).toBe(201);
    expect(upload.body.data.attachments).toContain('实验数据.bin');
    await expect(fs.readFile(path.join(projectDir, 'flows', 'F001_test-flow', 'attachments', '实验数据.bin')))
      .resolves.toEqual(bytes);

    const detail = await request(app).get('/api/flows/F001?projectId=test-project');
    expect(detail.body.data.attachments).toContain('实验数据.bin');
  });

  it('Given 同名附件已存在, When 再次上传, Then 返回冲突且不覆盖原文件', async () => {
    const original = Buffer.from('original');
    const first = await request(app)
      .post('/api/flows/F003/attachments')
      .send({ projectId: 'test-project', filename: 'same.txt', contentBase64: original.toString('base64') });
    const second = await request(app)
      .post('/api/flows/F003/attachments')
      .send({ projectId: 'test-project', filename: 'same.txt', contentBase64: Buffer.from('changed').toString('base64') });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    await expect(fs.readFile(path.join(projectDir, 'flows', 'F003_test-flow', 'attachments', 'same.txt')))
      .resolves.toEqual(original);
  });

  it('Given 两个同名附件同时上传, When 并发写入, Then 仅一个成功且不会相互覆盖', async () => {
    const firstBytes = Buffer.from('first-race');
    const secondBytes = Buffer.from('second-race');
    const [first, second] = await Promise.all([
      request(app).post('/api/flows/F003/attachments').send({
        projectId: 'test-project', filename: 'race.bin', contentBase64: firstBytes.toString('base64'),
      }),
      request(app).post('/api/flows/F003/attachments').send({
        projectId: 'test-project', filename: 'race.bin', contentBase64: secondBytes.toString('base64'),
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const saved = await fs.readFile(path.join(projectDir, 'flows', 'F003_test-flow', 'attachments', 'race.bin'));
    expect([firstBytes, secondBytes].some((candidate) => candidate.equals(saved))).toBe(true);
  });

  it.each(['../escape.txt', 'subdir/file.txt', 'C:\\absolute.txt', 'CON.txt']) (
    'Given 不安全文件名 %s, When 上传, Then 拒绝且不会越界写入',
    async (filename) => {
      const response = await request(app)
        .post('/api/flows/F001/attachments')
        .send({ projectId: 'test-project', filename, contentBase64: 'dGVzdA==' });
      expect(response.status).toBe(400);
    },
  );

  it('Given 非法或超大 base64, When 上传, Then 在写文件前拒绝', async () => {
    const invalid = await request(app)
      .post('/api/flows/F001/attachments')
      .send({ projectId: 'test-project', filename: 'invalid.bin', contentBase64: 'not-base64' });
    const tooLarge = await request(app)
      .post('/api/flows/F001/attachments')
      .send({
        projectId: 'test-project',
        filename: 'large.bin',
        contentBase64: Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64'),
      });

    expect(invalid.status).toBe(400);
    expect(tooLarge.status).toBe(400);
  });

  it('Given 已上传附件, When 删除两次, Then 两次都成功且文件保持不存在', async () => {
    const first = await request(app)
      .delete(`/api/flows/F001/attachments/${encodeURIComponent('实验数据.bin')}`)
      .query({ projectId: 'test-project' });
    const second = await request(app)
      .delete(`/api/flows/F001/attachments/${encodeURIComponent('实验数据.bin')}`)
      .query({ projectId: 'test-project' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.attachments).not.toContain('实验数据.bin');
  });

  it('Given 含特殊字符的链接, When 添加并更新标签, Then YAML 保持结构且正文不丢失', async () => {
    const linkPath = path.join(testDir, '资料', '结果: #2.xlsx');
    const create = await request(app)
      .post('/api/flows/F003/links')
      .send({ projectId: 'test-project', path: linkPath, label: '结果: #2' });
    const update = await request(app)
      .post('/api/flows/F003/links')
      .send({ projectId: 'test-project', path: linkPath, label: '更新后的名称' });

    expect(create.status).toBe(201);
    expect(update.status).toBe(200);
    expect(update.body.data.links).toEqual([{ path: path.normalize(linkPath), label: '更新后的名称' }]);

    const raw = await fs.readFile(path.join(projectDir, 'flows', 'F003_test-flow', 'flow.md'), 'utf-8');
    const parsed = parseFrontmatter(raw);
    expect(parsed?.fm.links).toEqual([{ path: path.normalize(linkPath), label: '更新后的名称' }]);
    expect(parsed?.body).toContain('正文必须保留');
  });

  it('Given 两个不同链接同时添加, When 并发写入, Then 两个链接都被保留', async () => {
    const firstPath = path.join(testDir, '资料', 'parallel-a.xlsx');
    const secondPath = path.join(testDir, '资料', 'parallel-b.xlsx');
    const [first, second] = await Promise.all([
      request(app).post('/api/flows/F001/links').send({ projectId: 'test-project', path: firstPath, label: 'A' }),
      request(app).post('/api/flows/F001/links').send({ projectId: 'test-project', path: secondPath, label: 'B' }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const detail = await request(app).get('/api/flows/F001?projectId=test-project');
    expect(detail.body.data.links).toEqual(expect.arrayContaining([
      { path: path.normalize(firstPath), label: 'A' },
      { path: path.normalize(secondPath), label: 'B' },
    ]));
  });

  it('Given CRLF 格式的 flow.md, When 添加链接, Then 仍可安全解析和写入', async () => {
    const linkPath = path.join(testDir, '资料', 'crlf.pdf');
    const response = await request(app)
      .post('/api/flows/F005/links')
      .send({ projectId: 'test-project', path: linkPath, label: 'CRLF 资料' });

    expect(response.status).toBe(201);
    expect(response.body.data.links).toEqual([{ path: path.normalize(linkPath), label: 'CRLF 资料' }]);
  });

  it('Given 一个链接, When 移除两次, Then 两次都成功且链接保持不存在', async () => {
    const linkPath = path.join(testDir, '资料', '结果: #2.xlsx');
    const first = await request(app)
      .delete('/api/flows/F003/links')
      .send({ projectId: 'test-project', path: linkPath });
    const second = await request(app)
      .delete('/api/flows/F003/links')
      .send({ projectId: 'test-project', path: linkPath });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.links).toEqual([]);
  });

  it('Given 相对链接或坏 frontmatter, When 写链接, Then 返回明确错误且不伪装成功', async () => {
    const relative = await request(app)
      .post('/api/flows/F003/links')
      .send({ projectId: 'test-project', path: 'relative/file.xlsx', label: '相对路径' });
    const malformedDir = await writeDirectoryFlow('F009');
    await fs.writeFile(path.join(malformedDir, 'flow.md'), '---\nbroken: [\n---\n# bad\n');
    const malformed = await request(app)
      .post('/api/flows/F009/links')
      .send({ projectId: 'test-project', path: externalFile, label: '坏 YAML' });

    expect(relative.status).toBe(400);
    expect(malformed.status).toBe(422);
  });

  it('Given 只有 F0010 或错误项目, When 写 F001, Then 不会误命中其他 Flow', async () => {
    const prefixCollision = await request(app)
      .post('/api/flows/F001/attachments')
      .send({ projectId: 'collision-project', filename: 'x.txt', contentBase64: 'eA==' });
    const wrongProject = await request(app)
      .post('/api/flows/F001/attachments')
      .send({ projectId: 'missing-project', filename: 'x.txt', contentBase64: 'eA==' });
    const traversalProject = await request(app)
      .post('/api/flows/F001/attachments')
      .send({ projectId: '../test-project', filename: 'x.txt', contentBase64: 'eA==' });

    expect(prefixCollision.status).toBe(404);
    expect(wrongProject.status).toBe(404);
    expect(traversalProject.status).toBe(400);
  });
});
