import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { applyThemeClass, themeAtom } from '../state/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme] = useAtom(themeAtom);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  return <>{children}</>;
}
