import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { PageSkeleton } from './components/ui/PageSkeleton';
import { AgentPageSkeleton } from './components/ui/AgentPageSkeleton';
import { FlowPageSkeleton } from './components/ui/FlowPageSkeleton';
import { ShellLayout } from './components/shell/ShellLayout';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/ui/button';
import type { ContourAppData } from './types';

// Shell 保持在首包中，工作区页面在用户实际访问时再加载。
const AgentSessionView = lazy(() =>
  import('./pages/AgentSessionView').then(({ AgentSessionView }) => ({ default: AgentSessionView })),
);
const AgentView = lazy(() =>
  import('./pages/AgentView').then(({ AgentView }) => ({ default: AgentView })),
);
const ContourView = lazy(() =>
  import('./pages/ContourView').then(({ ContourView }) => ({ default: ContourView })),
);
const FlowWorkspacePage = lazy(() =>
  import('./pages/FlowWorkspacePage').then(({ FlowWorkspacePage }) => ({ default: FlowWorkspacePage })),
);
const ProjectClaimPage = lazy(() =>
  import('./pages/ProjectClaimPage').then(({ ProjectClaimPage }) => ({ default: ProjectClaimPage })),
);
const ProjectDocPage = lazy(() =>
  import('./pages/ProjectDocPage').then(({ ProjectDocPage }) => ({ default: ProjectDocPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage })),
);

function PageLoadingFallback() {
  const location = useLocation();

  // 根据当前路由路径选合适的骨架屏
  if (location.pathname.startsWith('/agent')) {
    return <AgentPageSkeleton />;
  }
  if (location.pathname.includes('/flows/')) {
    return <FlowPageSkeleton />;
  }
  // 路由级 /project/:projectId/docs/:docId /project/:projectId/claims/:claimId
  // 以及 /contour、/settings、/* 共用通用页面骨架
  return <PageSkeleton />;
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>;
}

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
            <Route element={<LazyRoute><ContourView /></LazyRoute>} path="contour" />
            <Route element={<LazyRoute><AgentView /></LazyRoute>} path="agent" />
            <Route element={<LazyRoute><AgentSessionView /></LazyRoute>} path="agent/:sessionId" />
            <Route element={<LazyRoute><FlowWorkspacePage /></LazyRoute>} path="project/:projectId/flows/:flowId" />
            <Route element={<LazyRoute><ProjectClaimPage /></LazyRoute>} path="project/:projectId/claims/:claimId" />
            <Route element={<LazyRoute><ProjectDocPage /></LazyRoute>} path="project/:projectId/docs/:docId" />
            <Route element={<LazyRoute><SettingsPage /></LazyRoute>} path="settings" />
          </Route>
          <Route element={<Navigate replace to="/contour" />} path="*" />
        </Routes>
      </ErrorBoundary>
      <ToastContainer />
    </>
  );
}
