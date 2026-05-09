import { ArrowRight, GitBranch, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Flow } from '../types';
import { StatusBadge } from './StatusBadge';

interface NodePos {
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

export function ContourMap({
  flows,
  projectId,
  onDeleteFlow,
  onCreateFlow,
}: {
  flows: Flow[];
  projectId: string;
  onDeleteFlow?: (flowId: string, title: string) => void;
  onCreateFlow?: (parentFlowId: string, title: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');

  // 用 ref 追踪已初始化的 flowId，避免每次 prop 变化都重置位置
  const initializedRef = useRef<Set<string>>(new Set());
  // 追踪拖拽起点，用于区分拖拽和点击
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // 标记是否发生了有效拖拽（移动超过阈值）
  const hasDraggedRef = useRef(false);
  // 阻止下一次 click 导航（拖拽结束后 Link 会收到 click 事件）
  const preventClickRef = useRef(false);
  // 多选模式下，候选切换选中的节点
  const candidateSelectRef = useRef<string | null>(null);

  // 只给新出现的 flow 初始化位置，已有本地位置的保留
  useEffect(() => {
    setPositions((prev) => {
      const next = new Map(prev);
      flows.forEach((flow, i) => {
        if (!initializedRef.current.has(flow.flowId)) {
          next.set(flow.flowId, getNodePos(flow, i, flows.length));
          initializedRef.current.add(flow.flowId);
        }
      });
      // 清理已不存在的 flow
      const currentIds = new Set(flows.map((f) => f.flowId));
      for (const id of next.keys()) {
        if (!currentIds.has(id)) {
          next.delete(id);
          initializedRef.current.delete(id);
        }
      }
      return next;
    });
  }, [flows]);

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
      // 只有左键才触发拖拽
      if (e.button !== 0) return;
      e.preventDefault();

      const pos = positions.get(flowId);
      if (!pos || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      dragStartRef.current = { x: mouseX, y: mouseY };
      hasDraggedRef.current = false;
      preventClickRef.current = false;
      candidateSelectRef.current = multiSelectMode ? flowId : null;

      setDragOffset({
        x: mouseX - pos.x,
        y: mouseY - pos.y,
      });
      setDraggingId(flowId);

      if (!multiSelectMode) {
        setSelectedIds(new Set());
      }
    },
    [positions, multiSelectMode],
  );

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;

      // 检查是否移动超过阈值，标记为有效拖拽
      if (dragStartRef.current) {
        const dx = e.clientX - rect.left - dragStartRef.current.x;
        const dy = e.clientY - rect.top - dragStartRef.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasDraggedRef.current = true;
        }
      }

      setPositions((prev) => {
        const next = new Map(prev);
        next.set(draggingId, { x: Math.max(0, x), y: Math.max(0, y) });
        return next;
      });
    };

