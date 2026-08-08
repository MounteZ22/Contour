import { BrowserWindow, ipcMain } from 'electron';

export const IPC_CHANNELS = {
  minimize: 'contour:window:minimize',
  show: 'contour:window:show',
  close: 'contour:window:close',
  quit: 'contour:app:quit',
  // 主进程 → 渲染进程的单向推送渠道（ipcMain 无对应 handle，供 preload 订阅）。
  newAgentSession: 'contour:tray:new-agent-session',
  projectOpen: 'contour:project:open',
} as const;

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  requestQuit: () => void,
): void {
  ipcMain.handle(IPC_CHANNELS.minimize, () => getMainWindow()?.minimize());
  ipcMain.handle(IPC_CHANNELS.show, () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  ipcMain.handle(IPC_CHANNELS.close, () => getMainWindow()?.hide());
  ipcMain.handle(IPC_CHANNELS.quit, requestQuit);
}
