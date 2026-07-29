import { describe, expect, it, vi } from 'vitest';
import {
  findFlowEntry,
  getBinaryPreviewKind,
  getFileContentUrl,
  getFileOpenStrategy,
  listDirectory,
  openFile,
} from './fileBrowser';

describe('文件查看器策略', () => {
  it('文本、图片、PDF 与 XLSX 在 Contour 内预览，旧版 Office、CSV 与未知格式交给系统程序', () => {
    expect(getFileOpenStrategy('notes.md')).toBe('preview');
    expect(getFileOpenStrategy('figure.PNG')).toBe('preview');
    expect(getFileOpenStrategy('table.csv')).toBe('system');
    expect(getFileOpenStrategy('paper.pdf')).toBe('preview');
    expect(getFileOpenStrategy('table.xlsx')).toBe('preview');
    expect(getFileOpenStrategy('legacy.xls')).toBe('system');
    expect(getFileOpenStrategy('report.docx')).toBe('system');
    expect(getFileOpenStrategy('sample.bin')).toBe('system');
  });

  it('PDF/XLSX 内容请求只从受控文件 API 生成，并保留 Flow 授权上下文', () => {
    expect(getBinaryPreviewKind('paper.PDF')).toBe('pdf');
    expect(getBinaryPreviewKind('table.xlsx')).toBe('xlsx');
    expect(getBinaryPreviewKind('legacy.xls')).toBeUndefined();
    expect(getFileContentUrl('PRJ_001', '资料/paper.pdf', 'F001')).toContain(
      'projectId=PRJ_001&path=%E8%B5%84%E6%96%99%2Fpaper.pdf&flowId=F001',
    );
  });

  it('Flow 链接的目录和系统打开请求始终携带 flowId', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await listDirectory('PRJ_001', 'D:\\linked', 'F001');
    await openFile('PRJ_001', 'D:\\linked\\paper.pdf', 'F001');

    expect(fetchMock.mock.calls[0][0]).toContain('flowId=F001');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      projectId: 'PRJ_001',
      path: 'D:\\linked\\paper.pdf',
      flowId: 'F001',
    });
  });
});

describe('Flow 目录定位', () => {
  it('只匹配完整 Flow ID 边界，F001 不会误匹配 F0010', () => {
    const entries = [
      { name: 'F0010_另一个 Flow', path: 'D:\\vault\\flows\\F0010_另一个 Flow', kind: 'directory' as const },
      { name: 'F001_目标 Flow', path: 'D:\\vault\\flows\\F001_目标 Flow', kind: 'directory' as const },
    ];

    expect(findFlowEntry(entries, 'F001')?.name).toBe('F001_目标 Flow');
  });

  it('兼容旧格式的 Flow 裸 Markdown 文件', () => {
    const entries = [
      { name: 'F001.md', path: 'D:\\vault\\flows\\F001.md', kind: 'file' as const },
    ];

    expect(findFlowEntry(entries, 'F001')?.path).toBe('D:\\vault\\flows\\F001.md');
  });
});
