/** Confidence 等级对应的颜色 */
export const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  medium: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  high: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
};

/** Claim 状态对应的颜色 */
export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  tentative: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  active: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  revised: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  weakened: { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },
  superseded: { bg: '#e5e7eb', text: '#4b5563', border: '#6b7280' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

/** Confidence 扁平颜色映射（用于 ContourView 等直接取色值的场景） */
export const CONFIDENCE_COLOR_MAP: Record<string, string> = {
  low: '#f59e0b',
  medium: '#3b82f6',
  high: '#10b981',
};

/** Confidence 扁平背景色映射 */
export const CONFIDENCE_BG_MAP: Record<string, string> = {
  low: '#fef3c7',
  medium: '#dbeafe',
  high: '#d1fae5',
};
