import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFlowLink,
  deleteFlowAttachment,
  MAX_FLOW_ATTACHMENT_BYTES,
  removeFlowLink,
  uploadFlowAttachment,
} from './flowAssets';

describe('Flow 附件与链接 API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Given 一个小型二进制文件, When 上传附件, Then 保留文件名和原始字节', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { attachments: ['实验数据.bin'] },
    }), { status: 201 }));
    const file = new File([new Uint8Array([0, 255])], '实验数据.bin');

    await expect(uploadFlowAttachment('PRJ 001', 'F/001', file)).resolves.toEqual(['实验数据.bin']);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/flows/F%2F001/attachments');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      projectId: 'PRJ 001',
      filename: '实验数据.bin',
      contentBase64: 'AP8=',
    });
  });

  it('Given 文件超过限制, When 上传附件, Then 在发送请求前给出明确错误', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const file = { name: 'large.bin', size: MAX_FLOW_ATTACHMENT_BYTES + 1 } as File;

    await expect(uploadFlowAttachment('PRJ_001', 'F001', file)).rejects.toThrow('附件不能超过 3 MiB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given 已有附件, When 删除, Then 对路径参数编码并返回最新列表', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { attachments: [] },
    }), { status: 200 }));

    await expect(deleteFlowAttachment('PRJ 001', 'F001', '结果 #1.xlsx')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/flows/F001/attachments/%E7%BB%93%E6%9E%9C%20%231.xlsx?projectId=PRJ+001',
      { method: 'DELETE' },
    );
  });

  it('Given 一个本地绝对路径, When 添加再移除链接, Then 使用对应端点和请求体', async () => {
    const link = { path: 'D:\\资料\\data.xlsx', label: '原始数据' };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { links: [link] } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { links: [] } }), { status: 200 }));

    await expect(addFlowLink('PRJ_001', 'F001', link.path, link.label)).resolves.toEqual([link]);
    await expect(removeFlowLink('PRJ_001', 'F001', link.path)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/flows/F001/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'PRJ_001', path: link.path, label: link.label }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/flows/F001/links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'PRJ_001', path: link.path }),
    });
  });

  it('Given 后端拒绝重复附件, When 上传, Then 将后端原因交给界面显示', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: '同名附件已存在',
    }), { status: 409 }));

    await expect(uploadFlowAttachment('PRJ_001', 'F001', new File(['x'], 'same.txt')))
      .rejects.toThrow('同名附件已存在');
  });
});
