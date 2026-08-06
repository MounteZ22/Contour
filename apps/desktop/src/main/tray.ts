import { Menu, Tray, nativeImage } from 'electron';
import { createTrayMenuTemplate, type RecentProject, type TrayActions } from './tray-menu.js';

export type { RecentProject, TrayActions } from './tray-menu.js';
export function createTray(
  actions: TrayActions,
  loadRecentProjects: () => Promise<RecentProject[]>,
): Tray {
  const image = nativeImage.createFromDataURL(
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="%230ea5e9"/></svg>',
  );
  const tray = new Tray(image);
  tray.setToolTip('Contour');

  const refresh = async (): Promise<void> => {
    let projects: RecentProject[] = [];
    try {
      projects = await loadRecentProjects();
    } catch (error) {
      console.warn('[Contour tray] 无法读取最近项目:', error);
    }
    tray.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate(projects.slice(0, 8), actions)));
  };

  void refresh();
  tray.on('click', () => {
    void refresh().then(() => tray.popUpContextMenu());
  });
  return tray;
}
