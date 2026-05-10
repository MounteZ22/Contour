import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { FlowWorkspacePage } from './pages/FlowWorkspacePage';
import { ProjectDocPage } from './pages/ProjectDocPage';
import { ToastContainer } from './components/Toast';
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
        <p className="mt-4 text-sm text-on-surface-variant font-mono">正在加载研究项目...</p>
      </div>
    );
  }

  if (error && appData.projects.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center">
            <AlertCircle size={24} className="text-error" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-on-background font-headline">数据加载失败</h2>
            <p className="mt-1.5 text-sm text-on-surface-variant leading-relaxed">{error}</p>
          </div>
          <button
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium cursor-pointer transition-colors bg-primary-container/15 border-primary/25 text-primary hover:bg-primary-container/30 font-mono"
            onClick={refreshProjects}
            type="button"
          >
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          element={<DashboardPage onRefresh={refreshProjects} projects={appData.projects} />}
          path="/"
        />
        <Route
          element={<AppShell onRefresh={refreshProjects} projects={appData.projects} />}
          path="/project/:projectId/*"
        >
          <Route element={<Navigate replace to="/" />} index />
          <Route element={<FlowWorkspacePage />} path="flows/:flowId" />
          <Route element={<ProjectDocPage />} path="docs/:docId" />
        </Route>
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
      <ToastContainer />
    </>
  );
}
