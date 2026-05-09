import { useParams } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
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
          <ThemeToggle />
        </div>
      </header>

      <main className="p-8">
        <Outlet context={{ onRefresh, project, projects }} />
      </main>
    </div>
  );
}
