import { useEffect, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { Menu } from 'lucide-react';
import { LeftSidebar } from './LeftSidebar';
import { RightSidePanel } from './RightSidePanel';
import { Button } from '../ui/button';
import { ErrorBoundary } from './ErrorBoundary';
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname]);

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
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground flex">
      <div className="hidden md:block">
        <LeftSidebar onRefresh={onRefresh} projects={projects} />
      </div>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="mobile-navigation-drawer">
          <button
            aria-label="关闭导航"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileNavigationOpen(false)}
            type="button"
          />
          <div className="relative h-full w-[min(320px,86vw)] shadow-xl">
            <LeftSidebar
              forceExpanded
              onClose={() => setMobileNavigationOpen(false)}
              onRefresh={onRefresh}
              projects={projects}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-border bg-surface px-3 md:hidden">
          <Button
            aria-label="打开导航"
            className="h-8 w-8"
            onClick={() => setMobileNavigationOpen(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Menu size={18} />
          </Button>
          <span className="ml-2 text-sm font-semibold text-text-primary">Contour</span>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden bg-background">
          <ErrorBoundary>
            <Outlet context={{ onRefresh, project, projects } satisfies ShellOutletContext} />
          </ErrorBoundary>
        </main>
      </div>

      {showRightPanel ? <RightSidePanel project={project} /> : null}
    </div>
  );
}
