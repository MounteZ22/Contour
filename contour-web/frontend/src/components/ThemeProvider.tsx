import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { baseThemeAtom, accentThemeAtom } from '../state/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [baseTheme] = useAtom(baseThemeAtom);
  const [accentTheme] = useAtom(accentThemeAtom);

  useEffect(() => {
    const html = document.documentElement;
    // 清除旧 class，设置新基底
    html.classList.remove('theme-light', 'theme-dark');
    html.classList.add(`theme-${baseTheme}`);
    // 设置强调色 data 属性
    html.dataset.accent = accentTheme;
  }, [baseTheme, accentTheme]);

  return <>{children}</>;
}
