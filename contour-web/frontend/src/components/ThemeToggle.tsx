import { useAtom } from 'jotai';
import { Palette } from 'lucide-react';
import { themeAtom, THEME_OPTIONS } from '../state/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
        title="切换主题"
      >
        <Palette className="w-4 h-4" />
        <span className="hidden sm:inline">主题</span>
      </button>
      <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="py-1">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setTheme(option.id)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                theme === option.id
                  ? 'bg-primary-container text-on-primary-container font-medium'
                  : 'text-on-surface hover:bg-surface-container-low'
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
