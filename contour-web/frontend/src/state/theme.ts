import { atomWithStorage } from 'jotai/utils';

// ── 主题 atom ──

/** 基底主题：light | dark */
export const baseThemeAtom = atomWithStorage<'light' | 'dark'>('contour-base-theme', 'light');

/** 强调色：neutral（默认单色）| blue | green | purple | amber */
export const accentThemeAtom = atomWithStorage<string>('contour-accent-theme', 'neutral');
