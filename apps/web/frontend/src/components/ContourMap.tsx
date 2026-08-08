import { ArrowRight, Check, ChevronDown, GitBranch, LayoutGrid, Plus, Shield, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import type { Claim, Flow } from '@contour/shared';
import { StatusBadge } from './StatusBadge';
import { CONFIDENCE_BG_MAP, CONFIDENCE_COLOR_MAP } from '../constants/claimColors';
import { showToast } from './Toast';

export interface NodePos {
  x: number;
  y: number;
}

function getNodePos(flow: Flow, index: number, total: number): NodePos {
  if (flow.position) return flow.position;
  const spacing = 240;
  const startX = 80;
  const centerY = 120;
  return {
    x: startX + index * spacing,
    y: centerY,
  };
}

function drawEdgePath(
  from: NodePos,
  to: NodePos,
  nodeWidth = 200,
  nodeHeight = 100,
): string {
  const fromX = from.x + nodeWidth;
  const fromY = from.y + nodeHeight / 2;
  const toX = to.x;
  const toY = to.y + nodeHeight / 2;
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

// ===== Flow 分层布局算法 =====

/**
 * 先将强连通分量（SCC）缩点，再对缩点后的 DAG 进行横向分层布局。
 * 环内节点保持同层；环外下游节点继续沿 x 轴分层，避免出现反向边。
 */
export function computeLayeredLayout(flows: Flow[]): Map<string, NodePos> {
  const flowIds = new Set(flows.map((f) => f.flowId));

  // 构建邻接表（仅计算当前 Flow 集合内部的父子关系）。
  const children = new Map<string, string[]>();
  for (const flow of flows) {
    children.set(flow.flowId, []);
  }
  for (const flow of flows) {
    for (const parentId of flow.parentFlows) {
      if (flowIds.has(parentId)) {
        children.get(parentId)!.push(flow.flowId);
      }
    }
  }

  // Tarjan 算法：先将每个环缩为一个强连通分量，后续图一定是 DAG。
  const discoveryIndex = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  const collectComponent = (flowId: string) => {
    discoveryIndex.set(flowId, nextIndex);
    lowLink.set(flowId, nextIndex);
    nextIndex += 1;
    stack.push(flowId);
    inStack.add(flowId);

    for (const childId of children.get(flowId) ?? []) {
      if (!discoveryIndex.has(childId)) {
        collectComponent(childId);
        lowLink.set(flowId, Math.min(lowLink.get(flowId)!, lowLink.get(childId)!));
      } else if (inStack.has(childId)) {
        lowLink.set(flowId, Math.min(lowLink.get(flowId)!, discoveryIndex.get(childId)!));
      }
    }

    if (lowLink.get(flowId) === discoveryIndex.get(flowId)) {
      const component: string[] = [];
      let memberId: string;
      do {
        memberId = stack.pop()!;
        inStack.delete(memberId);
        component.push(memberId);
      } while (memberId !== flowId);
      components.push(component);
    }
  };

  for (const flow of flows) {
    if (!discoveryIndex.has(flow.flowId)) collectComponent(flow.flowId);
  }

  // 按原始输入顺序固定分量与同层节点的排列，保证重复布局坐标稳定。
  const flowOrder = new Map(flows.map((flow, index) => [flow.flowId, index]));
  components.forEach((component) => component.sort((a, b) => flowOrder.get(a)! - flowOrder.get(b)!));
  components.sort((a, b) => flowOrder.get(a[0])! - flowOrder.get(b[0])!);

  const componentByFlow = new Map<string, number>();
  components.forEach((component, componentId) => {
    component.forEach((flowId) => componentByFlow.set(flowId, componentId));
  });

  const componentChildren = components.map(() => new Set<number>());
  const componentInDegree = components.map(() => 0);
  components.forEach((component, sourceComponentId) => {
    for (const flowId of component) {
      for (const childId of children.get(flowId) ?? []) {
        const targetComponentId = componentByFlow.get(childId)!;
        if (targetComponentId !== sourceComponentId && !componentChildren[sourceComponentId].has(targetComponentId)) {
          componentChildren[sourceComponentId].add(targetComponentId);
          componentInDegree[targetComponentId] += 1;
        }
      }
    }
  });

  // 缩点后的图是 DAG，可安全进行标准拓扑分层。
  const queue: number[] = [];
  const componentLayer = components.map(() => 0);
  const candidateLayer = components.map(() => 0);
  componentInDegree.forEach((degree, componentId) => {
    if (degree === 0) queue.push(componentId);
  });

  while (queue.length > 0) {
    const sourceComponentId = queue.shift()!;
    for (const targetComponentId of componentChildren[sourceComponentId]) {
      candidateLayer[targetComponentId] = Math.max(
        candidateLayer[targetComponentId],
        componentLayer[sourceComponentId] + 1,
      );
      componentInDegree[targetComponentId] -= 1;
      if (componentInDegree[targetComponentId] === 0) {
        componentLayer[targetComponentId] = candidateLayer[targetComponentId];
        queue.push(targetComponentId);
      }
    }
  }

  // 按层分组
  const layerGroups = new Map<number, string[]>();
  for (const flow of flows) {
    const id = flow.flowId;
    const l = componentLayer[componentByFlow.get(id)!];
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(id);
  }

  // 按层排列节点
  const positions = new Map<string, NodePos>();
  const nodeSpacing = 150;    // 同层节点垂直间距
  const layerSpacing = 300;   // 层间水平间距，匹配左到右连线
  const margin = 40;          // 画布边距

  for (const [l, ids] of [...layerGroups.entries()].sort(([a], [b]) => a - b)) {
    ids.forEach((id, i) => {
      positions.set(id, {
        x: margin + l * layerSpacing,
        y: margin + i * nodeSpacing,
      });
    });
  }

  return positions;
}

/**
 * 并发保存自动布局位置，等待全部请求结束后再返回结果。
 * 失败不抛出，调用方可保留已在画布上应用的本地坐标并统一提示用户。
 */
export async function saveLayoutPositions(
  flows: Pick<Flow, 'flowId'>[],
  positions: Map<string, NodePos>,
  savePosition: (flowId: string, position: NodePos) => Promise<void>,
): Promise<{ failedFlowIds: string[] }> {
  const results = await Promise.all(
    flows.flatMap((flow) => {
      const position = positions.get(flow.flowId);
      if (!position) return [];
      return savePosition(flow.flowId, position)
        .then(() => null)
        .catch(() => flow.flowId);
    }),
  );

  return { failedFlowIds: results.filter((flowId): flowId is string => flowId !== null) };
}

/** 截取文本前 N 行（按 \n 分割） */
function firstLines(text: string, maxLines: number): string {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.slice(0, maxLines).join('\n');
}

export interface ContourMapHandle {
  autoLayout: () => Promise<void>;
}

export const ContourMap = forwardRef<ContourMapHandle, {
  flows: Flow[];
  projectId: string;
  claims?: Claim[];
  onDeleteFlow?: (flowId: string, title: string) => void;
  onCreateFlow?: (parentFlowId: string, title: string) => void;
  contextSelectMode?: boolean;
  selectedFlowIds?: Set<string>;
  onToggleFlowSelection?: (flowId: string) => void;
  /** 位置保存成功后回调，通知父组件同步数据 */
  onPositionSaved?: (flowId: string, x: number, y: number) => void;
  /** 自动布局的全部位置请求结束后回调一次，通知父组件同步数据 */
  onLayoutSaved?: () => void;
}>(function ContourMap({
  flows,
  projectId,
  claims = [],
  onDeleteFlow,
  onCreateFlow,
  contextSelectMode,
  selectedFlowIds,
  onToggleFlowSelection,
  onPositionSaved,
  onLayoutSaved,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [isAutoLayoutSaving, setIsAutoLayoutSaving] = useState(false);

  // ----- Hover 预览状态 -----
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);
  const [hoverPreviewVisible, setHoverPreviewVisible] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Claims 展开状态 -----
  const [expandedClaimsFlowId, setExpandedClaimsFlowId] = useState<string | null>(null);

  // 构建 claimId → Claim 的快速查找表
  const claimsMap = useMemo(() => {
    const map = new Map<string, Claim>();
    for (const c of claims) map.set(c.claimId, c);
    return map;
  }, [claims]);

  // Refs for drag state — avoids re-registering event listeners on every frame
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const dragOffsetRef = useRef(dragOffset);
  dragOffsetRef.current = dragOffset;
  const draggingIdRef = useRef(draggingId);
  draggingIdRef.current = draggingId;

  // 用 ref 追踪已初始化的 flowId，避免每次 prop 变化都重置位置
  const initializedRef = useRef<Set<string>>(new Set());
  // 按项目保存位置快照，防止不同项目的同名 flow 位置串绑，同时支持切回时恢复
  const positionsByProjectRef = useRef<Map<string, Map<string, NodePos>>>(new Map());
  // 追踪拖拽起点，用于区分拖拽和点击
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // 标记是否发生了有效拖拽（移动超过阈值）
  const hasDraggedRef = useRef(false);
  // 阻止下一次 click 导航（拖拽结束后 Link 会收到 click 事件）
  const preventClickRef = useRef(false);
  // 避免快速重复点击导致两批位置写入相互覆盖。
  const isAutoLayoutSavingRef = useRef(false);

  // 项目切换时：保存当前项目位置，恢复/清空目标项目位置
  const prevProjectRef = useRef(projectId);
  if (prevProjectRef.current !== projectId) {
    // 保存旧项目的位置快照
    positionsByProjectRef.current.set(prevProjectRef.current, new Map(positions));
    prevProjectRef.current = projectId;
    // 恢复已知项目的位置，或清空（新项目）
    const saved = positionsByProjectRef.current.get(projectId);
    initializedRef.current = saved ? new Set(saved.keys()) : new Set();
    setPositions(saved ?? new Map());
  }

  // 同步 flow 位置：新 flow 初始化，后端位置变化时更新（拖拽中的除外）
  useEffect(() => {
    setPositions((prev) => {
      const next = new Map(prev);
      const currentIds = new Set(flows.map((f) => f.flowId));
      flows.forEach((flow, i) => {
        const backendPos = flow.position;
        if (!initializedRef.current.has(flow.flowId)) {
          // 新 flow：用后端位置或默认布局
          next.set(flow.flowId, backendPos ?? getNodePos(flow, i, flows.length));
          initializedRef.current.add(flow.flowId);
        } else if (backendPos && draggingIdRef.current !== flow.flowId) {
          // 已初始化且非拖拽中：如果后端位置和本地不同，以后端为准（保存成功后同步）
          const local = next.get(flow.flowId);
          if (local && (local.x !== backendPos.x || local.y !== backendPos.y)) {
            next.set(flow.flowId, backendPos);
          }
        }
      });
      // 清理已不存在的 flow
      for (const id of next.keys()) {
        if (!currentIds.has(id)) {
          next.delete(id);
          initializedRef.current.delete(id);
        }
      }
      return next;
    });
  }, [flows]);

  // ===== 自动布局 =====
  const autoLayout = useCallback(async () => {
    if (isAutoLayoutSavingRef.current) return;

    isAutoLayoutSavingRef.current = true;
    setIsAutoLayoutSaving(true);
    const newPositions = computeLayeredLayout(flows);
    setPositions(newPositions);

    try {
      const { failedFlowIds } = await saveLayoutPositions(flows, newPositions, async (flowId, position) => {
        const response = await fetch(`/api/flows/${flowId}/position`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: Math.round(position.x), y: Math.round(position.y), projectId }),
          keepalive: true,
        });
        if (!response.ok) throw new Error(`保存位置失败（${response.status}）`);
      });

      if (failedFlowIds.length > 0) {
        showToast(`自动布局已应用，但 ${failedFlowIds.length} 个节点的位置保存失败`, 'error');
      }
      // 所有请求已结束后仅刷新一次，避免中间状态覆盖本地布局。
      onLayoutSaved?.();
    } finally {
      isAutoLayoutSavingRef.current = false;
      setIsAutoLayoutSaving(false);
    }
  }, [flows, projectId, onLayoutSaved]);

  // 暴露 autoLayout 给父组件
  useImperativeHandle(ref, () => ({ autoLayout }), [autoLayout]);

  // ===== Hover 预览逻辑 =====
  const handleNodeMouseEnter = useCallback((flowId: string) => {
    if (contextSelectMode) return; // 多选模式下不显示 hover 预览
    hoverTimerRef.current = setTimeout(() => {
      setHoveredFlowId(flowId);
      setHoverPreviewVisible(true);
    }, 300);
  }, [contextSelectMode]);

  const handleNodeMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreviewVisible(false);
    // 延迟清除 hoveredFlowId，让过渡动画完成
    setTimeout(() => setHoveredFlowId(null), 150);
  }, []);

  // 清理 hover 定时器
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const edges = useMemo(() => {
    const list: { from: string; to: string }[] = [];
    for (const flow of flows) {
      for (const parentId of flow.parentFlows) {
        if (flows.some((f) => f.flowId === parentId)) {
          list.push({ from: parentId, to: flow.flowId });
        }
      }
    }
    return list;
  }, [flows]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, flowId: string) => {
      // 只有左键才触发
      if (e.button !== 0) return;

      // AI 上下文选择模式下，点击切换选中，不拖拽
      if (contextSelectMode) {
        e.preventDefault();
        e.stopPropagation();
        onToggleFlowSelection?.(flowId);
        return;
      }

      e.preventDefault();

      const pos = positions.get(flowId);
      if (!pos || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      dragStartRef.current = { x: mouseX, y: mouseY };
      hasDraggedRef.current = false;
      preventClickRef.current = false;

      setDragOffset({
        x: mouseX - pos.x,
        y: mouseY - pos.y,
      });
      setDraggingId(flowId);
    },
    [positions, contextSelectMode, onToggleFlowSelection],
  );

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offset = dragOffsetRef.current;
      const x = e.clientX - rect.left - offset.x;
      const y = e.clientY - rect.top - offset.y;

      if (dragStartRef.current) {
        const dx = e.clientX - rect.left - dragStartRef.current.x;
        const dy = e.clientY - rect.top - dragStartRef.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasDraggedRef.current = true;
        }
      }

      const currentDraggingId = draggingIdRef.current;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(currentDraggingId!, { x: Math.max(0, x), y: Math.max(0, y) });
        return next;
      });
    };

    const handleMouseUp = () => {
      const currentDraggingId = draggingIdRef.current;
      if (currentDraggingId) {
        if (hasDraggedRef.current) {
          preventClickRef.current = true;
          const pos = positionsRef.current.get(currentDraggingId);
          if (pos) {
            fetch(`/api/flows/${currentDraggingId}/position`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y), projectId }),
              keepalive: true, // 组件卸载后仍能完成请求
            })
              .then((res) => {
                if (res.ok) onPositionSaved?.(currentDraggingId, Math.round(pos.x), Math.round(pos.y));
              })
              .catch((err) => console.error('保存位置失败:', err));
          }
        }
      }
      setDraggingId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId]);

  const canvasWidth = 1200;
  const canvasHeight = 600;
  const nodeWidth = 220;
  const nodeHeight = 100;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-auto border border-border rounded-xl bg-surface-sunken"
      style={{
        minHeight: canvasHeight,
        backgroundImage:
          'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <svg
        className="absolute top-0 left-0 pointer-events-none"
        height={canvasHeight}
        style={{ overflow: 'visible' }}
        width={canvasWidth}
      >
        {edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          return (
            <path
              d={drawEdgePath(from, to, nodeWidth, nodeHeight)}
              fill="none"
              key={`${edge.from}-${edge.to}`}
              stroke="var(--accent)"
              strokeDasharray="4"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {flows.map((flow) => {
        const pos = positions.get(flow.flowId);
        if (!pos) return null;
        const isContextSelected = selectedFlowIds?.has(flow.flowId) ?? false;
        const isDragging = draggingId === flow.flowId;
        const isHovered = hoveredFlowId === flow.flowId && hoverPreviewVisible;

        // 关联的 Claims
        const linkedClaimsList = flow.linkedClaims
          .map((cid) => claimsMap.get(cid))
          .filter(Boolean) as Claim[];
        const claimsCount = linkedClaimsList.length;

        // 摘要前 3 行
        const summaryPreview = firstLines(flow.summary || '', 3);
        const hasSummary = summaryPreview.length > 0;

        const nodeContent = (
          <>
            <div className="px-3.5 py-2 border-b border-border bg-surface-sunken rounded-t-lg flex items-center justify-between">
              <span className="text-label font-mono text-accent-strong">{flow.flowId}</span>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={flow.status} />
                {!contextSelectMode && onDeleteFlow && (
                  <button
                    className="w-5 h-5 rounded border border-border/40 bg-surface text-text-secondary flex items-center justify-center cursor-pointer transition-colors hover:bg-danger/15 hover:border-danger/25 hover:text-danger"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteFlow(flow.flowId, flow.title);
                    }}
                    title="删除 Flow"
                    type="button"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
            <div className="p-3.5">
              <h4 className="text-heading-sm font-semibold text-text-primary font-headline line-clamp-1">
                {flow.title}
              </h4>
              <div className="flex items-center justify-between mt-2 text-caption text-text-secondary font-mono">
                <span className="inline-flex items-center gap-1">
                  <GitBranch size={12} />
                  {flow.parentFlows.length === 0
                    ? 'Root'
                    : flow.parentFlows.join(', ')}
                </span>
                {!contextSelectMode && (
                  <span className="inline-flex items-center gap-1 text-accent-strong">
                    <ArrowRight size={12} />
                    Open
                  </span>
                )}
              </div>

              {/* Claims 关联徽标 */}
              {claimsCount > 0 && (
                <div className="mt-2">
                  <button
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium font-mono cursor-pointer transition-colors ${
                      expandedClaimsFlowId === flow.flowId
                        ? 'bg-accent-strong/20 text-accent-strong border border-accent-strong/30'
                        : 'bg-surface-sunken text-text-secondary border border-border/50 hover:bg-accent-subtle-bg hover:text-accent-strong hover:border-accent-strong/25'
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setExpandedClaimsFlowId(
                        expandedClaimsFlowId === flow.flowId ? null : flow.flowId
                      );
                    }}
                    title={`${claimsCount} 个关联 Claim`}
                    type="button"
                    aria-expanded={expandedClaimsFlowId === flow.flowId}
                  >
                    <Shield size={11} />
                    {claimsCount} claim{claimsCount > 1 ? 's' : ''}
                    <ChevronDown
                      size={10}
                      className={`transition-transform ${
                        expandedClaimsFlowId === flow.flowId ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          </>
        );

        return (
          <div
            className={`absolute select-none ${
              isDragging ? 'cursor-grabbing z-50' : contextSelectMode ? 'cursor-pointer z-10' : 'cursor-grab z-10'
            }`}
            key={flow.flowId}
            onMouseDown={(e) => handleMouseDown(e, flow.flowId)}
            onMouseEnter={() => handleNodeMouseEnter(flow.flowId)}
            onMouseLeave={handleNodeMouseLeave}
            style={{
              left: pos.x,
              top: pos.y,
              width: nodeWidth,
            }}
          >
            {/* Hover 预览浮层 */}
            {isHovered && (
              <div
                className="absolute left-full ml-3 top-0 w-52 bg-surface-raised border border-border rounded-lg shadow-lg p-3 z-[60] pointer-events-none animate-in fade-in slide-in-from-left-2"
                style={{ maxWidth: 240 }}
              >
                <p className="text-sm font-semibold text-text-primary font-headline mb-1.5 line-clamp-2">
                  {flow.title}
                </p>
                {hasSummary ? (
                  <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-3 font-mono mb-1.5 whitespace-pre-line">
                    {summaryPreview}
                  </p>
                ) : (
                  <p className="text-[11px] text-text-secondary/50 italic mb-1.5 font-mono">暂无摘要</p>
                )}
                <p className="text-[10px] text-text-secondary/60 font-mono">
                  更新于 {flow.updated}
                </p>
              </div>
            )}

            {/* 节点本体或 Link */}
            {contextSelectMode ? (
              <div
                className={`block relative bg-surface-raised border rounded-lg transition-colors ${
                  isContextSelected
                    ? 'border-accent-strong/50 bg-accent-subtle-bg'
                    : 'border-border hover:border-accent-strong/30'
                }`}
              >
                {isContextSelected && (
                  <div className="absolute top-2 right-2 z-10">
                    <Check size={12} className="text-accent-strong" />
                  </div>
                )}
                {nodeContent}
              </div>
            ) : (
              <Link
                className="block bg-surface-raised border border-border rounded-lg hover:border-accent-strong/30 transition-colors"
                onClick={(e) => {
                  if (preventClickRef.current) {
                    e.preventDefault();
                    preventClickRef.current = false;
                  }
                }}
                to={`/project/${projectId}/flows/${flow.flowId}`}
              >
                {nodeContent}
              </Link>
            )}

            {/* 从此节点创建新 Flow — 多选模式下隐藏 */}
            {!contextSelectMode && creatingFromId !== flow.flowId && (
              <button
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-accent-strong text-accent-on flex items-center justify-center cursor-pointer hover:scale-110 transition-all shadow-sm z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreatingFromId(flow.flowId);
                  setCreateTitle('');
                }}
                title="从此节点创建新 Flow"
                type="button"
              >
                <Plus size={12} />
              </button>
            )}

            {creatingFromId === flow.flowId && (
              <div
                className="absolute left-0 top-full mt-2 w-[220px] bg-surface-raised border border-accent-strong/25 rounded-lg shadow-lg p-3 z-50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-raised text-text-primary text-caption outline-none focus:border-accent-strong/40 font-mono mb-2"
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && createTitle.trim()) {
                      onCreateFlow?.(flow.flowId, createTitle.trim());
                      setCreatingFromId(null);
                      setCreateTitle('');
                    }
                    if (e.key === 'Escape') {
                      setCreatingFromId(null);
                      setCreateTitle('');
                    }
                  }}
                  placeholder="新 Flow 标题"
                  type="text"
                  value={createTitle}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors bg-accent-subtle-bg/25 border-accent-strong/25 text-accent-strong hover:bg-accent-subtle-bg/40 font-mono"
                    onClick={() => {
                      if (createTitle.trim()) {
                        onCreateFlow?.(flow.flowId, createTitle.trim());
                      }
                      setCreatingFromId(null);
                      setCreateTitle('');
                    }}
                    type="button"
                  >
                    创建
                  </button>
                  <button
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors bg-danger-subtle-bg/25 border-danger/20 text-danger hover:bg-danger-subtle-bg/40 font-mono"
                    onClick={() => {
                      setCreatingFromId(null);
                      setCreateTitle('');
                    }}
                    type="button"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 展开的 Claims 列表 */}
            {expandedClaimsFlowId === flow.flowId && claimsCount > 0 && (
              <div
                className="absolute left-0 top-full mt-1 w-[240px] bg-surface-raised border border-accent-strong/20 rounded-lg shadow-lg p-3 z-50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-text-primary font-mono flex items-center gap-1">
                    <Shield size={11} />
                    关联 Claims ({claimsCount})
                  </span>
                  <button
                    className="w-5 h-5 rounded flex items-center justify-center cursor-pointer text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedClaimsFlowId(null);
                    }}
                    type="button"
                    title="关闭"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                  {linkedClaimsList.map((claim) => {
                    const cc = CONFIDENCE_COLOR_MAP[claim.confidence] ?? '#6b7280';
                    const cb = CONFIDENCE_BG_MAP[claim.confidence] ?? '#f3f4f6';
                    return (
                      <Link
                        key={claim.claimId}
                        to={`/project/${projectId}/claims/${claim.claimId}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-sunken transition-colors text-left"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono"
                          style={{ backgroundColor: cb, color: cc, border: `1px solid ${cc}` }}
                        >
                          {claim.confidence}
                        </span>
                        <span className="text-[11px] text-text-primary font-mono truncate">
                          {claim.title}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 右下角控制区：节点/边计数 + 自动布局按钮 */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        <span className="text-label font-mono text-text-secondary bg-surface-sunken/80 px-2 py-1 rounded-md">
          {flows.length} nodes · {edges.length} edges
        </span>
        {!contextSelectMode && (
          <button
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-raised border border-border text-text-secondary text-caption font-medium cursor-pointer transition-colors hover:bg-accent-subtle-bg hover:border-accent-strong/25 hover:text-accent-strong font-mono disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isAutoLayoutSaving}
            onClick={autoLayout}
            title="自动分层布局 Flow 节点"
            type="button"
            aria-busy={isAutoLayoutSaving}
          >
            <LayoutGrid size={12} />
            {isAutoLayoutSaving ? '保存布局中' : '自动布局'}
          </button>
        )}
      </div>
    </div>
  );
});
