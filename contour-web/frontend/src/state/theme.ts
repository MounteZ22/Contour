import { atomWithStorage } from 'jotai/utils';

export type ThemeId = 'light-scientific' | 'dark-scientific';

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'light-scientific', label: 'Light Scientific' },
  { id: 'dark-scientific', label: 'Dark Scientific' },
];

export const DEFAULT_THEME: ThemeId = 'light-scientific';

/** Jotai atom with localStorage persistence */
export const themeAtom = atomWithStorage<ThemeId>('contour-theme', DEFAULT_THEME);

/** Apply theme class to <html> element */
export function applyThemeClass(theme: ThemeId) {
  const html = document.documentElement;
  // Remove all known theme classes
  for (const t of THEME_OPTIONS) {
    html.classList.remove(`theme-${t.id}`);
  }
  // Add the selected one
  html.classList.add(`theme-${theme}`);
}

