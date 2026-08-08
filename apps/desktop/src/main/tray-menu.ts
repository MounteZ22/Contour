import type { MenuItemConstructorOptions } from 'electron';

export interface RecentProject {
  id: string;
  title: string;
}

export interface TrayActions {
  showWindow(): void;
  newAgentSession(): void;
  openProject(projectId: string): void;
  quit(): void;
}

export function createTrayMenuTemplate(
  projects: RecentProject[],
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  return [
    { label: '显示 Contour', click: actions.showWindow },
    { label: '新建 Agent 会话', click: actions.newAgentSession },
    { type: 'separator' },
    { label: '最近项目', enabled: false },
    ...(projects.length > 0
      ? projects.map((project) => ({ label: project.title, click: () => actions.openProject(project.id) }))
      : [{ label: '暂无最近项目', enabled: false }]),
    { type: 'separator' },
    { label: '退出 Contour', click: actions.quit },
  ];
}
