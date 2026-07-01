import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { ShellLayout } from './components/shell/ShellLayout';
import { AgentSessionView } from './pages/AgentSessionView';
import { AgentView } from './pages/AgentView';
import { ContourView } from './pages/ContourView';
import { FlowWorkspacePage } from './pages/FlowWorkspacePage';
import { ProjectClaimPage } from './pages/ProjectClaimPage';
import { ProjectDocPage } from './pages/ProjectDocPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/ui/button';
import type { ContourAppData } from './types';

export default function App() {
  const [appData, setAppData] = useState<ContourAppData>({ projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(() => {
    setLoading(true);
    fetch('/api/project')
      .then((res) => res.json())
      .then((result) => {
        if (result.success && result.data?.projects) {
          setAppData({ projects: result.data.projects });
          setError(null);
        } else {
          setError(result.error || 'Failed to load projects');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  if (loading && appData.projects.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 size={40} className="text-primary animate-spin" />
        <p className="mt-4 text-sm text-muted-foreground font-mono">正在加载研究项目...</p>
      </div>
    );
  }

  if (error && appData.projects.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle size={24} className="text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-headline">数据加载失败</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshProjects}>
            <RefreshCw size={14} />
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route
            element={<ShellLayout onRefresh={refreshProjects} projects={appData.projects} />}
          >
            <Route element={<Navigate replace to="/contour" />} index />
            <Route element={<ContourView />} path="contour" />
            <Route element={<AgentView />} path="agent" />
            <Route element={<AgentSessionView />} path="agent/:sessionId" />
            <Route element={<FlowWorkspacePage />} path="project/:projectId/flows/:flowId" />
            <Route element={<ProjectClaimPage />} path="project/:projectId/claims/:claimId" />
            <Route element={<ProjectDocPage />} path="project/:projectId/docs/:docId" />
            <Route element={<SettingsPage />} path="settings" />
          </Route>
          <Route element={<Navigate replace to="/contour" />} path="*" />
        </Routes>
      </ErrorBoundary>
      <ToastContainer />
    </>
  );
}
