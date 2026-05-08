import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { FlowWorkspacePage } from './pages/FlowWorkspacePage';
import { ProjectDocPage } from './pages/ProjectDocPage';
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
      <div className="loading-screen">
        <p>加载中...</p>
      </div>
    );
  }

  if (error && appData.projects.length === 0) {
    return (
      <div className="loading-screen">
        <p>加载失败: {error}</p>
      </div>
    );
  }

  return (
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
  );
}
