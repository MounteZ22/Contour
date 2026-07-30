import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, Check, Globe2, Moon, Palette, PlugZap, Radio, Settings, Sun } from 'lucide-react';
import { useAtom, useAtomValue } from 'jotai';
import { ChannelSettings } from '../components/settings/ChannelSettings';
import { ProjectFilesSettings } from '../components/settings/ProjectFilesSettings';
import { PluginSettings } from '../components/settings/PluginSettings';
import { WebSearchSettings } from '../components/settings/WebSearchSettings';
import { SettingsCard, SettingsSection } from '../components/settings/primitives';
import { Button } from '../components/ui/button';
import { buttonVariants } from '../components/ui/button';
import { cn } from '@/lib/utils';
import { baseThemeAtom, accentThemeAtom } from '../state/theme';
import { currentProjectIdAtom } from '../state/shell';

type SettingsTab = 'general' | 'ai' | 'web-search' | 'plugins' | 'appearance';

interface TabItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  { id: 'general', label: '通用设置', icon: <Settings size={16} /> },
  { id: 'ai', label: 'AI 模型配置', icon: <Radio size={16} /> },
  { id: 'web-search', label: '网络检索', icon: <Globe2 size={16} /> },
  { id: 'plugins', label: '插件', icon: <PlugZap size={16} /> },
  { id: 'appearance', label: '外观设置', icon: <Palette size={16} /> },
];

const ACCENT_OPTIONS: { id: string; label: string; color: string }[] = [
  { id: 'neutral', label: '中性',   color: 'oklch(0.22 0 0)' },
  { id: 'blue',    label: '蓝色',   color: 'oklch(0.50 0.15 265)' },
  { id: 'green',   label: '绿色',   color: 'oklch(0.50 0.12 155)' },
  { id: 'purple',  label: '紫色',   color: 'oklch(0.50 0.15 300)' },
  { id: 'amber',   label: '琥珀',   color: 'oklch(0.55 0.06 60)' },
];

function AppearanceSettings() {
  const [baseTheme, setBaseTheme] = useAtom(baseThemeAtom);
  const [accentTheme, setAccentTheme] = useAtom(accentThemeAtom);

  const isDark = baseTheme === 'dark';

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
            onClick={() => setBaseTheme('light')}
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
            onClick={() => setBaseTheme('dark')}
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

      {/* 强调色 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">主题色</h4>
        <p className="text-xs text-muted-foreground">选择界面强调色，影响按钮、链接、选中态等</p>
        <div className="flex items-center gap-3">
          {ACCENT_OPTIONS.map((opt) => {
            const active = accentTheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAccentTheme(opt.id)}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={active}
                className={cn(
                  'relative w-9 h-9 rounded-full transition-all cursor-pointer',
                  active
                    ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/40 scale-105'
                    : 'ring-1 ring-border hover:scale-105',
                )}
                style={{ backgroundColor: opt.color }}
              >
                {active && (
                  <Check
                    size={14}
                    className="absolute inset-0 m-auto text-white drop-shadow-sm"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderTabContent(tab: SettingsTab, projectId: string | null): React.ReactElement {
  switch (tab) {
    case 'general':
      return <ProjectFilesSettings />;
    case 'ai':
      return <ChannelSettings />;
    case 'web-search':
      return <WebSearchSettings />;
    case 'plugins':
      return projectId ? <PluginSettings projectId={projectId} /> : (
        <SettingsSection description="MCP 服务和 Skill 都需要绑定到一个项目。" title="插件">
          <SettingsCard divided={false}>
            <p className="px-6 py-10 text-center text-sm text-text-secondary">请先在左侧项目列表中选择一个项目</p>
          </SettingsCard>
        </SettingsSection>
      );
    case 'appearance':
      return <AppearanceSettings />;
  }
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const projectId = useAtomValue(currentProjectIdAtom);

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? '设置';

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部 Header */}
      <header className="flex items-center justify-between gap-6 px-8 h-16 border-b border-border backdrop-blur-xl bg-background/60 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/contour"
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
          <div className="max-w-2xl">{renderTabContent(activeTab, projectId)}</div>
        </main>
      </div>
    </div>
  );
}
