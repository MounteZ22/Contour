import { ArrowRight, ArrowRightLeft, GitBranch, Trash2 } from 'lucide-react';
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
  // 默认水平排列，中心在画布中间
  const spacing = 240;
  const totalWidth = (total - 1) * spacing;
  const startX = 80; // padding left
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
  onRefresh,
}: {
  flows: Flow[];
  projectId: string;
  onDeleteFlow?: (flowId: string, title: string) => void;
  onRefresh?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化位置（优先用 flow.position，否则自动计算）
  useEffect(() => {
    const map = new Map<string, NodePos>();
    flows.forEach((flow, i) => {
      map.set(flow.flowId, getNodePos(flow, i, flows.length));
    });
    setPositions(map);
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
      e.preventDefault();
      const pos = positions.get(flowId);
      if (!pos || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left - pos.x,
        y: e.clientY - rect.top - pos.y,
      });
      setDraggingId(flowId);

      // Ctrl+点击多选
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(flowId)) {
            next.delete(flowId);
          } else {
            next.add(flowId);
          }
          return next;
        });
      } else {
        setSelectedIds(new Set([flowId]));
      }
    },
    [positions],
  );

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(draggingId, { x: Math.max(0, x), y: Math.max(0, y) });
        return next;
      });
    };

    const handleMouseUp = () => {
      if (draggingId) {
        const pos = positions.get(draggingId);
        if (pos) {
          // debounce save
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => {
            fetch(`/api/flows/${draggingId}/position`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }),
            }).catch((err) => console.error('保存位置失败:', err));
          }, 300);
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
  }, [draggingId, dragOffset, positions]);

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
            className={`absolute cursor-grab active:cursor-grabbing select-none ${
              isSelected
                ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface-container'
                : ''
            } ${isDragging ? 'z-50' : 'z-10'}`}
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
                if (draggingId) {
                  e.preventDefault();
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
          </div>
        );
      })}

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
