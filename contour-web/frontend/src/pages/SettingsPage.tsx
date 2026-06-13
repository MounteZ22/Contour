import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, Check, Moon, Palette, Radio, Settings, Sun } from 'lucide-react';
import { useAtom } from 'jotai';
import { ChannelSettings } from '../components/settings/ChannelSettings';
import { Button } from '../components/ui/button';
import { buttonVariants } from '../components/ui/button';
import { cn } from '@/lib/utils';
import { themeAtom, THEME_OPTIONS, type ThemeId } from '../state/theme';

type SettingsTab = 'general' | 'ai' | 'appearance';

interface TabItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  { id: 'general', label: '通用设置', icon: <Settings size={16} /> },
  { id: 'ai', label: 'AI 模型配置', icon: <Radio size={16} /> },
  { id: 'appearance', label: '外观设置', icon: <Palette size={16} /> },
];

function AppearanceSettings() {
  const [theme, setTheme] = useAtom(themeAtom);

  const isDark = theme.includes('dark');

  const toggleMode = () => {
    const newTheme = theme.replace(isDark ? 'dark' : 'light', isDark ? 'light' : 'dark') as ThemeId;
    setTheme(newTheme);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-foreground font-headline">外观设置</h3>
        <p className="mt-1 text-sm text-muted-foreground">调整界面主题和配色</p>
      </div>

      {/* 亮暗模式 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">模式</h4>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { if (isDark) toggleMode(); }}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer",
              !isDark
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            )}
            type="button"
          >
            {!isDark && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check size={12} className="text-primary-foreground" />
              </div>
            )}
            <Sun size={24} className={!isDark ? "text-primary" : "text-muted-foreground"} />
            <span className="text-sm font-medium text-foreground">浅色</span>
          </button>
          <button
            onClick={() => { if (!isDark) toggleMode(); }}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer",
              isDark
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            )}
            type="button"
          >
            {isDark && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check size={12} className="text-primary-foreground" />
              </div>
            )}
            <Moon size={24} className={isDark ? "text-primary" : "text-muted-foreground"} />
            <span className="text-sm font-medium text-foreground">深色</span>
          </button>
        </div>
      </div>

      {/* 主题色 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">主题色</h4>
        <div className="grid grid-cols-1 gap-2">
          {THEME_OPTIONS.map((option) => {
            const isActive = theme === option.id;
            const optionIsDark = option.id.includes('dark');
            return (
              <button
                key={option.id}
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-4 py-3 transition-all cursor-pointer text-left",
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
                type="button"
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  option.id.includes('scientific') && "bg-blue-500",
                  option.id.includes('emerald') && "bg-emerald-500",
                  option.id.includes('violet') && "bg-violet-500",
                )}>
                  {optionIsDark ? (
                    <Moon size={14} className="text-white" />
                  ) : (
                    <Sun size={14} className="text-white" />
                  )}
                </div>
                <span className="flex-1 text-sm font-medium text-foreground">{option.label}</span>
                {isActive && (
                  <Check size={16} className="text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderTabContent(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case 'general':
      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-base font-semibold text-foreground font-headline">通用设置</h3>
            <p className="mt-1 text-sm text-muted-foreground">基础应用配置</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Settings size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">通用设置即将推出</p>
          </div>
        </div>
      );
    case 'ai':
      return <ChannelSettings />;
    case 'appearance':
      return <AppearanceSettings />;
  }
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? '设置';

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部 Header */}
      <header className="flex items-center justify-between gap-6 px-8 h-16 border-b border-border backdrop-blur-xl bg-background/60 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <ArrowLeft size={16} />
            <span>返回</span>
          </Link>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-primary" />
            <h1 className="text-lg font-semibold text-foreground font-headline">设置</h1>
          </div>
        </div>
        <div className="text-sm text-muted-foreground font-mono">{activeTabLabel}</div>
      </header>

      {/* 主体 */}
      <div className="flex min-h-[calc(100vh-64px)]">
        {/* 左侧导航 */}
        <aside className="w-[200px] border-r border-border bg-muted/30 py-4 px-3 flex-shrink-0">
          <nav className="flex flex-col gap-0.5">
            {TABS.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                className="justify-start gap-2.5"
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Button>
            ))}
          </nav>
        </aside>

        {/* 右侧内容 */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-2xl">{renderTabContent(activeTab)}</div>
        </main>
      </div>
    </div>
  );
}
