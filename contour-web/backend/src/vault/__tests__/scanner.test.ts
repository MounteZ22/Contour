import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanAllProjects } from '../scanner.js';

let testRoot: string;
let vaultsDir: string;
let projectDir: string;

beforeEach(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'contour-scanner-test-'));
  vaultsDir = path.join(testRoot, 'vaults');
  projectDir = path.join(vaultsDir, 'scanner-project');
  await fs.mkdir(path.join(projectDir, 'flows'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

describe('Flow 摘要兼容扫描', () => {
  it('旧 Flow 只有旧摘要文件时仍可读取摘要', async () => {
    const flowDir = await createFlow('F001_legacy', {
      legacySummary: '旧项目摘要仍然可读。',
      extraSection: '旧版额外 Section 内容。',
    });

    const flow = await readFlow('F001');

    expect(flow.summary).toBe('旧项目摘要仍然可读。');
    expect(flow.sections.map((section) => section.filename)).toEqual(['flow.md', 'extra.md']);
    expect(await fs.stat(path.join(flowDir, 'context_summary.md'))).toBeTruthy();
  });

  it('新摘要和旧摘要同时存在时优先读取新摘要', async () => {
    await createFlow('F002_both', {
      summary: '新标准摘要。',
      legacySummary: '不应覆盖新摘要。',
    });

    const flow = await readFlow('F002');

    expect(flow.summary).toBe('新标准摘要。');
  });

  it('旧版根目录 Section 扫描会排除两个摘要文件', async () => {
    await createFlow('F003_sections', {
      summary: '新摘要。',
      legacySummary: '旧摘要。',
      extraSection: '可识别的 Section。',
    });

    const flow = await readFlow('F003');

    expect(flow.sections.map((section) => section.filename)).not.toContain('flow_summary.md');
    expect(flow.sections.map((section) => section.filename)).not.toContain('context_summary.md');
    expect(flow.sections.map((section) => section.filename)).toContain('extra.md');
  });

  it('外部软链接内容不会进入扫描结果', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contour-scanner-outside-'));
    try {
      const outsideSummary = path.join(outsideDir, 'outside-summary.md');
      const outsideSection = path.join(outsideDir, 'outside-section.md');
      const outsideFlow = path.join(outsideDir, 'F099_external');
      await fs.mkdir(path.join(outsideFlow, 'sections'), { recursive: true });
      await fs.writeFile(outsideSummary, '# 外部摘要\n不应被读取。');
      await fs.writeFile(outsideSection, '# 外部 Section\n不应被读取。');
      await fs.writeFile(path.join(outsideFlow, 'flow.md'), flowMarkdown('F099', '外部 Flow'));
      await fs.writeFile(path.join(outsideFlow, 'sections', 'outside.md'), '# 外部 Section\n不应被读取。');

      const flowDir = await createFlow('F004_links');
      await fs.mkdir(path.join(flowDir, 'sections'));
      await fs.writeFile(path.join(flowDir, 'sections', 'flow.md'), '# 本地 Section\n本地内容。');
      const linkedMainDir = path.join(projectDir, 'flows', 'F098_linked-main');
      await fs.mkdir(linkedMainDir);
      const linkedSectionsFlowDir = await createFlow('F097_linked-sections');

      const canLinkSummary = await trySymlink(outsideSummary, path.join(flowDir, 'flow_summary.md'));
      const canLinkSection = await trySymlink(outsideSection, path.join(flowDir, 'sections', 'external.md'));
      const canLinkMain = await trySymlink(path.join(outsideFlow, 'flow.md'), path.join(linkedMainDir, 'flow.md'));
      const canLinkDirectory = await trySymlink(
        outsideFlow,
        path.join(projectDir, 'flows', 'F099_external'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const canLinkSectionsDirectory = await trySymlink(
        path.join(outsideFlow, 'sections'),
        path.join(linkedSectionsFlowDir, 'sections'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      if (!canLinkSummary || !canLinkSection || !canLinkMain || !canLinkDirectory || !canLinkSectionsDirectory) {
        // 某些 Windows 环境未开启创建软链接权限；兼容逻辑仍由其他 BDD 覆盖。
        return;
      }

      const flow = await readFlow('F004');
      const allFlows = (await scanAllProjects(vaultsDir, path.join(testRoot, 'missing-legacy')))
        .flatMap((project) => project.flows);

      expect(flow.summary).toBe('');
      expect(flow.sections.map((section) => section.filename)).not.toContain('external.md');
      expect(allFlows.some((candidate) => candidate.flowId === 'F099')).toBe(false);
      expect(allFlows.some((candidate) => candidate.flowId === 'F098')).toBe(false);
      expect(allFlows.find((candidate) => candidate.flowId === 'F097')?.sections)
        .toEqual([expect.objectContaining({ filename: 'flow.md' })]);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});

async function createFlow(
  directoryName: string,
  options: { summary?: string; legacySummary?: string; extraSection?: string } = {},
): Promise<string> {
  const flowDir = path.join(projectDir, 'flows', directoryName);
  await fs.mkdir(flowDir, { recursive: true });
  const flowId = directoryName.split('_')[0];
  await fs.writeFile(path.join(flowDir, 'flow.md'), flowMarkdown(flowId, `${flowId} 测试 Flow`));
  if (options.summary !== undefined) await fs.writeFile(path.join(flowDir, 'flow_summary.md'), `# 摘要\n${options.summary}`);
  if (options.legacySummary !== undefined) await fs.writeFile(path.join(flowDir, 'context_summary.md'), `# 摘要\n${options.legacySummary}`);
  if (options.extraSection !== undefined) await fs.writeFile(path.join(flowDir, 'extra.md'), `# 额外 Section\n${options.extraSection}`);
  return flowDir;
}

function flowMarkdown(flowId: string, title: string): string {
  return `---\nflow_id: ${flowId}\ntitle: ${title}\nstatus: in_progress\nstage: general\n---\n# ${title}\n`;
}

async function readFlow(flowId?: string) {
  const projects = await scanAllProjects(vaultsDir, path.join(testRoot, 'missing-legacy'));
  const flow = projects[0]?.flows.find((candidate) => candidate.flowId === (flowId || 'F001'));
  expect(flow).toBeDefined();
  return flow!;
}

async function trySymlink(target: string, linkPath: string, type?: 'file' | 'dir' | 'junction'): Promise<boolean> {
  try {
    await fs.symlink(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}
