import { atomWithStorage } from 'jotai/utils';
import { atom } from 'jotai';

// ── 新双 atom（P0 起为主要导出） ──

/** 基底主题：light | dark */
export const baseThemeAtom = atomWithStorage<'light' | 'dark'>('contour-base-theme', 'light');

/** 强调色：neutral（默认单色）| blue | green | purple | amber */
export const accentThemeAtom = atomWithStorage<string>('contour-accent-theme', 'neutral');

// ── 向后兼容导出（旧代码引用了 themeAtom / THEME_OPTIONS / ThemeId） ──

export type ThemeId = 'light-scientific' | 'dark-scientific';

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'light-scientific', label: 'Light Scientific' },
  { id: 'dark-scientific', label: 'Dark Scientific' },
];

export const DEFAULT_THEME: ThemeId = 'light-scientific';

/**
 * 向后兼容的 themeAtom。
 * 读：从 baseThemeAtom 推导出旧 ThemeId；
 * 写：同步更新 baseThemeAtom。
 */
export const themeAtom = atom(
  (get) => {
    const base = get(baseThemeAtom);
    return base === 'dark' ? 'dark-scientific' : 'light-scientific';
  },
  (_get, set, value: ThemeId) => {
    set(baseThemeAtom, value === 'dark-scientific' ? 'dark' : 'light');
  },
);

/** 应用主题 class 和 data-accent 到 <html> 元素（兼容旧调用方） */
export function applyThemeClass(theme: ThemeId) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-dark');
  const base = theme === 'dark-scientific' ? 'dark' : 'light';
  html.classList.add(`theme-${base}`);
}
