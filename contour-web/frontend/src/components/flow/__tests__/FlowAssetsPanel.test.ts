import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  addLink: vi.fn(),
  deleteAttachment: vi.fn(),
  removeLink: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock('../../../state/flowAssets', async () => {
  const actual = await vi.importActual<typeof import('../../../state/flowAssets')>('../../../state/flowAssets');
  return {
    ...actual,
    addFlowLink: apiMocks.addLink,
    deleteFlowAttachment: apiMocks.deleteAttachment,
    removeFlowLink: apiMocks.removeLink,
    uploadFlowAttachment: apiMocks.uploadAttachment,
  };
});

vi.mock('../../Toast', () => ({ showToast: vi.fn() }));

import { FlowAssetsPanel } from '../FlowAssetsPanel';

describe('Flow 资料区', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given Flow 已有关联资料, When 打开详情页, Then 显示附件和链接', async () => {
    render(createElement(FlowAssetsPanel, {
      projectId: 'display-project',
      flowId: 'F001',
      attachments: ['实验记录.pdf'],
      links: [{ path: 'D:\\资料\\原始数据.xlsx', label: '原始数据' }],
      onRefresh: vi.fn(),
    }));

    expect(await screen.findByText('实验记录.pdf')).toBeDefined();
    expect(screen.getByText('原始数据')).toBeDefined();
    expect(screen.getByText('D:\\资料\\原始数据.xlsx')).toBeDefined();
  });

  it('Given 用户填写链接, When 保存成功, Then 立即显示并刷新项目', async () => {
    const onRefresh = vi.fn();
    const link = { path: 'D:\\资料\\结果.xlsx', label: '分析结果' };
    apiMocks.addLink.mockResolvedValue([link]);
    render(createElement(FlowAssetsPanel, {
      projectId: 'add-link-project',
      flowId: 'F002',
      attachments: [],
      links: [],
      onRefresh,
    }));

    fireEvent.click(screen.getByRole('button', { name: '添加链接' }));
    fireEvent.change(screen.getByLabelText('链接名称'), { target: { value: link.label } });
    fireEvent.change(screen.getByLabelText('本机绝对路径'), { target: { value: link.path } });
    fireEvent.click(screen.getByRole('button', { name: '保存链接' }));

    await waitFor(() => expect(apiMocks.addLink).toHaveBeenCalledWith(
      'add-link-project', 'F002', link.path, link.label,
    ));
    expect(await screen.findByText('分析结果')).toBeDefined();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('Given 一个附件, When 用户确认删除, Then 从列表移除并刷新项目', async () => {
    const onRefresh = vi.fn();
    apiMocks.deleteAttachment.mockResolvedValue([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(createElement(FlowAssetsPanel, {
      projectId: 'delete-project',
      flowId: 'F003',
      attachments: ['旧记录.txt'],
      links: [],
      onRefresh,
    }));

    fireEvent.click(await screen.findByRole('button', { name: '删除附件 旧记录.txt' }));

    await waitFor(() => expect(screen.queryByText('旧记录.txt')).toBeNull());
    expect(apiMocks.deleteAttachment).toHaveBeenCalledWith('delete-project', 'F003', '旧记录.txt');
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('Given 用户选择文件, When 上传成功, Then 立即显示新附件', async () => {
    apiMocks.uploadAttachment.mockResolvedValue(['新增附件.txt']);
    const { container } = render(createElement(FlowAssetsPanel, {
      projectId: 'upload-project',
      flowId: 'F004',
      attachments: [],
      links: [],
      onRefresh: vi.fn(),
    }));
    const file = new File(['content'], '新增附件.txt');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(apiMocks.uploadAttachment).toHaveBeenCalledWith('upload-project', 'F004', file));
    expect(await screen.findByText('新增附件.txt')).toBeDefined();
  });
});
