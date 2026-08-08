import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createTestHostContext } from './test-host.js';

// ── 在导入被测模块之前 mock config ─────────────────────────────────────────
let testDir!: string;
let vaultsDir!: string;
let legacyDir!: string;

vi.mock('../../config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  testDir = join(tmpdir(), `contour-flows-test-${Date.now()}`);
  vaultsDir = join(testDir, 'vaults');
  legacyDir = join(testDir, 'legacy-vault');
  return {
    CONFIG: {
      PORT: 3001,
      VAULTS_DIR: vaultsDir,
      LEGACY_VAULT: legacyDir,
      CONFIG_DIR: testDir,
      CONFIG_FILE: path.join(testDir, 'settings.json'),
      IS_DEV: true,
      DATA_DIR: testDir,
      PROJECTS_DIR: path.join(testDir, 'projects'),
    },
  };
});

// 动态导入被测模块
await import('../../config.js');
const { createFlowsRouter } = await import('../flows.js');
const flowsRouter = createFlowsRouter(createTestHostContext({ dataDir: testDir, vaultsDir, legacyVault: legacyDir }));

// ── 创建 Express 应用 ──────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/flows', flowsRouter);

beforeAll(async () => {
  // 创建测试项目目录结构，使 scanner 能识别
  // VAULTS_DIR/
  //   test-project/
  //     flows/
  //       F001_existing-flow/
  //         flow.md
  //         sections/
  //           flow.md
  //         flow_summary.md
  //     background/
  //     claims/
  const projectDir = path.join(vaultsDir, 'test-project');
  const flowDir = path.join(projectDir, 'flows', 'F001_existing-flow');
  await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'background'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'claims'), { recursive: true });

  // 创建 flow.md（含完整 frontmatter）
  await fs.writeFile(path.join(flowDir, 'flow.md'), `---
flow_id: F001
title: 已有测试 Flow
status: in_progress
stage: general
created: "2024-01-01"
updated: "2024-01-15"
parent_flows: []
related_claims: []
related_assets: []
tags:
  - test
---
# F001 已有测试 Flow

这是一个已存在的 Flow 用于测试查询。
`);

  // 创建 sections/flow.md
  await fs.writeFile(path.join(flowDir, 'sections', 'flow.md'), `# F001 已有测试 Flow

## 1. Why this flow exists

测试目的。
`);

  // 创建 flow_summary.md
  await fs.writeFile(path.join(flowDir, 'flow_summary.md'), '# 摘要\n测试摘要内容。');

  // 创建第二个项目中的同名 Flow，用于验证写操作不会跨项目猜测目标。
  const collisionProjectDir = path.join(vaultsDir, 'collision-project');
  const collisionFlowDir = path.join(collisionProjectDir, 'flows', 'F001_collision-flow');
  await fs.mkdir(path.join(collisionFlowDir, 'sections'), { recursive: true });
  await fs.mkdir(path.join(collisionProjectDir, 'background'), { recursive: true });
  await fs.mkdir(path.join(collisionProjectDir, 'claims'), { recursive: true });
  await fs.writeFile(path.join(collisionFlowDir, 'flow.md'), `---
flow_id: F001
title: 第二项目的 F001
status: in_progress
stage: general
created: "2024-01-01"
updated: "2024-01-15"
---
# 第二项目的 F001
`);
  await fs.writeFile(path.join(collisionFlowDir, 'sections', 'flow.md'), '# 第二项目的 F001\n');
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Flows API', () => {
  // ── GET /api/flows ──────────────────────────────────────────────────────
  describe('GET /api/flows — 获取所有 Flow 列表', () => {
    it('应该返回成功响应', async () => {
      const res = await request(app).get('/api/flows');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.flows)).toBe(true);
    });

    it('返回的 flows 应该包含已有 Flow', async () => {
      const res = await request(app).get('/api/flows');
      const flows: Array<{ flowId: string; title: string; status: string }> = res.body.data.flows;
      const found = flows.find((f) => f.flowId === 'F001' && f.title === '已有测试 Flow');
      expect(found).toBeDefined();
      expect(found!.title).toBe('已有测试 Flow');
      expect(found!.status).toBe('in_progress');
    });

    it('列表项不应包含 sections 全文', async () => {
      const res = await request(app).get('/api/flows');
      const flows: Array<Record<string, unknown>> = res.body.data.flows;
      if (flows.length > 0) {
        expect(flows[0]).not.toHaveProperty('sections');
      }
    });
  });

  // ── GET /api/flows/:flowId ──────────────────────────────────────────────
  describe('GET /api/flows/:flowId — 获取单个 Flow', () => {
    it('应该返回指定 Flow 的完整信息', async () => {
      const res = await request(app).get('/api/flows/F001?projectId=test-project');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.flowId).toBe('F001');
      expect(res.body.data.title).toBe('已有测试 Flow');
      expect(Array.isArray(res.body.data.sections)).toBe(true);
    });

    it('不存在的 Flow 应该返回 404', async () => {
      const res = await request(app).get('/api/flows/F999');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Flow not found');
    });
  });

  // ── POST /api/flows ─────────────────────────────────────────────────────
  describe('POST /api/flows — 创建新 Flow', () => {
    it('应该成功创建新 Flow 并能在列表中查到', async () => {
      // 创建
      const createRes = await request(app)
        .post('/api/flows')
        .send({
          projectId: 'test-project',
          flowId: 'F002',
          title: '新测试流程',
          type: 'analysis',
          parentFlows: ['F001'],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.flowId).toBe('F002');

      // 创建后在列表中能查到（同一测试内，不依赖其他测试的数据）
      const listRes = await request(app).get('/api/flows');
      const flows: Array<{ flowId: string; title: string }> = listRes.body.data.flows;
      const found = flows.find((f) => f.flowId === 'F002');
      expect(found).toBeDefined();
      expect(found!.title).toBe('新测试流程');

      const createdFlowDir = (await fs.readdir(path.join(vaultsDir, 'test-project', 'flows')))
        .find((name) => name.startsWith('F002_'));
      expect(createdFlowDir).toBeDefined();
      const createdFlowPath = path.join(vaultsDir, 'test-project', 'flows', createdFlowDir!);
      await expect(fs.access(path.join(createdFlowPath, 'flow_summary.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(createdFlowPath, 'context_summary.md'))).rejects.toThrow();
    });

    it('缺少必填字段应该返回 400', async () => {
      const res = await request(app)
        .post('/api/flows')
        .send({ flowId: 'F003' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('无效的 flowId（含特殊字符）应该返回 400', async () => {
      const res = await request(app)
        .post('/api/flows')
        .send({
          projectId: 'test-project',
          flowId: 'invalid!',
          title: '无效 ID 测试',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid flowId');
    });

    it('不存在的 projectId 应该返回 404', async () => {
      const res = await request(app)
        .post('/api/flows')
        .send({
          projectId: 'nonexistent',
          flowId: 'F004',
          title: '不存在的项目',
        });
      expect(res.status).toBe(404);
    });
  });

  // ── PUT /api/flows/:flowId ──────────────────────────────────────────────
  describe('PUT /api/flows/:flowId — 更新 Flow 状态', () => {
    it('应该成功更新 Flow 状态，且更新后查询应反映新状态', async () => {
      // 更新
      const updateRes = await request(app)
        .put('/api/flows/F001')
        .send({ status: 'completed', projectId: 'test-project' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.status).toBe('completed');

      // 更新后查询应反映新状态（同一测试内验证）
      const getRes = await request(app).get('/api/flows/F001?projectId=test-project');
      expect(getRes.body.data.status).toBe('completed');
    });

    it('缺少 status 字段应该返回 400', async () => {
      const res = await request(app)
        .put('/api/flows/F001')
        .send({ projectId: 'test-project' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status is required');
    });

    it('不存在的 Flow 应该返回 404', async () => {
      const res = await request(app)
        .put('/api/flows/F999')
        .send({ status: 'completed', projectId: 'test-project' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/flows/:flowId ───────────────────────────────────────────
  describe('DELETE /api/flows/:flowId — 删除 Flow', () => {
    it('应该成功删除 Flow', async () => {
      // 先创建独立数据，不依赖其他测试
      await request(app)
        .post('/api/flows')
        .send({ projectId: 'test-project', flowId: 'F002_DEL', title: '待删除的 Flow' });

      const res = await request(app)
        .delete('/api/flows/F002_DEL')
        .query({ projectId: 'test-project' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('删除后查询应返回 404', async () => {
      // 创建一个临时 flow 然后删除
      await request(app)
        .post('/api/flows')
        .send({ projectId: 'test-project', flowId: 'F005', title: '待删除' });

      await request(app)
        .delete('/api/flows/F005')
        .query({ projectId: 'test-project' });

      const res = await request(app).get('/api/flows/F005');
      expect(res.status).toBe(404);
    });

    it('不存在的 Flow 应该返回 404', async () => {
      const res = await request(app).delete('/api/flows/F999').query({ projectId: 'test-project' });
      expect(res.status).toBe(404);
    });
  });

  // ── Flow Position ───────────────────────────────────────────────────────
  describe('PUT /api/flows/:flowId/position — 更新 Flow 位置', () => {
    it('应该成功更新 Flow 位置坐标', async () => {
      const res = await request(app)
        .put('/api/flows/F001/position')
        .send({ x: 100, y: 200, projectId: 'test-project' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.x).toBe(100);
      expect(res.body.data.y).toBe(200);
    });

    it('缺少坐标应该返回 400', async () => {
      const res = await request(app)
        .put('/api/flows/F001/position')
        .send({ x: 100, projectId: 'test-project' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('x and y coordinates');
    });
  });

  describe('多项目同名 Flow 的写操作隔离', () => {
    it('缺少 projectId 的所有写操作都应拒绝，而不是猜测项目', async () => {
      const responses = await Promise.all([
        request(app).put('/api/flows/F001').send({ status: 'completed' }),
        request(app).delete('/api/flows/F001'),
        request(app).delete('/api/flows/F001/sections/flow'),
        request(app).post('/api/flows/F001/sections').send({ sectionId: 'new_section', title: '新 Section' }),
        request(app).put('/api/flows/F001/sections/flow').send({ content: '不应写入' }),
        request(app).put('/api/flows/F001/position').send({ x: 1, y: 2 }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 400]);
    });

    it('提供 projectId 时只更新或删除指定项目的同名 Flow', async () => {
      const primaryBefore = await request(app).get('/api/flows/F001?projectId=test-project');
      const collisionBefore = await request(app).get('/api/flows/F001?projectId=collision-project');
      expect(primaryBefore.status).toBe(200);
      expect(collisionBefore.status).toBe(200);

      const update = await request(app)
        .put('/api/flows/F001')
        .send({ status: 'completed', projectId: 'collision-project' });
      expect(update.status).toBe(200);

      const primaryAfterUpdate = await request(app).get('/api/flows/F001?projectId=test-project');
      const collisionAfterUpdate = await request(app).get('/api/flows/F001?projectId=collision-project');
      expect(primaryAfterUpdate.body.data.status).toBe(primaryBefore.body.data.status);
      expect(collisionAfterUpdate.body.data.status).toBe('completed');

      const deleteWithoutProject = await request(app).delete('/api/flows/F001');
      expect(deleteWithoutProject.status).toBe(400);

      const deleteCollision = await request(app)
        .delete('/api/flows/F001')
        .query({ projectId: 'collision-project' });
      expect(deleteCollision.status).toBe(200);

      const primaryAfterDelete = await request(app).get('/api/flows/F001?projectId=test-project');
      const collisionAfterDelete = await request(app).get('/api/flows/F001?projectId=collision-project');
      expect(primaryAfterDelete.status).toBe(200);
      expect(collisionAfterDelete.status).toBe(404);
    });
  });

  describe('Section 与坏 frontmatter 的数据保护', () => {
    it('重复创建 Section 返回 409，且主 flow Section 不能删除', async () => {
      const first = await request(app).post('/api/flows/F001/sections').send({
        projectId: 'test-project', sectionId: 'duplicate_guard', title: '只创建一次',
      });
      const second = await request(app).post('/api/flows/F001/sections').send({
        projectId: 'test-project', sectionId: 'duplicate_guard', title: '不应覆盖',
      });
      const removeMain = await request(app)
        .delete('/api/flows/F001/sections/flow')
        .query({ projectId: 'test-project' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);
      expect(removeMain.status).toBe(400);
      await expect(fs.stat(path.join(vaultsDir, 'test-project', 'flows', 'F001_existing-flow', 'sections', 'flow.md')))
        .resolves.toBeDefined();
    });

    it('CRLF Section 更新后仍保留 frontmatter 元数据', async () => {
      const sectionPath = path.join(
        vaultsDir, 'test-project', 'flows', 'F001_existing-flow', 'sections', 'crlf.md',
      );
      await fs.writeFile(sectionPath, '---\r\nsection_id: crlf\r\ntitle: CRLF\r\n---\r\n# old\r\n');

      const response = await request(app).put('/api/flows/F001/sections/crlf').send({
        projectId: 'test-project', content: '# new\n正文',
      });
      const saved = await fs.readFile(sectionPath, 'utf-8');

      expect(response.status).toBe(200);
      expect(saved).toContain('section_id: crlf');
      expect(saved).toContain('# new');
    });

    it('坏 frontmatter 更新状态或位置时返回 422 而不伪装成功', async () => {
      await request(app).post('/api/flows').send({
        projectId: 'test-project', flowId: 'F_BAD_YAML', title: '坏格式保护',
      });
      const flowRoot = path.join(vaultsDir, 'test-project', 'flows');
      const createdDir = (await fs.readdir(flowRoot)).find((entry) => entry.startsWith('F_BAD_YAML_'))!;
      await fs.writeFile(path.join(flowRoot, createdDir, 'flow.md'), '---\nbroken: [\n---\n# bad\n');

      const status = await request(app).put('/api/flows/F_BAD_YAML').send({
        projectId: 'test-project', status: 'completed',
      });
      const position = await request(app).put('/api/flows/F_BAD_YAML/position').send({
        projectId: 'test-project', x: 1, y: 2,
      });

      expect(status.status).toBe(422);
      expect(position.status).toBe(422);
    });
  });
});
