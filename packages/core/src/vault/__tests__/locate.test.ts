import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// ── 在导入被测模块之前 mock config ─────────────────────────────────────────
// 使用异步 factory，内部用动态 import 获取 os/path
let testDir: string;
let vaultsDir: string;
let legacyDir: string;

vi.mock('../../runtime/config.js', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  testDir = join(tmpdir(), `contour-locate-test-${Date.now()}`);
  vaultsDir = join(testDir, 'vaults');
  legacyDir = join(testDir, 'legacy-vault');
  return {
    CONFIG: { CONFIG_DIR: testDir, DATA_DIR: testDir, PROJECTS_DIR: testDir, 
      VAULTS_DIR: vaultsDir,
      LEGACY_VAULT: legacyDir,
    },
  };
});

// 动态导入被测模块（在 mock 生效后）
const locateModule = await import('../locate.js');
const {
  extractFrontmatterText,
  findProjectDir,
  findProjectDirForFlow,
  findProjectDirForDoc,
  findProjectDirForClaim,
} = locateModule;

beforeAll(async () => {
  // 创建测试 vault 结构
  // VAULTS_DIR/
  //   project-alpha/
  //     flows/
  //       F001_test-flow/
  //         flow.md
  //     background/
  //       doc-01.md
  //     claims/
  //       claim-01.md
  const projectDir = path.join(vaultsDir, 'project-alpha');
  await fs.mkdir(path.join(projectDir, 'flows', 'F001_test-flow'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'background'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'claims'), { recursive: true });

  // 创建一个 flow 的 flow.md 文件使扫描器能识别
  await fs.writeFile(path.join(projectDir, 'flows', 'F001_test-flow', 'flow.md'), `---
flow_id: F001
title: 测试 Flow
status: in_progress
---
# F001 测试 Flow
`);

  // 创建 background 文档
  await fs.writeFile(path.join(projectDir, 'background', 'doc-01.md'), `---
title: 测试文档
---
# 测试文档
内容
`);

  // 创建 claim 文档
  await fs.writeFile(path.join(projectDir, 'claims', 'claim-01.md'), `---
claim_id: claim-01
title: 测试声明
confidence: medium
---
# 测试声明
内容
`);
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('extractFrontmatterText', () => {
  it('应该提取 frontmatter 的 YAML 文本', () => {
    const raw = `---
title: 测试
status: active
---
# 正文
`;
    const result = extractFrontmatterText(raw);
    expect(result).toBe('title: 测试\nstatus: active');
  });

  it('无 frontmatter 时应该返回 null', () => {
    const raw = '# 只有正文\n没有 frontmatter';
    expect(extractFrontmatterText(raw)).toBeNull();
  });

  it('frontmatter 分隔符不完整时应该返回 null（只有开头）', () => {
    const raw = `---
title: 未闭合
前面有 --- 但后面没有闭合`;
    expect(extractFrontmatterText(raw)).toBeNull();
  });
});

describe('findProjectDir', () => {
  it('应该找到已存在的项目目录', async () => {
    const dir = await findProjectDir('project-alpha');
    expect(dir).not.toBeNull();
    expect(dir).toBe(path.join(vaultsDir, 'project-alpha'));
  });

  it('不存在的项目应该返回 null', async () => {
    const dir = await findProjectDir('nonexistent-project');
    expect(dir).toBeNull();
  });
});

describe('findProjectDirForFlow', () => {
  it('应该找到包含指定 flow 的项目目录', async () => {
    const dir = await findProjectDirForFlow('F001');
    expect(dir).not.toBeNull();
    expect(dir).toBe(path.join(vaultsDir, 'project-alpha'));
  });

  it('不存在的 flow 应该返回 null', async () => {
    const dir = await findProjectDirForFlow('F999');
    expect(dir).toBeNull();
  });
});

describe('findProjectDirForDoc', () => {
  it('应该找到包含指定文档的项目目录', async () => {
    const dir = await findProjectDirForDoc('doc-01');
    expect(dir).not.toBeNull();
    expect(dir).toBe(path.join(vaultsDir, 'project-alpha'));
  });

  it('不存在的文档应该返回 null', async () => {
    const dir = await findProjectDirForDoc('doc-999');
    expect(dir).toBeNull();
  });
});

describe('findProjectDirForClaim', () => {
  it('应该找到包含指定 claim 的项目目录', async () => {
    const dir = await findProjectDirForClaim('claim-01');
    expect(dir).not.toBeNull();
    expect(dir).toBe(path.join(vaultsDir, 'project-alpha'));
  });

  it('不存在的 claim 应该返回 null', async () => {
    const dir = await findProjectDirForClaim('claim-999');
    expect(dir).toBeNull();
  });
});