    const handleMouseUp = () => {
      if (draggingId) {
        if (hasDraggedRef.current) {
          // 发生了有效拖拽，阻止接下来的 click 事件
          preventClickRef.current = true;

          // 立即保存位置（不等 debounce）
          const pos = positions.get(draggingId);
          if (pos) {
            fetch(`/api/flows/${draggingId}/position`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }),
            }).catch((err) => console.error('保存位置失败:', err));
          }
        } else if (multiSelectMode && candidateSelectRef.current) {
          // 多选模式下点击（非拖拽）切换选中状态，阻止导航
          preventClickRef.current = true;
          setSelectedIds((prev) => {
            const next = new Set(prev);
            const id = candidateSelectRef.current!;
            if (next.has(id)) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          });
        }
      }
      setDraggingId(null);
      candidateSelectRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, dragOffset, positions, multiSelectMode]);

  const canvasWidth = 1200;
  const canvasHeight = 400;
  const nodeWidth = 220;
  const nodeHeight = 100;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-auto border border-outline-variant rounded-xl bg-surface-container"
      style={{
        minHeight: canvasHeight,
        backgroundImage:
          'radial-gradient(circle, var(--token-outline-variant) 1px, transparent 1px)',
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
              stroke="var(--token-primary)"
              strokeDasharray="4"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {flows.map((flow) => {
        const pos = positions.get(flow.flowId);
        if (!pos) return null;
        const isSelected = selectedIds.has(flow.flowId);
        const isDragging = draggingId === flow.flowId;

        return (
          <div
            className={`absolute select-none ${
              isDragging ? 'cursor-grabbing z-50' : 'cursor-grab z-10'
            } ${
              isSelected
                ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-[var(--token-surface-container)]'
                : ''
            }`}
            key={flow.flowId}
            onMouseDown={(e) => handleMouseDown(e, flow.flowId)}
            style={{
              left: pos.x,
              top: pos.y,
              width: nodeWidth,
            }}
          >
            <Link
              className="block bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm hover:border-primary/30 transition-colors"
              onClick={(e) => {
                if (preventClickRef.current || multiSelectMode) {
                  e.preventDefault();
                  preventClickRef.current = false;
                }
              }}
              to={`/project/${projectId}/flows/${flow.flowId}`}
            >
              <div className="px-3.5 py-2 border-b border-outline-variant bg-surface-container-low rounded-t-lg flex items-center justify-between">
                <span className="text-[11px] font-mono text-primary">{flow.flowId}</span>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={flow.status} />
                  {onDeleteFlow && (
                    <button
                      className="w-5 h-5 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors hover:bg-error/15 hover:border-error/25 hover:text-error"
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
                <h4 className="text-sm font-semibold text-on-surface font-headline line-clamp-1">
                  {flow.title}
                </h4>
                <div className="flex items-center justify-between mt-2 text-xs text-on-surface-variant font-mono">
                  <span className="inline-flex items-center gap-1">
                    <GitBranch size={12} />
                    {flow.parentFlows.length === 0
                      ? 'Root'
                      : flow.parentFlows.join(', ')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    <ArrowRight size={12} />
                    Open
                  </span>
                </div>
              </div>
            </Link>

            {/* 从此节点创建新 Flow */}
            {creatingFromId !== flow.flowId && (
              <button
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center cursor-pointer hover:scale-110 transition-all shadow-sm z-20"
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
                className="absolute left-0 top-full mt-2 w-[220px] bg-surface-container-lowest border border-primary/25 rounded-lg shadow-lg p-3 z-50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  className="w-full px-2.5 py-1.5 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-xs outline-none focus:border-primary/40 font-mono mb-2"
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
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors bg-tertiary-container/25 border-tertiary/25 text-tertiary hover:bg-tertiary-container/40 font-mono"
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
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors bg-error-container/25 border-error/20 text-error hover:bg-error-container/40 font-mono"
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
          </div>
        );
      })}

      {/* 右上角控制栏：多选模式开关 */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors font-mono ${
            multiSelectMode
              ? 'bg-primary-container/30 border-primary/30 text-primary'
              : 'bg-surface-container/80 border-outline-variant/40 text-on-surface-variant hover:border-primary/20'
          }`}
          onClick={() => {
            setMultiSelectMode((prev) => {
              const next = !prev;
              if (!next) setSelectedIds(new Set());
              return next;
            });
          }}
          type="button"
        >
          <span className={`w-2 h-2 rounded-full ${multiSelectMode ? 'bg-primary' : 'bg-outline-variant'}`} />
          {multiSelectMode ? '多选模式' : '单选模式'}
        </button>
      </div>

      {/* 节点数量提示 */}
      <div className="absolute bottom-3 right-3 text-[11px] font-mono text-on-surface-variant bg-surface-container/80 px-2 py-1 rounded">
        {flows.length} nodes · {edges.length} edges
        {selectedIds.size > 0 && (
          <span className="ml-2 text-primary">
            · {selectedIds.size} selected
          </span>
        )}
      </div>
    </div>
  );
}
