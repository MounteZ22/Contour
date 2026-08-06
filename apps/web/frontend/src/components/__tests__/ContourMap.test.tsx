import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Flow } from '@contour/shared';
import { ContourMap, computeLayeredLayout, saveLayoutPositions, type NodePos } from '../ContourMap';
import { showToast } from '../Toast';

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

function makeFlow(flowId: string, parentFlows: string[] = []): Flow {
  return {
    flowId,
    title: flowId,
    status: 'in_progress',
    type: 'general',
    created: '2026-07-30',
    updated: '2026-07-30',
    parentFlows,
    linkedClaims: [],
    tags: [],
    openUncertainties: [],
    summary: '',
    attachments: [],
    links: [],
    sections: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ContourMap 自动布局', () => {
  it('Given 纯环图, When 计算自动布局, Then 每个节点都保留稳定的 fallback 坐标', () => {
    const flows = [makeFlow('F1', ['F2']), makeFlow('F2', ['F1'])];

    const firstLayout = computeLayeredLayout(flows);
    const secondLayout = computeLayeredLayout(flows);

    expect(firstLayout.size).toBe(flows.length);
    expect(firstLayout.get('F1')).toEqual({ x: 40, y: 40 });
    expect(firstLayout.get('F2')).toEqual({ x: 40, y: 190 });
    expect(secondLayout).toEqual(firstLayout);
  });

  it('Given 根节点连接到环及其下游, When 计算自动布局, Then 环保持同层且下游进入下一层', () => {
    const flows = [
      makeFlow('ROOT'),
      makeFlow('F1', ['ROOT', 'F2']),
      makeFlow('F2', ['F1']),
      makeFlow('CHILD', ['F2']),
    ];

    const layout = computeLayeredLayout(flows);

    expect(layout.size).toBe(flows.length);
    expect(layout.get('ROOT')).toEqual({ x: 40, y: 40 });
    expect(layout.get('F1')).toEqual({ x: 340, y: 40 });
    expect(layout.get('F2')).toEqual({ x: 340, y: 190 });
    expect(layout.get('CHILD')).toEqual({ x: 640, y: 40 });

    // F1 <-> F2 是环内边，排除；其余边必须保持从左到右。
    const crossComponentEdges: Array<[string, string]> = [
      ['ROOT', 'F1'],
      ['F2', 'CHILD'],
    ];
    crossComponentEdges.forEach(([sourceId, targetId]) => {
      expect(layout.get(sourceId)!.x).toBeLessThan(layout.get(targetId)!.x);
    });
  });

  it('Given 常规 DAG, When 计算自动布局, Then 父节点和子节点始终从左向右分层', () => {
    const layout = computeLayeredLayout([
      makeFlow('ROOT'),
      makeFlow('F1', ['ROOT']),
      makeFlow('F2', ['ROOT']),
      makeFlow('CHILD', ['F1', 'F2']),
    ]);

    expect(layout.get('ROOT')).toEqual({ x: 40, y: 40 });
    expect(layout.get('F1')).toEqual({ x: 340, y: 40 });
    expect(layout.get('F2')).toEqual({ x: 340, y: 190 });
    expect(layout.get('CHILD')).toEqual({ x: 640, y: 40 });
  });
});

describe('ContourMap 自动布局位置保存', () => {
  it('Given 一批布局位置且其中一个保存失败, When 等待批量保存完成, Then 所有节点都尝试保存并返回失败节点', async () => {
    const positions = new Map<string, NodePos>([
      ['F1', { x: 40, y: 40 }],
      ['F2', { x: 340, y: 40 }],
    ]);
    const savePosition = vi.fn(async (flowId: string) => {
      if (flowId === 'F2') throw new Error('网络异常');
    });

    const result = await saveLayoutPositions([makeFlow('F1'), makeFlow('F2')], positions, savePosition);

    expect(savePosition).toHaveBeenCalledTimes(2);
    expect(savePosition).toHaveBeenNthCalledWith(1, 'F1', { x: 40, y: 40 });
    expect(savePosition).toHaveBeenNthCalledWith(2, 'F2', { x: 340, y: 40 });
    expect(result).toEqual({ failedFlowIds: ['F2'] });
  });

  it('Given 保存中的自动布局, When 用户再次点击, Then 不会发起第二批请求且全部完成后只刷新一次', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const onLayoutSaved = vi.fn();

    render(createElement(
      MemoryRouter,
      undefined,
      createElement(ContourMap, {
        flows: [makeFlow('F1'), makeFlow('F2', ['F1'])],
        onLayoutSaved,
        projectId: 'P1',
      }),
    ));

    const button = screen.getByRole('button', { name: '自动布局' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();
    expect(onLayoutSaved).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirst?.(new Response('', { status: 200 }));
      resolveSecond?.(new Response('', { status: 200 }));
    });

    await waitFor(() => expect(onLayoutSaved).toHaveBeenCalledOnce());
  });

  it('Given 自动布局中有失败的 PUT, When 全部请求结束, Then 显示失败 Toast 并只刷新一次', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const onLayoutSaved = vi.fn();

    render(createElement(
      MemoryRouter,
      undefined,
      createElement(ContourMap, {
        flows: [makeFlow('F1'), makeFlow('F2', ['F1'])],
        onLayoutSaved,
        projectId: 'P1',
      }),
    ));

    fireEvent.click(screen.getByRole('button', { name: '自动布局' }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('自动布局已应用，但 1 个节点的位置保存失败', 'error');
      expect(onLayoutSaved).toHaveBeenCalledOnce();
    });
  });
});
