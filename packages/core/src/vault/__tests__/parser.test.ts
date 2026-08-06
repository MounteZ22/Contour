import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseMarkdownFile, getString, getStringArray } from '../parser.js';

const testDir = path.join(os.tmpdir(), `contour-parser-test-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(testDir, { recursive: true });

  // 正常 frontmatter 文件
  await fs.writeFile(path.join(testDir, 'normal.md'), `---
title: 测试文档
status: in_progress
tags:
  - tag1
  - tag2
created: "2024-01-15"
---
# 测试文档

这是正文内容。
`);

  // 空文件
  await fs.writeFile(path.join(testDir, 'empty.md'), '');

  // 无 frontmatter 文件
  await fs.writeFile(path.join(testDir, 'no-frontmatter.md'), `# 无 Frontmatter 文档

只有正文内容，没有任何 frontmatter 声明。
`);

  // 嵌套 YAML 结构
  await fs.writeFile(path.join(testDir, 'nested-yaml.md'), `---
meta:
  author: 张三
  version: 2
  nested:
    key: value
    list:
      - a
      - b
title: 嵌套 YAML 测试
status: active
---
# 嵌套 YAML 测试

测试嵌套 YAML 解析的正文。
`);

  // 仅有分隔符无内容
  await fs.writeFile(path.join(testDir, 'empty-frontmatter.md'), `---
---
# 空 Frontmatter

仅有三条横线的分隔符。
`);

  // 标题从正文提取（无 title 字段）
  await fs.writeFile(path.join(testDir, 'title-from-body.md'), `---
status: draft
---
# 正文中的标题

这是从正文获取标题的测试。
`);
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('parseMarkdownFile', () => {
  it('应该正确解析带完整 frontmatter 的 markdown 文件', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'normal.md'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('测试文档');
    expect(result!.frontmatter).toHaveProperty('status', 'in_progress');
    expect(result!.frontmatter).toHaveProperty('tags');
    expect(result!.frontmatter.tags).toEqual(['tag1', 'tag2']);
    expect(result!.content).toContain('这是正文内容');
  });

  it('空文件应该能解析（返回空 frontmatter 和空内容）', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'empty.md'));
    expect(result).not.toBeNull();
    expect(result!.content).toBe('');
    expect(result!.frontmatter).toEqual({});
  });

  it('无 frontmatter 的文件应该正常解析', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'no-frontmatter.md'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('无 Frontmatter 文档');
    expect(result!.frontmatter).toEqual({});
    expect(result!.content).toContain('没有任何 frontmatter 声明');
  });

  it('应该正确解析嵌套 YAML 结构', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'nested-yaml.md'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('嵌套 YAML 测试');
    const meta = result!.frontmatter.meta as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect(meta.author).toBe('张三');
    expect(meta.nested).toEqual({ key: 'value', list: ['a', 'b'] });
  });

  it('空 frontmatter（只有 ---）应该容错处理', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'empty-frontmatter.md'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('空 Frontmatter');
  });

  it('无 title 字段时应该从正文标题提取', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'title-from-body.md'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('正文中的标题');
    expect(result!.frontmatter).toHaveProperty('status', 'draft');
  });

  it('不存在的文件应该返回 null', async () => {
    const result = await parseMarkdownFile(path.join(testDir, 'nonexistent.md'));
    expect(result).toBeNull();
  });

  it('正文无标题且 frontmatter 无 title 时 title 为空字符串', async () => {
    await fs.writeFile(path.join(testDir, 'no-title.md'), `---
status: note
---
没有标题行，只有普通正文。

继续写一些内容。
`);
    const result = await parseMarkdownFile(path.join(testDir, 'no-title.md'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('');
  });
});

describe('getString', () => {
  it('应该返回字符串值', () => {
    expect(getString({ key: 'value' }, 'key')).toBe('value');
  });

  it('数字值应该转换为字符串', () => {
    expect(getString({ count: 42 }, 'count')).toBe('42');
  });

  it('浮点数应该转换为字符串', () => {
    expect(getString({ pi: 3.14 }, 'pi')).toBe('3.14');
  });

  it('Date 值应该格式化为 YYYY-MM-DD', () => {
    const date = new Date('2024-06-15T08:30:00Z');
    expect(getString({ created: date }, 'created')).toBe('2024-06-15');
  });

  it('缺失的 key 应该返回 fallback 值', () => {
    expect(getString({}, 'missing', '默认值')).toBe('默认值');
  });

  it('缺失的 key 无 fallback 时应该返回空字符串', () => {
    expect(getString({}, 'missing')).toBe('');
  });

  it('null 值应该返回 fallback', () => {
    expect(getString({ key: null }, 'key', 'fallback')).toBe('fallback');
  });

  it('undefined 值应该返回 fallback', () => {
    expect(getString({ key: undefined }, 'key', 'fallback')).toBe('fallback');
  });

  it('布尔值应该返回 fallback', () => {
    expect(getString({ active: true }, 'active', 'no')).toBe('no');
  });
});

describe('getStringArray', () => {
  it('应该返回纯字符串数组', () => {
    expect(getStringArray({ tags: ['a', 'b', 'c'] }, 'tags')).toEqual(['a', 'b', 'c']);
  });

  it('应该过滤掉非字符串元素', () => {
    expect(getStringArray({ mixed: ['a', 123, 'b', true, null] }, 'mixed'))
      .toEqual(['a', 'b']);
  });

  it('空数组应该返回空数组', () => {
    expect(getStringArray({ tags: [] }, 'tags')).toEqual([]);
  });

  it('非数组值应该返回空数组', () => {
    expect(getStringArray({ tags: 'not-an-array' }, 'tags')).toEqual([]);
  });

  it('缺失的 key 应该返回空数组', () => {
    expect(getStringArray({}, 'missing')).toEqual([]);
  });

  it('undefined 值应该返回空数组', () => {
    expect(getStringArray({ tags: undefined }, 'tags')).toEqual([]);
  });
});
