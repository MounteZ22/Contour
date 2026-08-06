export interface SavedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export function normalizeWindowState(value: unknown): SavedWindowState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as Partial<SavedWindowState>;
  if (!Number.isFinite(state.width) || !Number.isFinite(state.height)) return undefined;
  return {
    x: Number.isFinite(state.x) ? Math.round(state.x!) : undefined,
    y: Number.isFinite(state.y) ? Math.round(state.y!) : undefined,
    width: Math.min(Math.max(Math.round(state.width!), 900), 3840),
    height: Math.min(Math.max(Math.round(state.height!), 640), 2160),
  };
}

export function loopbackUrl(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid loopback port');
  return `http://127.0.0.1:${port}`;
}

export function shouldHideOnClose(isQuitting: boolean): boolean {
  return !isQuitting;
}
