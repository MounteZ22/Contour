import { Moon, Sun } from 'lucide-react';
import { useAtom } from 'jotai';
import { baseThemeAtom } from '../../state/theme';
import { cn } from '@/lib/utils';

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [baseTheme, setBaseTheme] = useAtom(baseThemeAtom);
  const isDark = baseTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setBaseTheme(isDark ? 'light' : 'dark')}
      title={isDark ? '切换到浅色' : '切换到深色'}
      aria-label={isDark ? '切换到浅色' : '切换到深色'}
      className={cn(
        'h-9 rounded-[6px] px-3 inline-flex items-center gap-2 text-sm transition-colors cursor-pointer',
        collapsed && 'justify-center px-0',
        'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
      )}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      {!collapsed && <span>{isDark ? '浅色' : '深色'}</span>}
    </button>
  );
}
