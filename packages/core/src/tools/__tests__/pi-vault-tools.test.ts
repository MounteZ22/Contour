import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import os from 'node:os';
import { createCoreServices } from '../../services/core-services.js';

const testRoot = path.join(os.tmpdir(), `contour-vault-tools-${Date.now()}`);
const vaultsDir = path.join(testRoot, 'vaults');
const legacyDir = path.join(testRoot, 'legacy');
const core = createCoreServices({ dataDir: path.join(testRoot, 'data'), projectsDir: path.join(testRoot, 'data', 'projects'), vaultsDir, legacyVault: legacyDir, isDevelopment: true });

const { createContourCustomTools } = await import('../pi-vault-tools.js');

async function createProject(projectId: string, marker: string): Promise<void> {
  const root = path.join(vaultsDir, projectId);
  const flowDir = path.join(root, 'flows', 'F001_test');
  await fs.mkdir(path.join(flowDir, 'sections'), { recursive: true });
  await fs.mkdir(path.join(root, 'background'), { recursive: true });
  await fs.writeFile(path.join(flowDir, 'flow.md'), `---\nflow_id: F001\ntitle: ${marker}\nstatus: in_progress\nlinks: []\n---\n# ${marker}\n`);
  await fs.writeFile(path.join(flowDir, 'sections', 'main.md'), `# Main\n${marker} flow content`);
  await fs.writeFile(path.join(root, 'background', 'shared.md'), `---\ntitle: ${marker} doc\n---\n# ${marker} doc\n${marker} doc content`);
}

function findTool(projectId: string, name: string) {
  return core.tools.createContourCustomTools(projectId).find((item) => item.name === name)! as {
    execute: (...args: any[]) => Promise<{ content: Array<{ text: string }> }>;
  };
}

beforeAll(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
  await createProject('project-a', 'Project A');
  await createProject('project-b', 'Project B');
});

afterAll(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

describe('Contour Agent 业务工具项目隔离', () => {
  it('Given 两个项目有同名 Flow, When 项目 A 获取详情, Then 只返回项目 A', async () => {
    const result = await findTool('project-a', 'getFlowDetail').execute('1', { flowId: 'F001' });
    expect(result.content[0].text).toContain('Project A flow content');
    expect(result.content[0].text).not.toContain('Project B');
  });

  it('Given 两个项目有同名 Doc, When 项目 B 获取文档, Then 只返回项目 B', async () => {
    const result = await findTool('project-b', 'getDoc').execute('1', { docId: 'shared' });
    expect(result.content[0].text).toContain('Project B doc content');
    expect(result.content[0].text).not.toContain('Project A');
  });

  it('Given 搜索词只存在另一个项目, When 当前项目搜索, Then 不泄露另一个项目结果', async () => {
    const result = await findTool('project-a', 'searchFlows').execute('1', { query: 'Project B' });
    expect(JSON.parse(result.content[0].text).results).toEqual([]);
  });
});

