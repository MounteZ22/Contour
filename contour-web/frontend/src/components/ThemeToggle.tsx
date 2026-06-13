import { useAtom } from 'jotai';
import { Palette } from 'lucide-react';
import { themeAtom, THEME_OPTIONS } from '../state/theme';
import { Button } from './ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <div className="relative group">
      <Button variant="ghost" size="sm" title="切换主题">
        <Palette className="w-4 h-4" />
        <span className="hidden sm:inline">主题</span>
      </Button>
      <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-card shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="py-1">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setTheme(option.id)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                theme === option.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
