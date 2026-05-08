import { useParams } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import type { ProjectData } from '../types';

export function AppShell({ onRefresh, projects }: { onRefresh: () => void; projects: ProjectData[] }) {
  const { projectId } = useParams();
  const project = projects.find((p) => p.projectId === projectId) ?? projects[0];

  if (!project) {
    return (
      <div className="app-shell">
        <main className="page-frame">
          <p>项目未找到</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Contour</p>
          <h1>{project.title}</h1>
        </div>
        <div className="topbar-meta">
          <span>科研认知工作台</span>
          <span>{project.currentStage}</span>
        </div>
      </header>

      <main className="page-frame">
        <Outlet context={{ onRefresh, project, projects }} />
      </main>
    </div>
  );
}
