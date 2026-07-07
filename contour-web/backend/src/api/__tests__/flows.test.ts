import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import request from 'supertest';

// ── 在导入被测模块之前 mock config ─────────────────────────────────────────
const { testDir, vaultsDir, legacyDir } = vi.hoisted(() => {
  const tmp = os.tmpdir();
  const base = path.join(tmp, `contour-flows-test-${Date.now()}`);
  return {
    testDir: base,
    vaultsDir: path.join(base, 'vaults'),
    legacyDir: path.join(base, 'legacy-vault'),
  };
});

vi.mock('../../config.js', () => ({
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
}));

// 动态导入被测模块
const flowsRouter = (await import('../flows.js')).default;

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
  //         context_summary.md
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

  // 创建 context_summary.md
  await fs.writeFile(path.join(flowDir, 'context_summary.md'), '# 摘要\n测试摘要内容。');
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
      const flows: Array<{ flowId: string }> = res.body.data.flows;
      const found = flows.find((f) => f.flowId === 'F001');
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
    it('应该成功创建新 Flow 并返回 201', async () => {
      const res = await request(app)
        .post('/api/flows')
        .send({
          projectId: 'test-project',
          flowId: 'F002',
          title: '新测试流程',
          type: 'analysis',
          parentFlows: ['F001'],
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.flowId).toBe('F002');
    });

    it('创建后应该能在列表中查到', async () => {
      const res = await request(app).get('/api/flows');
      const flows: Array<{ flowId: string }> = res.body.data.flows;
      const found = flows.find((f) => f.flowId === 'F002');
      expect(found).toBeDefined();
      expect(found!.title).toBe('新测试流程');
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
    it('应该成功更新 Flow 状态', async () => {
      const res = await request(app)
        .put('/api/flows/F001')
        .send({ status: 'completed', projectId: 'test-project' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
    });

    it('更新后查询应反映新状态', async () => {
      const res = await request(app).get('/api/flows/F001?projectId=test-project');
      expect(res.body.data.status).toBe('completed');
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
        .send({ status: 'completed' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/flows/:flowId ───────────────────────────────────────────
  describe('DELETE /api/flows/:flowId — 删除 Flow', () => {
    it('应该成功删除 Flow', async () => {
      const res = await request(app)
        .delete('/api/flows/F002')
        .query({ projectId: 'test-project' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('删除后查询应返回 404', async () => {
      // 需要先确保有可删除的 flow
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
      const res = await request(app).delete('/api/flows/F999');
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
});
