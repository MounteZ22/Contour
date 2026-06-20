import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { LeftSidebar } from './LeftSidebar';
import { RightSidePanel } from './RightSidePanel';
import { currentProjectIdAtom, rightPanelOpenAtom } from '../../state/shell';
import type { ProjectData } from '../../types';

export interface ShellOutletContext {
  onRefresh: () => void;
  project?: ProjectData;
  projects: ProjectData[];
}

export function ShellLayout({
  onRefresh,
  projects,
}: {
  onRefresh: () => void;
  projects: ProjectData[];
}) {
  const location = useLocation();
  const { projectId: routeProjectId } = useParams();
  const [currentProjectId, setCurrentProjectId] = useAtom(currentProjectIdAtom);
  const rightPanelOpen = useAtomValue(rightPanelOpenAtom);

  useEffect(() => {
    if (projects.length === 0) return;
    if (routeProjectId && projects.some((project) => project.projectId === routeProjectId)) {
      setCurrentProjectId(routeProjectId);
      return;
    }
    const currentProjectExists = projects.some((project) => project.projectId === currentProjectId);
    if (!currentProjectId || !currentProjectExists) {
      setCurrentProjectId(projects[0].projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, routeProjectId]);

  const project =
    projects.find((item) => item.projectId === routeProjectId) ??
    projects.find((item) => item.projectId === currentProjectId) ??
    projects[0];
  const showRightPanel = location.pathname.startsWith('/agent') && rightPanelOpen && project;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex">
      <LeftSidebar onRefresh={onRefresh} projects={projects} />

      <main className="flex-1 min-w-0 overflow-hidden bg-background">
        <Outlet context={{ onRefresh, project, projects } satisfies ShellOutletContext} />
      </main>

      {showRightPanel ? <RightSidePanel project={project} /> : null}
    </div>
  );
}
