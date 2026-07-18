import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAttachedDirectory,
  addAttachedFile,
  getProjectConfig,
  removeAttachedDirectory,
  removeAttachedFile,
} from './projectConfig';

type PathAction = (projectId: string, path: string) => Promise<typeof config>;

const config = {
  projectDir: 'D:\\Contour-dev\\PRJ_001',
  attachedDirectories: [{ path: 'E:\\资料', available: true }],
  attachedFiles: [{ path: 'E:\\记录.xlsx', available: false }],
};

describe('项目文件设置 API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Given 已选择项目, When 读取配置, Then 返回项目目录和附加路径', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: config,
    }), { status: 200 }));

    await expect(getProjectConfig('PRJ 001')).resolves.toEqual(config);
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/PRJ%20001/config');
  });

  const changeCases: Array<[string, PathAction, string, string, 'POST' | 'DELETE']> = [
    ['文件夹', addAttachedDirectory, 'folders', 'D:\\Research', 'POST'],
    ['文件', addAttachedFile, 'files', 'D:\\Research\\notes.md', 'POST'],
    ['文件夹', removeAttachedDirectory, 'folders', 'D:\\Research', 'DELETE'],
    ['文件', removeAttachedFile, 'files', 'D:\\Research\\notes.md', 'DELETE'],
  ];

  it.each(changeCases)('Given 一个%s路径, When 修改配置, Then 向正确端点发送路径', async (_label, action, endpoint, path, method) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: config,
    }), { status: 200 }));

    await expect(action('PRJ_001', path)).resolves.toEqual(config);
    expect(fetchMock).toHaveBeenCalledWith(`/api/projects/PRJ_001/${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  });

  it('Given 后端拒绝路径, When 添加文件夹, Then 向界面提供可读错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: '路径必须是绝对路径',
    }), { status: 400 }));

    await expect(addAttachedDirectory('PRJ_001', 'relative/path'))
      .rejects.toThrow('路径必须是绝对路径');
  });
});
