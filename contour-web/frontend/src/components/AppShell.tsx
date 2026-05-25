import { useParams } from 'react-router-dom';
import { Link, Outlet } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import type { ProjectData } from '../types';

export function AppShell({ onRefresh, projects }: { onRefresh: () => void; projects: ProjectData[] }) {
  const { projectId } = useParams();
  const project = projects.find((p) => p.projectId === projectId) ?? projects[0];

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <main className="p-8">
          <p className="text-on-surface-variant">项目未找到</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between gap-6 px-8 h-16 border-b border-outline-variant backdrop-blur-xl bg-surface/60 sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-on-background font-headline">{project.title}</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-on-surface-variant font-mono">
          <span>{project.currentStage}</span>
          <Link
            to="/settings"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
            title="设置"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">设置</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="p-8">
        <Outlet context={{ onRefresh, project, projects }} />
      </main>
    </div>
  );
}
