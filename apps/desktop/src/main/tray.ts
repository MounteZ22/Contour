import { Menu, Tray, nativeImage } from 'electron';
import { createTrayMenuTemplate, type RecentProject, type TrayActions } from './tray-menu.js';

export type { RecentProject, TrayActions } from './tray-menu.js';
export function createTray(
  actions: TrayActions,
  loadRecentProjects: () => Promise<RecentProject[]>,
): Tray {
  // Windows 托盘对 SVG dataURL 支持不稳定，使用 16x16 PNG dataURL（蓝色实心圆，深色/浅色主题下均可见）。
  const image = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAXUlEQVR42mPgW/qSgRLMQCsDSvmWvjzDt/TlTyg+AxUjaIAyVPF/HPgMVA1OA/BpRjYEqwGlRGiG4VJsBpwhwYAz2Az4SYIBP2liAMVeoDgQKY5GqiQkipMy/XMjALfyDIOej4PjAAAAAElFTkSuQmCC',
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
