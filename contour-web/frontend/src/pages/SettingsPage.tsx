import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, Palette, Radio, Settings } from 'lucide-react';
import { ChannelSettings } from '../components/settings/ChannelSettings';

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

function renderTabContent(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case 'general':
      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-base font-semibold text-on-surface font-headline">通用设置</h3>
            <p className="mt-1 text-sm text-on-surface-variant">基础应用配置</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
            <Settings size={32} className="text-outline-variant mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">通用设置即将推出</p>
          </div>
        </div>
      );
    case 'ai':
      return <ChannelSettings />;
    case 'appearance':
      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-base font-semibold text-on-surface font-headline">外观设置</h3>
            <p className="mt-1 text-sm text-on-surface-variant">主题和界面外观</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
            <Palette size={32} className="text-outline-variant mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">外观设置请在页面顶部主题切换器中调整</p>
          </div>
        </div>
      );
  }
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? '设置';

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部 Header */}
      <header className="flex items-center justify-between gap-6 px-8 h-16 border-b border-outline-variant backdrop-blur-xl bg-surface/60 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            <span>返回</span>
          </Link>
          <div className="w-px h-5 bg-outline-variant" />
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-secondary" />
            <h1 className="text-lg font-semibold text-on-background font-headline">设置</h1>
          </div>
        </div>
        <div className="text-sm text-on-surface-variant font-mono">{activeTabLabel}</div>
      </header>

      {/* 主体 */}
      <div className="flex min-h-[calc(100vh-64px)]">
        {/* 左侧导航 */}
        <aside className="w-[200px] border-r border-outline-variant bg-surface-container/50 py-4 px-3 flex-shrink-0">
          <nav className="flex flex-col gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-primary-container/20 text-primary font-medium border border-primary/15'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
                type="button"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
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
