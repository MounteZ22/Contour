import { describe, expect, it } from 'vitest';
import { buildFlowChildren } from '../RightSidePanel';

describe('Flow 虚拟文件目录', () => {
  it('展开真实 Flow 目录后显示 flow.md、附件目录和链接文件', () => {
    const children = buildFlowChildren(
      {
        id: 'flow',
        name: 'F001 · 目标 Flow',
        path: 'D:\\vault\\flows',
        kind: 'directory',
        flowId: 'F001',
        flowAttachments: ['figure.png'],
        flowLinks: [{ path: 'D:\\lab\\data.xlsx', label: '原始数据' }],
      },
      {
        name: 'F001_目标 Flow',
        path: 'D:\\vault\\flows\\F001_目标 Flow',
        kind: 'directory',
      },
    );

    expect(children.map((child) => child.name)).toEqual(['flow.md', 'attachments', '链接文件']);
    expect(children[1].lazy).toBe(true);
    expect(children[2].children?.[0]).toMatchObject({
      name: '原始数据',
      path: 'D:\\lab\\data.xlsx',
      flowId: 'F001',
    });
  });
});
